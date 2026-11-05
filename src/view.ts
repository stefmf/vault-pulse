import { ItemView, WorkspaceLeaf } from "obsidian";
import { DateTime } from "luxon";
import type VaultPulsePlugin from "./main";
import { HOVER_LINK_SOURCE } from "./main";
import { buildVaultActivity, fingerprintActivity, fromApp } from "./data";
import type { DayNotes, VaultActivity } from "./data";
import { renderCalendar, updateCalendarCells } from "./calendar";
import type { CalendarOptions } from "./calendar";
import { calendarDays, clampPagerOffset, offsetForDay } from "./calendarGrid";
import { effectiveVisibility } from "./settings";
import {
	renderEmptyState,
	renderHeatmap,
	renderLegend,
	renderPager,
	renderSparkline,
	updateHeatmapCells,
	updateSparklineBars,
} from "./renderer";
import { attachInteractions, InteractionHandle } from "./interactions";
import {
	applyRampToContainer,
	computeColorRamp,
	computeQuantileBuckets,
} from "./colorUtils";
import { renderDetailPanel } from "./detailPanel";
import { computeCarryOverStreak, streakEndingAt } from "./streaks";
import { computeGridStart, toISODate } from "./dateUtils";
import { attachElasticScroll } from "./elasticScroll";
import { burstConfetti } from "./confetti";
import { computeStreakSymbols, StreakSymbols } from "./streakSymbols";
import { t } from "./i18n";
import type { ActivityMap, QuantileBuckets } from "./types";

export const VIEW_TYPE_VAULT_PULSE = "vault-pulse-view";

/** Calendar arrow keys: days to move the selection. */
const CALENDAR_ARROW_DAYS: Record<string, number> = {
	ArrowLeft: -1,
	ArrowRight: 1,
	ArrowUp: -7,
	ArrowDown: 7,
};

/**
 * The event target as an Element, checked with Obsidian's cross-window
 * `instanceOf` so it also works when the pane is in a pop-out window.
 */
function elementFrom(target: EventTarget | null): Element | null {
	const node = target as Node | null;
	return node?.instanceOf(Element) ? node : null;
}

interface StreakWalk {
	count: number;
	isos: string[];
	startIso: string | null;
}

export class VaultPulseView extends ItemView {
	plugin: VaultPulsePlugin;
	private calendarEl!: HTMLElement;
	private gridEl!: HTMLElement;
	private pagerEl!: HTMLElement;
	private sparklineEl!: HTMLElement;
	private legendEl!: HTMLElement;
	private detailEl!: HTMLElement;
	private interactions: InteractionHandle | null = null;
	private gridElasticCleanup: (() => void) | null = null;
	private detailElasticCleanup: (() => void) | null = null;
	private activityMap: ActivityMap = new Map();
	private allActivity: Map<string, number> = new Map();
	private byDay: Map<string, DayNotes> = new Map();
	private selectedIso: string | null = null;
	private pagerOffsetDays = 0;
	/** First day of the month the calendar shows. */
	private shownMonth: DateTime = DateTime.local().startOf("month");
	private lastCalendarStructureKey: string | null = null;
	private heatmapWasVisible = true;
	private previousTodaySymbols: StreakSymbols | null = null;
	private previousSelectedStreakCount = 0;
	private hasRenderedOnce = false;
	private lastRenderKey: string | null = null;
	private lastStructureKey: string | null = null;
	private pendingRender = false;

	constructor(leaf: WorkspaceLeaf, plugin: VaultPulsePlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_VAULT_PULSE;
	}

	getDisplayText(): string {
		return t("view.title");
	}

	getIcon(): string {
		return "layout-grid";
	}

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("vault-pulse-view");
		this.calendarEl = this.contentEl.createDiv("vault-pulse-calendar");
		this.gridEl = this.contentEl.createDiv("vault-pulse-grid-wrapper");
		this.pagerEl = this.contentEl.createDiv("vault-pulse-pager");
		this.sparklineEl = this.contentEl.createDiv("vault-pulse-sparkline");
		this.legendEl = this.contentEl.createDiv("vault-pulse-legend");
		this.detailEl = this.contentEl.createDiv("vault-pulse-detail");

