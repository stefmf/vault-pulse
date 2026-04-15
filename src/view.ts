import { ItemView, TFile, WorkspaceLeaf, debounce } from "obsidian";
import { DateTime } from "luxon";
import type VaultPulsePlugin from "./main";
import { HOVER_LINK_SOURCE } from "./main";
import { buildVaultActivity, fromApp } from "./data";
import {
	renderEmptyState,
	renderHeatmap,
	renderLegend,
	renderPager,
	renderSparkline,
} from "./renderer";
import { attachInteractions, InteractionHandle } from "./interactions";
import {
	applyRampToContainer,
	computeColorRamp,
	computeQuantileBuckets,
} from "./colorUtils";
import { renderDetailPanel } from "./detailPanel";
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
	private scheduleRefresh: () => void;
	private activityMap: ActivityMap = new Map();
	private allActivity: Map<string, number> = new Map();
	private selectedIso: string | null = null;
	private pagerOffsetDays = 0;
	private previousTodaySymbols: StreakSymbols | null = null;
	private previousSelectedStreakCount = 0;
	private hasRenderedOnce = false;

	constructor(leaf: WorkspaceLeaf, plugin: VaultPulsePlugin) {
		super(leaf);
		this.plugin = plugin;
		// Trailing-edge debounce: a burst of file events (e.g. Obsidian Git
		// committing 50 files) collapses into one refresh 200ms after the
		// burst settles, instead of firing at the leading edge + trailing edge
		// and double-scanning the vault.
		this.scheduleRefresh = debounce(() => this.refresh(), 200);
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

		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.scheduleRefresh())
		);
		this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
		this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));
		this.registerEvent(
			this.app.workspace.on("css-change", () => this.scheduleRefresh())
		);

		this.registerDomEvent(this.detailEl, "scroll", () => {
			this.detailEl.classList.toggle(
				"is-scrolled",
				this.detailEl.scrollTop > 0
			);
		});

		this.refresh();
		return Promise.resolve();
	}

	refresh(): void {
		if (this.interactions) {
			this.interactions.teardown();
			this.interactions = null;
		}
		if (this.gridElasticCleanup) {
			this.gridElasticCleanup();
			this.gridElasticCleanup = null;
		}

		this.gridEl.empty();

		const today = DateTime.local().startOf("day");
		const source = fromApp(this.app);

		// Clamp the pager offset to a reasonable range BEFORE we scan — but
		// the clamp depends on `earliestActiveIso()`, which needs `allActivity`.
		// Do a cheap pre-scan sized to just allActivity so the pager clamp is
		// accurate, then the real scan below produces the final paged window.
		// In the common (unpaged) case the pre-scan result IS the final result
		// and we only pay once.
		let scan = buildVaultActivity(source, this.plugin.settings);
		this.allActivity = scan.allActivity;
		this.clampPagerOffset();

		const windowEnd = today.minus({ days: this.pagerOffsetDays });

		if (this.pagerOffsetDays > 0) {
			// Paged view — rebuild the windowed map anchored at the earlier
			// date. `allActivity` from the first scan is still correct
			// (unbounded at real today).
			scan = buildVaultActivity(source, this.plugin.settings, {
				today,
				anchor: windowEnd,
			});
		}

		this.activityMap = scan.windowed;

		const todayIsoForCache = toISODate(today);
		this.plugin.publishScanCache(
			this.allActivity,
			this.allActivity.get(todayIsoForCache) ?? 0
		);
		const totalFiles = this.app.vault.getMarkdownFiles().length;

		if (totalFiles === 0) {
			renderEmptyState(this.gridEl, t("detail.emptyVault"));
			this.pagerEl.empty();
			this.pagerEl.classList.add("is-hidden");
			this.sparklineEl.empty();
			this.legendEl.empty();
			this.detailEl.empty();
			return;
		}

		const buckets = computeQuantileBuckets(this.activityMap);

		applyRampToContainer(this.contentEl, computeColorRamp(this.plugin.settings));

		renderHeatmap({
			container: this.gridEl,
			activityMap: this.activityMap,
			buckets,
			settings: this.plugin.settings,
			today: windowEnd,
		});

		if (!this.selectedIso) {
			this.selectedIso = toISODate(windowEnd);
		}

		this.renderPager(windowEnd);
		this.renderSparklineIfVisible(buckets, windowEnd);
		renderLegend(this.legendEl);

		this.interactions = attachInteractions({
			container: this.gridEl,
			onCellSelect: (iso) => {
				this.selectedIso = iso;
				this.renderSelection();
			},
		});

		this.renderSelection();

		requestAnimationFrame(() => {
			this.gridEl.scrollLeft = this.gridEl.scrollWidth;
		});

		const heatmap = this.gridEl.querySelector<HTMLElement>(".vault-pulse-heatmap");
		if (heatmap) {
			this.gridElasticCleanup = attachElasticScroll(this.gridEl, heatmap, "x");
		}
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
