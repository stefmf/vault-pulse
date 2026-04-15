import { Plugin, WorkspaceLeaf, debounce, setIcon, setTooltip } from "obsidian";
import { DateTime, Settings as LuxonSettings } from "luxon";
import {
	DEFAULT_SETTINGS,
	VaultPulseSettings,
	VaultPulseSettingTab,
} from "./settings";
import { VaultPulseView, VIEW_TYPE_VAULT_PULSE } from "./view";
import { currentLocale, t } from "./i18n";
import {
	buildVaultActivity,
	fromApp,
	parseFilters,
	type ParsedFilters,
	type VaultActivity,
} from "./data";
import { toISODate } from "./dateUtils";

export const HOVER_LINK_SOURCE = "vault-pulse";

export default class VaultPulsePlugin extends Plugin {
	settings!: VaultPulseSettings;
	private statusBarEl: HTMLElement | null = null;
	private scheduleRefresh: () => void = () => {};
	private latestScan: VaultActivity | null = null;
	private parsedFiltersCache: ParsedFilters | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();

		LuxonSettings.defaultLocale = currentLocale();

		this.registerView(
			VIEW_TYPE_VAULT_PULSE,
			(leaf) => new VaultPulseView(leaf, this)
		);

		// Opts detail-panel rows into Obsidian's built-in page-preview popover.
		// `registerHoverLinkSource` isn't in the public API types but is stable
		// at runtime — ppeirce's heatmap-bases-view uses the same cast.
		(
			this.app.workspace as unknown as {
				registerHoverLinkSource: (
					id: string,
					info: { display: string; defaultMod: boolean }
				) => void;
			}
		).registerHoverLinkSource(HOVER_LINK_SOURCE, {
			display: "Vault Pulse",
			defaultMod: true,
		});