		// The view subscribes to no vault or workspace events: data arrives
		// through `onDataChanged()` from the plugin, and theme changes reach
		// the palette through CSS variables (see colorUtils.computeColorRamp).
		this.registerDomEvent(this.detailEl, "scroll", () => {
			this.detailEl.classList.toggle(
				"is-scrolled",
				this.detailEl.scrollTop > 0
			);
		});

		// Calendar cells and arrows are rebuilt on month changes, so their
		// clicks are handled here, once, by delegation.
		this.registerDomEvent(this.calendarEl, "click", (evt) => {
			this.onCalendarActivate(evt.target);
		});
		this.registerDomEvent(this.calendarEl, "keydown", (evt) => {
			if (evt.key === "Enter" || evt.key === " ") {
				evt.preventDefault();
				this.onCalendarActivate(evt.target);
				return;
			}
			const step = CALENDAR_ARROW_DAYS[evt.key];
			if (step === undefined) return;
			evt.preventDefault();
			this.moveCalendarFocus(evt.target, step);
		});

		// Bootstrap with the plugin's already-cached scan (or a fresh one if
		// the plugin hasn't scanned yet — getLatestScan handles both).
		this.refresh();
		return Promise.resolve();
	}

	/**
	 * Re-render after the view's own state changed (pager, selection, open,
	 * Today). Vault file events arrive via {@link onDataChanged} instead, with
	 * the plugin's scan already in hand; a paged heatmap scans its own window.
	 */
	refresh(): void {
		this.onDataChanged(this.plugin.getLatestScan());
	}

	/**
	 * Primary data-input. Plugin calls this after each scan; the view calls
	 * it itself via `refresh()` when its own state changed.
	 *
	 * Pipeline:
	 *   1. Apply the color palette (CSS variables only).
	 *   2. Take `allActivity` and `byDay` from the plugin's scan (neither
	 *      depends on the pager), sync the pager with the heatmap's
	 *      visibility, and clamp it against the earliest active day.
	 *   3. If the heatmap is paged back, scan its window; otherwise use the
	 *      plugin's scan.
	 *   4. Compute a render fingerprint over everything we'd draw (data, the
	 *      calendar's visible days, selection, pager, shown month, visibility,
	 *      today). If unchanged, skip rendering entirely.
	 *   5. If the pane is hidden, mark a pending render; the plugin's
	 *      `layout-change` hook flushes it when the pane reappears.
	 *   6. Otherwise, render.
	 */
	onDataChanged(pluginScan: VaultActivity): void {
		// The palette is CSS variables only, so it applies before the render
		// key check: a palette change alone repaints both sections without a
		// rebuild, and the calendar gets it even with the heatmap hidden.
		applyRampToContainer(this.contentEl, computeColorRamp(this.plugin.settings));

		this.allActivity = pluginScan.allActivity;
		this.byDay = pluginScan.byDay;
		this.syncPagerWithVisibility();
		// Clamp before choosing the scan, so a paged scan uses the final anchor.
		this.clampPagerOffset();

		this.activityMap = this.scanForCurrentState(pluginScan).windowed;

		const key = this.computeRenderKey();
		if (key === this.lastRenderKey) return;

		if (!this.containerEl.isShown()) {
			this.pendingRender = true;
			return;
		}

		this.doRender();
		this.lastRenderKey = key;
		this.pendingRender = false;
	}

	/**
	 * Called by the plugin on `workspace.layout-change`. If the pane just
	 * became visible and we deferred a render while it was hidden, render now.
	 */
	flushIfPending(): void {
		if (!this.pendingRender || !this.containerEl.isShown()) return;
		this.doRender();
		this.lastRenderKey = this.computeRenderKey();
		this.pendingRender = false;
	}

	/**
	 * A hidden heatmap stays at offset 0, so it never costs a paged scan.
	 * When it is shown again, it pages to the window holding the selection.
	 */
	private syncPagerWithVisibility(): void {
		const visible = effectiveVisibility(this.plugin.settings).heatmap;
		if (!visible) {
			this.pagerOffsetDays = 0;
		} else if (!this.heatmapWasVisible && this.selectedIso) {
			this.pagerOffsetDays = this.offsetShowing(this.selectedIso);
		}
		this.heatmapWasVisible = visible;
	}

	private offsetShowing(iso: string): number {
		const settings = this.plugin.settings;
		return offsetForDay({
			dayIso: iso,
			today: DateTime.local().startOf("day"),
			windowDays: settings.windowDays,
			weekStart: settings.weekStart,
			currentOffset: this.pagerOffsetDays,
			earliestIso: this.earliestActiveIso(),
		});
	}

	private scanForCurrentState(pluginScan: VaultActivity): VaultActivity {
		// Plugin's scan is anchored at real today. When the view is paged
		// backward, we need a scan with an earlier anchor for the windowed
		// map. `allActivity` is anchor-independent so the paged scan picks up
		// the same set as the plugin's scan.
		if (this.pagerOffsetDays === 0) return pluginScan;
		const today = DateTime.local().startOf("day");
		const anchor = today.minus({ days: this.pagerOffsetDays });
		return buildVaultActivity(fromApp(this.app), this.plugin.settings, {
			filters: this.plugin.getFilters(),
			today,
			anchor,
		});
	}

	/**
	 * Stable key composed of every input that affects what we'd draw. Cached
	 * across refreshes; if the next computed key matches the cached one,
	 * `onDataChanged` skips the entire render path. This is the single biggest
	 * win — most file events end up here as no-ops because Obsidian's internal
	 * cache churn doesn't change any visible count.
	 */
	private computeRenderKey(): string {
		const todayIso = toISODate(DateTime.local().startOf("day"));
		const settings = this.plugin.settings;
		const sections = effectiveVisibility(settings);
		const visBits = `${settings.showSparkline ? 1 : 0}${
			settings.showStreakCounter ? 1 : 0
		}${settings.showMiniStats ? 1 : 0}${sections.calendar ? 1 : 0}${
			sections.heatmap ? 1 : 0
		}`;
		return [
			fingerprintActivity(this.activityMap, this.allActivity),
			this.calendarFingerprint(),
			this.selectedDayFingerprint(),
			`d:${todayIso}`,
			`sel:${this.selectedIso ?? ""}`,
			`p:${this.pagerOffsetDays}`,
			`m:${toISODate(this.shownMonth)}`,
			`s:${settings.weekStart}`,
			`v:${visBits}`,
		].join("||");
	}

	/**
	 * Created and modified counts for the 42 days the calendar shows. A note
	 * whose date moves between two shown days changes this even when every
	 * total stays the same.
	 */
	private calendarFingerprint(): string {
		if (!effectiveVisibility(this.plugin.settings).calendar) return "";
		return calendarDays(this.shownMonth, this.plugin.settings.weekStart)
			.map((day) => {
				const notes = this.byDay.get(day.iso);
				return `${notes?.created.length ?? 0}.${notes?.modified.length ?? 0}`;
			})
			.join(",");
	}

	/** The selected day's notes by path and group, so a rename re-renders the list. */
	private selectedDayFingerprint(): string {
		const notes = this.selectedIso ? this.byDay.get(this.selectedIso) : undefined;
		if (!notes) return "";
		const paths = (files: { path: string }[]) => files.map((f) => f.path).join("\n");
		return `${paths(notes.created)}|${paths(notes.modified)}`;
	}

	private doRender(): void {
		const today = DateTime.local().startOf("day");
		const windowEnd = today.minus({ days: this.pagerOffsetDays });
		const totalFiles = this.app.vault.getMarkdownFiles().length;
		const sections = effectiveVisibility(this.plugin.settings);

		this.calendarEl.classList.toggle("is-hidden", !sections.calendar);
		for (const el of [this.gridEl, this.sparklineEl, this.legendEl]) {
			el.classList.toggle("is-hidden", !sections.heatmap);
		}

		if (totalFiles === 0) {
			this.fullClearGrid();
			this.calendarEl.empty();
			this.lastCalendarStructureKey = null;
			renderEmptyState(
				sections.heatmap ? this.gridEl : this.calendarEl,
				t("detail.emptyVault")
			);
			this.pagerEl.empty();
			this.pagerEl.classList.add("is-hidden");
			this.sparklineEl.empty();
			this.legendEl.empty();
			this.detailEl.empty();
			this.lastStructureKey = null;
			return;
		}

		if (!this.selectedIso) {
			this.selectedIso = toISODate(windowEnd);
		}

		if (sections.calendar) {
			this.renderCalendarSection();
		} else {
			this.calendarEl.empty();
			this.lastCalendarStructureKey = null;
		}

		if (sections.heatmap) {
			this.renderHeatmapSection(windowEnd);
		} else {
			// Hidden means not rendered: no cells, pager, sparkline or legend.
			this.fullClearGrid();
			this.pagerEl.empty();
			this.pagerEl.classList.add("is-hidden");
			this.sparklineEl.empty();
			this.legendEl.empty();
			this.lastStructureKey = null;
		}

		this.renderSelection();
	}

	/**
	 * Build the calendar, or update its cells in place when the shown month
	 * and week start are unchanged. Kept apart from the heatmap's structure
	 * key, so a month change never rebuilds the heatmap or resets its scroll.
	 */
	private renderCalendarSection(): void {
		const options = this.calendarOptions();
		const key = `${toISODate(this.shownMonth)}|${options.weekStart}`;
		const canUpdateInPlace =
			key === this.lastCalendarStructureKey &&
			this.calendarEl.querySelector(".vault-pulse-calendar-day") !== null;
		if (canUpdateInPlace) {
			updateCalendarCells(options);
		} else {
			renderCalendar(options);
			this.lastCalendarStructureKey = key;
		}
	}

	private calendarOptions(): CalendarOptions {
		return {
			container: this.calendarEl,
			month: this.shownMonth,
			weekStart: this.plugin.settings.weekStart,
			todayIso: toISODate(DateTime.local().startOf("day")),
			selectedIso: this.selectedIso,
			byDay: this.byDay,
		};
	}

	private renderHeatmapSection(windowEnd: DateTime): void {
		const buckets = computeQuantileBuckets(this.activityMap);

		const structureKey = this.computeStructureKey(windowEnd);
		const canUpdateInPlace =
			structureKey === this.lastStructureKey &&
			this.gridEl.querySelector(".vault-pulse-heatmap") !== null;

		if (canUpdateInPlace) {
			// Same dates as last render → just refresh attributes on existing
			// cells. Saves the cost of tearing down + rebuilding 365+ DOM
			// nodes when only counts changed.
			updateHeatmapCells(this.gridEl, this.activityMap, buckets);
			if (this.plugin.settings.showSparkline) {
				// If the user just toggled the sparkline ON (was OFF), no bars
				// exist yet — fall back to a full sparkline render. Otherwise
				// in-place update preserves bars + their click handlers.
				const hasBars =
					this.sparklineEl.querySelector(
						".vault-pulse-sparkline-bar"
					) !== null;
				if (hasBars) {
					updateSparklineBars(
						this.sparklineEl,
						this.activityMap,
						buckets,
						windowEnd
					);
				} else {
					this.renderSparklineIfVisible(buckets, windowEnd);
				}
			} else {
				this.sparklineEl.empty();
			}
		} else {
			// Structural change (pager move, day rollover, window resize,
			// settings flip) — full rebuild.
			this.fullClearGrid();
			renderHeatmap({
				container: this.gridEl,
				activityMap: this.activityMap,
				buckets,
				settings: this.plugin.settings,
				today: windowEnd,
			});
			this.renderSparklineIfVisible(buckets, windowEnd);
			this.lastStructureKey = structureKey;

			this.interactions = attachInteractions({
				container: this.gridEl,
				onCellSelect: (iso) => this.selectDay(iso),
			});

			const heatmap = this.gridEl.querySelector<HTMLElement>(
				".vault-pulse-heatmap"
			);
			if (heatmap) {
				this.gridElasticCleanup = attachElasticScroll(
					this.gridEl,
					heatmap,
					"x"
				);
			}

			this.gridEl.win.requestAnimationFrame(() => {
				this.gridEl.scrollLeft = this.gridEl.scrollWidth;
			});
		}

		this.renderPager(windowEnd);
		renderLegend(this.legendEl);
	}

	/**
	 * The one path for picking a day, from a calendar cell, a heatmap cell or
	 * a sparkline bar. Both views then show it: the calendar moves to its
	 * month, and the heatmap pages only if the day is outside its grid.
	 */
	private selectDay(iso: string): void {
		const sections = effectiveVisibility(this.plugin.settings);
		this.selectedIso = iso;
		const month = DateTime.fromISO(iso).startOf("month");
		const monthChanged = !month.hasSame(this.shownMonth, "month");
		this.shownMonth = month;

		if (sections.heatmap) {
			const offset = this.offsetShowing(iso);
			if (offset !== this.pagerOffsetDays) {
				this.pagerOffsetDays = offset;
				this.refresh();
				this.revealSelectedHeatmapCell();
				return;
			}
		}

		if (sections.calendar && monthChanged) this.renderCalendarSection();
		this.renderSelection();
		if (sections.heatmap) this.revealSelectedHeatmapCell();
		this.lastRenderKey = this.computeRenderKey();
	}

	/** Calendar arrows change the shown month only, never the selection. */
	private shiftShownMonth(months: number): void {
		this.shownMonth = this.shownMonth.plus({ months }).startOf("month");
		this.renderCalendarSection();
		this.lastRenderKey = this.computeRenderKey();
	}

	private onCalendarActivate(target: EventTarget | null): void {
		const el = elementFrom(target);
		if (!el) return;
		const arrow = el.closest<HTMLElement>("[data-action]");
		if (arrow) {
			this.shiftShownMonth(arrow.dataset.action === "prev" ? -1 : 1);
			return;
		}
		const cell = el.closest<HTMLElement>(".vault-pulse-calendar-day");
		const iso = cell?.dataset.date;
		if (iso) this.selectDay(iso);
	}

	/**
	 * Arrow keys in the calendar select the neighbouring day (±1 for left and
	 * right, ±7 for up and down), moving to the next month when needed, and
	 * keep keyboard focus on the newly selected cell.
	 */
	private moveCalendarFocus(target: EventTarget | null, days: number): void {
		const cell = elementFrom(target)?.closest<HTMLElement>(".vault-pulse-calendar-day");
		const from = cell?.dataset.date ?? this.selectedIso;
		if (!from) return;
		const nextIso = toISODate(DateTime.fromISO(from).plus({ days }));
		this.selectDay(nextIso);
		this.calendarEl
			.querySelector<HTMLElement>(`.vault-pulse-calendar-day[data-date="${nextIso}"]`)
			?.focus();
	}

	private heatmapCell(iso: string): HTMLElement | null {
		return this.gridEl.querySelector<HTMLElement>(
			`.vault-pulse-cell[data-date="${iso}"]`
		);
	}

	/**
	 * Scroll the heatmap sideways, if needed, so the selected cell is in view.
	 * Runs after any rebuild's own scroll-to-end in the same frame.
	 */
	private revealSelectedHeatmapCell(): void {
		this.gridEl.win.requestAnimationFrame(() => {
			if (!this.selectedIso) return;
			const cell = this.heatmapCell(this.selectedIso);
			if (!cell) return;
			const grid = this.gridEl.getBoundingClientRect();
			const box = cell.getBoundingClientRect();
			const margin = box.width * 2;
			if (box.left < grid.left) {
				this.gridEl.scrollLeft -= grid.left - box.left + margin;
			} else if (box.right > grid.right) {
				this.gridEl.scrollLeft += box.right - grid.right + margin;
			}
		});
	}

	private fullClearGrid(): void {
		if (this.interactions) {
			this.interactions.teardown();
			this.interactions = null;
		}
		if (this.gridElasticCleanup) {
			this.gridElasticCleanup();
			this.gridElasticCleanup = null;
		}
		this.gridEl.empty();
	}

	/**
	 * Stable key over the inputs that would change which dates appear in the
	 * grid. When unchanged, `doRender` updates cell attributes in place.
	 * `e:` (windowEnd) covers both pager moves AND midnight day-rolls.
	 */
	private computeStructureKey(windowEnd: DateTime): string {
		const settings = this.plugin.settings;
		return [
			`w:${settings.windowDays}`,
			`s:${settings.weekStart}`,
			`e:${toISODate(windowEnd)}`,
		].join("|");
	}

	/**
	 * Called by the "Jump to today" command and the Today button in the
	 * detail panel header. Selects today through the shared path, which
	 * resets a paged heatmap (today is never in a paged-back grid) and turns
	 * the calendar to this month, then scrolls the heatmap home.
	 */
	scrollToToday(): void {
		const todayIso = toISODate(DateTime.local().startOf("day"));
		this.selectDay(todayIso);
		this.gridEl.win.requestAnimationFrame(() => {
			this.gridEl.scrollLeft = this.gridEl.scrollWidth;
			this.heatmapCell(todayIso)?.focus();
		});
	}

	private renderSparklineIfVisible(
		buckets: QuantileBuckets,
		windowEnd: DateTime
	): void {
		if (!this.plugin.settings.showSparkline) {
			this.sparklineEl.empty();
			return;
		}

		renderSparkline({
			container: this.sparklineEl,
			activityMap: this.activityMap,
			buckets,
			today: windowEnd,
			onSelect: (iso) => this.selectDay(iso),
		});
	}

	private renderPager(windowEnd: DateTime): void {
		const settings = this.plugin.settings;
		const gridStart = computeGridStart(
			windowEnd,
			settings.weekStart,
			settings.windowDays
		);
		const gridStartIso = toISODate(gridStart);
		const earliestIso = this.earliestActiveIso();

		const canPrev = earliestIso != null && earliestIso < gridStartIso;
		const canNext = this.pagerOffsetDays > 0;
		const visible = canPrev || canNext;

		renderPager({
			container: this.pagerEl,
			visible,
			canPrev,
			canNext,
			rangeLabel: formatWindowRange(gridStart, windowEnd),
			prevLabel: t("detail.pagerPrev"),
			nextLabel: t("detail.pagerNext"),
			onPrev: () => this.stepPager(+1),
			onNext: () => this.stepPager(-1),
		});
	}

	private stepPager(direction: 1 | -1): void {
		const today = DateTime.local().startOf("day");
		const windowDays = this.plugin.settings.windowDays;
		const desired = this.pagerOffsetDays + direction * windowDays;
		this.pagerOffsetDays = this.clampOffset(desired, today);

		const newWindowEnd = today.minus({ days: this.pagerOffsetDays });
		this.selectedIso = toISODate(newWindowEnd);
		// The pager selects the window's newest day; the calendar follows it.
		this.shownMonth = newWindowEnd.startOf("month");
		this.refresh();
	}

	private clampPagerOffset(): void {
		const today = DateTime.local().startOf("day");
		this.pagerOffsetDays = this.clampOffset(this.pagerOffsetDays, today);
	}

	private clampOffset(offset: number, today: DateTime): number {
		return clampPagerOffset(offset, today, this.earliestActiveIso());
	}

	private earliestActiveIso(): string | null {
		if (this.allActivity.size === 0) return null;
		let earliest: string | null = null;
		for (const iso of this.allActivity.keys()) {
			if (earliest === null || iso < earliest) earliest = iso;
		}
		return earliest;
	}

	private renderSelection(): void {
		// aria-selected rather than `.is-selected`, which some themes restyle
		// globally (see AGENTS.md).
		const previous = this.gridEl.querySelector<HTMLElement>(
			'.vault-pulse-cell[aria-selected="true"]'
		);
		if (previous) {
			previous.removeAttribute("aria-selected");
			previous.tabIndex = -1;
		}

		if (this.selectedIso) {
			const cell = this.heatmapCell(this.selectedIso);
			if (cell) {
				cell.setAttribute("aria-selected", "true");
				cell.tabIndex = 0;
			}
		}

		const todayIso = toISODate(DateTime.local().startOf("day"));
		const selectedStreak = this.selectedIso
			? this.streakWalk(this.selectedIso)
			: { count: 0, isos: [], startIso: null };
		// Yesterday's still-warm streak, surfaced only when today is empty.
		// Drives the desaturated chip + today-cell tint + status-bar fallback.
		const carryOver = computeCarryOverStreak(this.allActivity, todayIso);
		this.updateTodayCellPending(carryOver);

		void this.maintainLongestStreak(selectedStreak.count);

		if (effectiveVisibility(this.plugin.settings).calendar) {
			updateCalendarCells(this.calendarOptions());
		}

		const notes = this.selectedIso ? this.byDay.get(this.selectedIso) : undefined;
		renderDetailPanel({
			container: this.detailEl,
			iso: this.selectedIso,
			created: notes?.created ?? [],
			modified: notes?.modified ?? [],
			streakCount: selectedStreak.count,
			streakStartIso: selectedStreak.startIso,
			longestStreak: this.plugin.settings.longestStreak,
			recentStats: this.computeRecentStats(),
			isToday: this.selectedIso === todayIso,
			showStreakCounter: this.plugin.settings.showStreakCounter,
			showMiniStats: this.plugin.settings.showMiniStats,
			carryOver,
			onOpen: (file, target) => {
				void this.app.workspace.openLinkText(file.path, "", target);
			},
			onJumpToToday: () => this.scrollToToday(),
			onHoverPreview: (file, evt, targetEl) => {
				this.app.workspace.trigger("hover-link", {
					event: evt,
					source: HOVER_LINK_SOURCE,
					hoverParent: this.detailEl,
					targetEl,
					linktext: file.path,
					sourcePath: "",
				});
			},
		});

		this.playStreakTickIfGrew(selectedStreak.count);
		this.fireTierBurstIfAdvanced();

		this.previousSelectedStreakCount = selectedStreak.count;
		this.hasRenderedOnce = true;

		if (this.detailElasticCleanup) {
			this.detailElasticCleanup();
			this.detailElasticCleanup = null;
		}
		const list = this.detailEl.querySelector<HTMLElement>(
			".vault-pulse-detail-list"
		);
		if (list) {
			this.detailElasticCleanup = attachElasticScroll(this.detailEl, list, "y");
		}
	}

	private playStreakTickIfGrew(currentCount: number): void {
		if (!this.hasRenderedOnce) return;
		if (currentCount <= this.previousSelectedStreakCount) return;
		const text = this.detailEl.querySelector<HTMLElement>(
			".vault-pulse-streak-text"
		);
		if (!text) return;
		text.classList.remove("is-ticking");
		// Force reflow so the animation re-triggers when the class re-adds.
		void text.offsetWidth;
		text.classList.add("is-ticking");
		window.setTimeout(() => text.classList.remove("is-ticking"), 400);
	}

	private fireTierBurstIfAdvanced(): void {
		const todayStreak = this.computeTodayStreak();
		const currentSymbols = computeStreakSymbols(todayStreak.count);
		const previous = this.previousTodaySymbols;
		this.previousTodaySymbols = currentSymbols;

		if (!this.hasRenderedOnce || !previous) return;

		const flameAdvanced = currentSymbols.flames > previous.flames;
		const trophyAdvanced = currentSymbols.trophies > previous.trophies;
		if (!flameAdvanced && !trophyAdvanced) return;

		const streakEl = this.detailEl.querySelector<HTMLElement>(
			".vault-pulse-detail-streak"
		);
		if (!streakEl) return;

		// Trophy advancement earns a grander celebration — more pieces, gold
		// palette, bigger ripple — because hitting a year is a qualitatively
		// different milestone than stepping through the flame tiers.
		const grand = trophyAdvanced;
		streakEl.dataset.burst = grand ? "grand" : "1";
		burstConfetti(streakEl, { grand });
		// Keep the data-burst attribute until the ripple animation fully
		// completes — durations match the CSS keyframe lengths + a small
		// buffer so the :before pseudo has time to fade out cleanly.
		window.setTimeout(
			() => {
				delete streakEl.dataset.burst;
			},
			grand ? 2220 : 1520
		);
	}

	private async maintainLongestStreak(current: number): Promise<void> {
		const observed = Math.max(current, this.computeLongestStreak());
		if (observed > this.plugin.settings.longestStreak) {
			this.plugin.settings.longestStreak = observed;
			// Write directly rather than saveSettings() — the latter re-renders
			// all views and we're already mid-render.
			await this.plugin.saveData(this.plugin.settings);
		}
	}

	/**
	 * Longest consecutive run of active days in the vault — NOT bounded by the
	 * heatmap window. Sorts the full set of active ISOs and counts consecutive
	 * spans so a 2-year streak reports honestly even if only the last 365 days
	 * are rendered on the grid.
	 */
	private computeLongestStreak(): number {
		if (this.allActivity.size === 0) return 0;
		const sorted = [...this.allActivity.keys()].sort();
		let best = 1;
		let run = 1;
		for (let i = 1; i < sorted.length; i++) {
			const prev = DateTime.fromISO(sorted[i - 1]);
			const curr = DateTime.fromISO(sorted[i]);
			if (curr.diff(prev, "days").days === 1) {
				run += 1;
			} else {
				run = 1;
			}
			if (run > best) best = run;
		}
		return best;
	}

	/**
	 * Week / month / year file counts relative to real today — not the
	 * selected day. "This week" is the last 7 days inclusive (avoids
	 * weekStart ambiguity); "this month" and "this year" are calendar-based.
	 * All three read from the unbounded `allActivity` so the numbers stay
	 * honest when the window is smaller than 365 days.
	 */
	private computeRecentStats(): { week: number; month: number; year: number } {
		const today = DateTime.local().startOf("day");
		const weekStart = today.minus({ days: 6 });
		const monthStart = today.startOf("month");
		const yearStart = today.startOf("year");
		let week = 0;
		let month = 0;
		let year = 0;
		for (const [iso, count] of this.allActivity) {
			const dt = DateTime.fromISO(iso);
			if (!dt.isValid || dt > today) continue;
			if (dt >= yearStart) year += count;
			if (dt >= monthStart) month += count;
			if (dt >= weekStart) week += count;
		}
		return { week, month, year };
	}

	private computeTodayStreak(): StreakWalk {
		const todayIso = toISODate(DateTime.local().startOf("day"));
		return this.streakWalk(todayIso);
	}

	/**
	 * Mark / unmark today's grid cell with `data-streak-pending="1"` so the
	 * CSS rule tints its outline yellow when yesterday's run is still alive
	 * but unaddressed today. Cheap to call on every renderSelection — it's a
	 * single querySelector + attribute toggle, no rebuild.
	 */
	private updateTodayCellPending(carryOver: { count: number } | null): void {
		const todayIso = toISODate(DateTime.local().startOf("day"));
		const cell = this.heatmapCell(todayIso);
		if (!cell) return;
		const shouldMark = carryOver !== null && carryOver.count >= 2;
		if (shouldMark) cell.dataset.streakPending = "1";
		else delete cell.dataset.streakPending;
	}

	private streakWalk(iso: string): StreakWalk {
		const isos = streakEndingAt(this.allActivity, iso);
		return { count: isos.length, isos, startIso: isos[0] ?? null };
	}

	onClose(): Promise<void> {
		if (this.interactions) {
			this.interactions.teardown();
			this.interactions = null;
		}
		if (this.gridElasticCleanup) {
			this.gridElasticCleanup();
			this.gridElasticCleanup = null;
		}
		if (this.detailElasticCleanup) {
			this.detailElasticCleanup();
			this.detailElasticCleanup = null;
		}
		return Promise.resolve();
	}
}

/**
 * Render a window's date range as a compact label: `May 2025 – Apr 2026` for
 * a year span; `Jan – Apr 2026` when the span fits inside one calendar year;
 * `Apr 2026` when start and end share the same month. Narrow enough for the
 * sidebar at any window length.
 */
function formatWindowRange(start: DateTime, end: DateTime): string {
	const startMonth = start.toFormat("MMM");
	const endMonth = end.toFormat("MMM");
	if (startMonth === endMonth && start.year === end.year) {
		return `${endMonth} ${end.year}`;
	}
	if (start.year === end.year) {
		return `${startMonth} – ${endMonth} ${end.year}`;
	}
	return `${startMonth} ${start.year} – ${endMonth} ${end.year}`;
}
