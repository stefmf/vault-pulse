import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import { DateTime } from "luxon";
import type VaultPulsePlugin from "./main";
import { HOVER_LINK_SOURCE } from "./main";
import { buildVaultActivity, fingerprintActivity, fromApp } from "./data";
import type { VaultActivity } from "./data";
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
import { computeCarryOverStreak } from "./streaks";
import { computeGridStart, toISODate } from "./dateUtils";
import { attachElasticScroll } from "./elasticScroll";
import { burstConfetti } from "./confetti";
import { computeStreakSymbols, StreakSymbols } from "./streakSymbols";
import { t } from "./i18n";
import type { ActivityMap, QuantileBuckets } from "./types";

export const VIEW_TYPE_VAULT_PULSE = "vault-pulse-view";

interface StreakWalk {
	count: number;
	isos: string[];
	startIso: string | null;
}

export class VaultPulseView extends ItemView {
	plugin: VaultPulsePlugin;
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
	private selectedIso: string | null = null;
	private pagerOffsetDays = 0;
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
		this.gridEl = this.contentEl.createDiv("vault-pulse-grid-wrapper");
		this.pagerEl = this.contentEl.createDiv("vault-pulse-pager");
		this.sparklineEl = this.contentEl.createDiv("vault-pulse-sparkline");
		this.legendEl = this.contentEl.createDiv("vault-pulse-legend");
		this.detailEl = this.contentEl.createDiv("vault-pulse-detail");

		// css-change is the only event the view subscribes to directly. Theme
		// swaps don't change the data — they change the CSS color ramp — so
		// we just re-apply the ramp; CSS variables propagate without any DOM
		// rebuild. Vault / metadata events all flow through the plugin via
		// `onDataChanged()`.
		this.registerEvent(
			this.app.workspace.on("css-change", () => {
				if (!this.containerEl.isShown()) return;
				applyRampToContainer(
					this.contentEl,
					computeColorRamp(this.plugin.settings)
				);
			})
		);

		this.registerDomEvent(this.detailEl, "scroll", () => {
			this.detailEl.classList.toggle(
				"is-scrolled",
				this.detailEl.scrollTop > 0
			);
		});

