import { ItemView, TFile, WorkspaceLeaf, debounce } from "obsidian";
import { DateTime } from "luxon";
import type VaultPulsePlugin from "./main";
import { HOVER_LINK_SOURCE } from "./main";
import { buildActivityMap, fromApp } from "./data";
import {
	renderEmptyState,
	renderHeatmap,
	renderLegend,
	renderSparkline,
} from "./renderer";
import { attachInteractions, InteractionHandle } from "./interactions";
import {
	applyRampToContainer,
	computeColorRamp,
	computeQuantileBuckets,
} from "./colorUtils";
import { renderDetailPanel } from "./detailPanel";
import { toISODate } from "./dateUtils";
import { attachElasticScroll } from "./elasticScroll";
import type { ActivityMap } from "./types";

export const VIEW_TYPE_VAULT_PULSE = "vault-pulse-view";

export class VaultPulseView extends ItemView {
	plugin: VaultPulsePlugin;
	private gridEl!: HTMLElement;
	private sparklineEl!: HTMLElement;
	private legendEl!: HTMLElement;
	private detailEl!: HTMLElement;
	private interactions: InteractionHandle | null = null;
	private gridElasticCleanup: (() => void) | null = null;
	private detailElasticCleanup: (() => void) | null = null;
	private scheduleRefresh: () => void;
	private activityMap: ActivityMap = new Map();
	private selectedIso: string | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: VaultPulsePlugin) {
		super(leaf);
		this.plugin = plugin;
		this.scheduleRefresh = debounce(() => this.refresh(), 200, true);
	}

	getViewType(): string {
		return VIEW_TYPE_VAULT_PULSE;
	}

	getDisplayText(): string {
		return "Vault pulse";
	}

	getIcon(): string {
		return "layout-grid";
	}

	onOpen(): Promise<void> {
		this.contentEl.empty();
		this.contentEl.addClass("vault-pulse-view");
		this.gridEl = this.contentEl.createDiv("vault-pulse-grid-wrapper");
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
		this.registerEvent(this.app.workspace.on("css-change", () => this.refresh()));

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

		this.activityMap = buildActivityMap(fromApp(this.app), this.plugin.settings);
		const totalFiles = this.app.vault.getMarkdownFiles().length;

		if (totalFiles === 0) {
			renderEmptyState(this.gridEl, "No markdown files in this vault yet.");
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
		});

		renderSparkline({
			container: this.sparklineEl,
			activityMap: this.activityMap,
			onSelect: (iso) => {
				this.selectedIso = iso;
				this.renderSelection();
			},
		});

		renderLegend(this.legendEl);

		this.interactions = attachInteractions({
			container: this.gridEl,
			onCellSelect: (iso) => {
				this.selectedIso = iso;
				this.renderSelection();
			},
		});

		if (!this.selectedIso) {
			this.selectedIso = toISODate(DateTime.local().startOf("day"));
		}
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
	 * detail panel header.
	 */
	scrollToToday(): void {
		this.selectedIso = toISODate(DateTime.local().startOf("day"));
		this.renderSelection();
		requestAnimationFrame(() => {
			this.gridEl.scrollLeft = this.gridEl.scrollWidth;
			const cell = this.gridEl.querySelector<HTMLElement>(
				`.vault-pulse-cell[data-date="${this.selectedIso}"]`
			);
			cell?.focus();
		});
	}

	private renderSelection(): void {
		// Roving tabindex + is-selected class both move to the newly selected cell.
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
		const streak = this.selectedIso
			? computeStreakEndingAt(this.activityMap, this.selectedIso)
			: 0;

		renderDetailPanel({
			container: this.detailEl,
			iso: this.selectedIso,
			day: this.selectedIso ? this.activityMap.get(this.selectedIso) : undefined,
			streak,
			isToday: this.selectedIso === todayIso,
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
 * Count consecutive active days ending at (and including) the given iso date.
 * Returns 0 if the given day has no activity.
 */
function computeStreakEndingAt(activityMap: ActivityMap, iso: string): number {
	const anchor = activityMap.get(iso);
	if (!anchor || anchor.count === 0) return 0;

	let streak = 1;
	let cursor = DateTime.fromISO(iso).minus({ days: 1 });
	while (true) {
		const key = toISODate(cursor);
		const day = activityMap.get(key);
		if (!day || day.count === 0) break;
		streak++;
		cursor = cursor.minus({ days: 1 });
	}
	return streak;
}