		this.addRibbonIcon("layout-grid", t("ribbon.openPane"), () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-heatmap",
			name: t("commands.openHeatmap"),
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "jump-to-today",
			name: t("commands.jumpToToday"),
			callback: () => {
				void this.jumpToToday();
			},
		});

		this.addSettingTab(new VaultPulseSettingTab(this.app, this));

		// Plugin is the sole vault-event subscriber. On any file change it does
		// ONE scan, then notifies every mounted view + repaints the status bar.
		// 200ms trailing-edge debounce collapses bursts (e.g. an Obsidian Git
		// commit of 50 files) into a single scan after the burst settles.
		this.scheduleRefresh = debounce(() => this.refreshAll(), 200);

		this.refreshStatusBarItem();
		this.refreshAll();

		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on("create", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on("modify", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on("delete", () => this.scheduleRefresh())
		);
		this.registerEvent(
			this.app.vault.on("rename", () => this.scheduleRefresh())
		);

		// When the workspace layout changes (sidebar collapse/expand, split,
		// pane drag), give every visible view a chance to flush a pending
		// render queued while it was hidden.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				for (const view of this.eachView()) view.flushIfPending();
			})
		);
	}

	async activateView(): Promise<void> {
		const { workspace } = this.app;

		const existing = workspace.getLeavesOfType(VIEW_TYPE_VAULT_PULSE);
		let leaf: WorkspaceLeaf | null;

		if (existing.length > 0) {
			leaf = existing[0];
		} else {
			leaf = workspace.getRightLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_VAULT_PULSE,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
		}
	}

	async jumpToToday(): Promise<void> {
		await this.activateView();
		for (const view of this.eachView()) {
			view.scrollToToday();
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<VaultPulseSettings> | null
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		// Settings might have changed filter strings — invalidate the cache so
		// the next scan re-parses.
		this.parsedFiltersCache = null;
		this.refreshStatusBarItem();
		this.refreshAll();
	}

	/**
	 * The plugin's central refresh path. Runs the vault scan ONCE and pushes
	 * the result to every mounted view and to the status bar. Triggered by
	 * vault/metadata events (debounced) or directly by `saveSettings`.
	 */
	refreshAll(): void {
		const scan = this.runScan();
		this.latestScan = scan;
		for (const view of this.eachView()) view.onDataChanged(scan);
		this.renderStatusBar(scan);
	}

	/** Synchronous accessor for views that need data outside of the event flow. */
	getLatestScan(): VaultActivity {
		if (!this.latestScan) {
			this.latestScan = this.runScan();
		}
		return this.latestScan;
	}

	/** Cached + lazily-parsed filter lists. Invalidated by `saveSettings`. */
	getFilters(): ParsedFilters {
		if (!this.parsedFiltersCache) {
			this.parsedFiltersCache = parseFilters(this.settings);
		}
		return this.parsedFiltersCache;
	}

	private runScan(): VaultActivity {
		return buildVaultActivity(fromApp(this.app), this.settings, {
			filters: this.getFilters(),
		});
	}

	private *eachView(): Generator<VaultPulseView> {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_PULSE)) {
			const view = leaf.view;
			if (view instanceof VaultPulseView) yield view;
		}
	}

	/**
	 * Toggle the status bar item on/off based on the current setting. Cheap;
	 * the actual content render happens in `renderStatusBar`.
	 */
	private refreshStatusBarItem(): void {
		if (!this.settings.showStatusBar) {
			this.statusBarEl?.remove();
			this.statusBarEl = null;
			return;
		}
		if (!this.statusBarEl) {
			this.statusBarEl = this.addStatusBarItem();
			this.statusBarEl.addClass("vault-pulse-status-bar");
			this.statusBarEl.addEventListener("click", () => {
				void this.activateView();
			});
		}
	}

	private renderStatusBar(scan: VaultActivity): void {
		const el = this.statusBarEl;
		if (!el) return;

		const todayIso = toISODate(DateTime.local().startOf("day"));
		const todayCount = scan.allActivity.get(todayIso) ?? 0;
		const streak = computeStreakFromSet(scan.allActivity, todayIso);

		el.empty();

		// Match the detail panel's flame-tier threshold — no flame in the
		// status bar until the streak reaches day 7, same as when the first
		// flame glyph appears in the detail panel header.
		const showFlame = streak >= 7;
		if (showFlame) {
			const flame = el.createSpan({
				cls: "vault-pulse-status-group vault-pulse-status-flame",
			});
			const flameIcon = flame.createSpan({ cls: "vault-pulse-status-icon" });
			setIcon(flameIcon, "flame");
			flame.createSpan({
				cls: "vault-pulse-status-text",
				text: String(streak),
			});
		}

		if (todayCount > 0) {
			const files = el.createSpan({
				cls: "vault-pulse-status-group vault-pulse-status-files",
			});
			const fileIcon = files.createSpan({ cls: "vault-pulse-status-icon" });
			setIcon(fileIcon, "file-text");
			files.createSpan({
				cls: "vault-pulse-status-text",
				text: String(todayCount),
			});
		}

		if (!showFlame && todayCount === 0) {
			// Quiet day — keep a subtle presence so the widget still signals the
			// plugin is active and clickable, without adding numeric noise.
			const placeholder = el.createSpan({
				cls: "vault-pulse-status-group vault-pulse-status-idle",
			});
			const icon = placeholder.createSpan({
				cls: "vault-pulse-status-icon",
			});
			setIcon(icon, "layout-grid");
		}

		setTooltip(el, buildStatusTooltip(streak, todayCount), { placement: "top" });
	}
}

function computeStreakFromSet(
	activity: Map<string, number>,
	endIso: string
): number {
	if (!activity.has(endIso)) return 0;
	let count = 1;
	let cursor = DateTime.fromISO(endIso).minus({ days: 1 });
	for (;;) {
		const key = toISODate(cursor);
		if (!activity.has(key)) break;
		count += 1;
		cursor = cursor.minus({ days: 1 });
	}
	return count;
}

function buildStatusTooltip(streak: number, todayCount: number): string {
	const parts: string[] = [];
	if (streak >= 7) parts.push(t("statusBar.streak", { days: streak }));
	if (todayCount > 0) {
		parts.push(t("statusBar.todayFiles", { count: todayCount }));
	}
	if (parts.length === 0) return t("view.title");
	return parts.join(" · ");
}