		// Bootstrap with the plugin's already-cached scan (or a fresh one if
		// the plugin hasn't scanned yet — getLatestScan handles both).
		this.refresh();
		return Promise.resolve();
	}

	/**
	 * Re-render with a scan tailored to current view state. Called by
	 * `scrollToToday`, `stepPager`, `onOpen` — whenever the view itself needs
	 * fresh data outside the plugin's event-driven flow. Vault file events
	 * arrive via {@link onDataChanged} instead, with a scan already in hand.
	 */
	refresh(): void {
		this.onDataChanged(this.runViewScan());
	}

	/**
	 * Primary data-input. Plugin calls this after each scan; the view calls
	 * it itself via `refresh()` when its own state (pager, settings) changed.
	 *
	 * Pipeline:
	 *   1. Replace `allActivity` + `activityMap` with the (possibly re-anchored)
	 *      scan output.
	 *   2. Clamp pager offset against the new earliest-active day.
	 *   3. Compute a render fingerprint that captures *everything affecting
	 *      what we'd draw* — data, selection, pager, visibility toggles,
	 *      current calendar day. If unchanged, skip rendering entirely.
	 *   4. If pane is hidden, mark a pending render and return; the plugin's
	 *      `layout-change` hook flushes it when the pane reappears.
	 *   5. Otherwise, render.
	 */
	onDataChanged(pluginScan: VaultActivity): void {
		const activeScan = this.scanForCurrentState(pluginScan);
		this.allActivity = activeScan.allActivity;
		this.activityMap = activeScan.windowed;
		this.clampPagerOffset();

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

	private scanForCurrentState(pluginScan: VaultActivity): VaultActivity {
		// Plugin's scan is anchored at real today. When the view is paged
		// backward, we need a scan with an earlier anchor for the windowed
		// map. `allActivity` is anchor-independent so the paged scan picks up
		// the same set as the plugin's scan.
		if (this.pagerOffsetDays === 0) return pluginScan;
		return this.runViewScan();
	}

	private runViewScan(): VaultActivity {
		const today = DateTime.local().startOf("day");
		if (this.pagerOffsetDays === 0) {
			return this.plugin.getLatestScan();
		}
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
		const visBits = `${settings.showSparkline ? 1 : 0}${
			settings.showStreakCounter ? 1 : 0
		}${settings.showMiniStats ? 1 : 0}`;
		return [
			fingerprintActivity(this.activityMap, this.allActivity),
			`d:${todayIso}`,
			`sel:${this.selectedIso ?? ""}`,
			`p:${this.pagerOffsetDays}`,
			`v:${visBits}`,
		].join("||");
	}

	private doRender(): void {
		const today = DateTime.local().startOf("day");
		const windowEnd = today.minus({ days: this.pagerOffsetDays });
		const totalFiles = this.app.vault.getMarkdownFiles().length;

		if (totalFiles === 0) {
			this.fullClearGrid();
			renderEmptyState(this.gridEl, t("detail.emptyVault"));
			this.pagerEl.empty();
			this.pagerEl.classList.add("is-hidden");
			this.sparklineEl.empty();
			this.legendEl.empty();
			this.detailEl.empty();
			this.lastStructureKey = null;
			return;
		}

		const buckets = computeQuantileBuckets(this.activityMap);
		applyRampToContainer(this.contentEl, computeColorRamp(this.plugin.settings));

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
				onCellSelect: (iso) => {
					this.selectedIso = iso;
					this.renderSelection();
					// Selection change re-renders the detail panel only; bump
					// the render key so the next data-driven refresh doesn't
					// think we're still on the previous selection.
					this.lastRenderKey = this.computeRenderKey();
				},
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

			requestAnimationFrame(() => {
				this.gridEl.scrollLeft = this.gridEl.scrollWidth;
			});
		}

		if (!this.selectedIso) {
			this.selectedIso = toISODate(windowEnd);
		}

		this.renderPager(windowEnd);
		renderLegend(this.legendEl);
		this.renderSelection();
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
	 * detail panel header. Resets any paged offset and selects today so the
	 * user returns to the live view in one click.
	 */
	scrollToToday(): void {
		const wasPaged = this.pagerOffsetDays > 0;
		this.pagerOffsetDays = 0;
		this.selectedIso = toISODate(DateTime.local().startOf("day"));

		if (wasPaged) {
			// Grid needs to rebuild around the new window end.
			this.refresh();
			return;
		}

		this.renderSelection();
		this.lastRenderKey = this.computeRenderKey();
		requestAnimationFrame(() => {
			this.gridEl.scrollLeft = this.gridEl.scrollWidth;
			const cell = this.gridEl.querySelector<HTMLElement>(
				`.vault-pulse-cell[data-date="${this.selectedIso}"]`
			);
			cell?.focus();
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
			onSelect: (iso) => {
				this.selectedIso = iso;
				this.renderSelection();
				this.lastRenderKey = this.computeRenderKey();
			},
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
		this.refresh();
	}

	private clampPagerOffset(): void {
		const today = DateTime.local().startOf("day");
		this.pagerOffsetDays = this.clampOffset(this.pagerOffsetDays, today);
	}

	private clampOffset(offset: number, today: DateTime): number {
		const earliestIso = this.earliestActiveIso();
		if (!earliestIso) return 0;
		// Cap at (today − earliest) so windowEnd = today − offset never slips
		// below the earliest active day; at the cap, earliest sits at the
		// grid's right edge and the pager's prev button disables.
		const earliest = DateTime.fromISO(earliestIso);
		const maxOffset = Math.max(
			0,
			Math.floor(today.diff(earliest, "days").days)
		);
		return Math.max(0, Math.min(offset, maxOffset));
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
		const previous = this.gridEl.querySelector<HTMLElement>(
			".vault-pulse-cell.is-selected"
		);
		if (previous) {
			previous.classList.remove("is-selected");
			previous.tabIndex = -1;
		}

		if (this.selectedIso) {
			const cell = this.gridEl.querySelector<HTMLElement>(
				`.vault-pulse-cell[data-date="${this.selectedIso}"]`
			);
			if (cell) {
				cell.classList.add("is-selected");
				cell.tabIndex = 0;
			}
		}

		const todayIso = toISODate(DateTime.local().startOf("day"));
		const selectedStreak = this.selectedIso
			? this.computeStreakEndingAt(this.selectedIso)
			: { count: 0, isos: [], startIso: null };
		// Yesterday's still-warm streak, surfaced only when today is empty.
		// Drives the desaturated chip + today-cell tint + status-bar fallback.
		const carryOver = computeCarryOverStreak(this.allActivity, todayIso);
		this.updateTodayCellPending(carryOver);

		void this.maintainLongestStreak(selectedStreak.count);

		renderDetailPanel({
			container: this.detailEl,
			iso: this.selectedIso,
			day: this.selectedIso
				? this.activityMap.get(this.selectedIso)
				: undefined,
			streakCount: selectedStreak.count,
			streakStartIso: selectedStreak.startIso,
			longestStreak: this.plugin.settings.longestStreak,
			recentStats: this.computeRecentStats(),
			isToday: this.selectedIso === todayIso,
			showStreakCounter: this.plugin.settings.showStreakCounter,
			showMiniStats: this.plugin.settings.showMiniStats,
			carryOver,
			onOpen: (file: TFile) => {
				void this.app.workspace.openLinkText(file.path, "", false);
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
		return this.computeStreakEndingAt(todayIso);
	}

	/**
	 * Mark / unmark today's grid cell with `data-streak-pending="1"` so the
	 * CSS rule tints its outline yellow when yesterday's run is still alive
	 * but unaddressed today. Cheap to call on every renderSelection — it's a
	 * single querySelector + attribute toggle, no rebuild.
	 */
	private updateTodayCellPending(carryOver: { count: number } | null): void {
		const todayIso = toISODate(DateTime.local().startOf("day"));
		const cell = this.gridEl.querySelector<HTMLElement>(
			`.vault-pulse-cell[data-date="${todayIso}"]`
		);
		if (!cell) return;
		const shouldMark = carryOver !== null && carryOver.count >= 2;
		if (shouldMark) cell.dataset.streakPending = "1";
		else delete cell.dataset.streakPending;
	}

	private computeStreakEndingAt(iso: string): StreakWalk {
		if (!this.allActivity.has(iso)) {
			return { count: 0, isos: [], startIso: null };
		}

		const isos: string[] = [iso];
		let cursor = DateTime.fromISO(iso).minus({ days: 1 });
		for (;;) {
			const key = toISODate(cursor);
			if (!this.allActivity.has(key)) break;
			isos.push(key);
			cursor = cursor.minus({ days: 1 });
		}
		// Chronological order: oldest → newest.
		isos.reverse();
		return {
			count: isos.length,
			isos,
			startIso: isos[0] ?? null,
		};
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
