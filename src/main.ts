import { Plugin, WorkspaceLeaf, debounce, setIcon, setTooltip } from "obsidian";
import { DateTime, Settings as LuxonSettings } from "luxon";
import {
	DEFAULT_SETTINGS,
	VaultPulseSettings,
	VaultPulseSettingTab,
} from "./settings";
import { VaultPulseView, VIEW_TYPE_VAULT_PULSE } from "./view";
import { currentLocale, t } from "./i18n";
import { buildVaultActivity, fromApp } from "./data";
import { toISODate } from "./dateUtils";

export const HOVER_LINK_SOURCE = "vault-pulse";

/**
 * When the view is open, it does the heavy scan once per refresh. The plugin
 * caches that scan's outputs here so the status bar can read them without
 * re-walking the vault. Treated as stale after `CACHE_MAX_AGE_MS`.
 */
interface StatusBarCache {
	allActivity: Map<string, number>;
	todayCount: number;
	timestamp: number;
}

const CACHE_MAX_AGE_MS = 1500;

export default class VaultPulsePlugin extends Plugin {
	settings!: VaultPulseSettings;
	private statusBarEl: HTMLElement | null = null;
	private scheduleStatusBar: () => void = () => {};
	private lastScan: StatusBarCache | null = null;

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

		// Status bar widget. Rendered once on load, kept fresh via debounced
		// refresh on vault/metadata events. Independent of whether the view is
		// mounted — the widget is the always-on summary, the pane is the deep
		// dive.
		//
		// Debounce is trailing-only (no leading flag) so a burst of file events
		// — e.g. an Obsidian Git commit touching 50 files — collapses into a
		// single scan after 1s of quiet rather than firing at the burst's
		// leading edge AND trailing edge. 1000ms is comfortable for an ambient
		// widget; the pane (when open) has its own faster 200ms refresh.
		this.scheduleStatusBar = debounce(
			() => this.renderStatusBar(),
			1000
		);
		this.refreshStatusBar();
		this.registerEvent(
			this.app.metadataCache.on("changed", () => this.scheduleStatusBar())
		);
		this.registerEvent(
			this.app.vault.on("create", () => this.scheduleStatusBar())
		);
		this.registerEvent(
			this.app.vault.on("modify", () => this.scheduleStatusBar())
		);
		this.registerEvent(
			this.app.vault.on("delete", () => this.scheduleStatusBar())
		);
		this.registerEvent(
			this.app.vault.on("rename", () => this.scheduleStatusBar())
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
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_PULSE)) {
			const view = leaf.view;
			if (view instanceof VaultPulseView) {
				view.scrollToToday();
			}
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
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_VAULT_PULSE)) {
			const view = leaf.view;
			if (view instanceof VaultPulseView) {
				view.refresh();
			}
		}
		this.refreshStatusBar();
	}

	/**
	 * Rebuild the status bar item, toggling it on/off per the current setting.
	 * Called after settings changes (toggle on/off) AND after any file event
	 * that might have advanced the streak or today's count.
	 */
	refreshStatusBar(): void {
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
		this.renderStatusBar();
	}

	/**
	 * Called by the view after a successful refresh so the status bar can
	 * reuse the scan it already paid for. Cache is consulted inside
	 * `renderStatusBar` before falling back to its own scan.
	 */
	publishScanCache(allActivity: Map<string, number>, todayCount: number): void {
		this.lastScan = {
			allActivity,
			todayCount,
			timestamp: Date.now(),
		};
		// Repaint the status bar with the freshly-known data; skip the debounce
		// because the view has already done the heavy lifting.
		this.renderStatusBar();
	}

	private renderStatusBar(): void {
		const el = this.statusBarEl;
		if (!el) return;

		const todayIso = toISODate(DateTime.local().startOf("day"));

		let allActivity: Map<string, number>;
		let todayCount: number;
		const cache = this.lastScan;
		if (cache && Date.now() - cache.timestamp < CACHE_MAX_AGE_MS) {
			allActivity = cache.allActivity;
			todayCount = cache.todayCount;
		} else {
			const source = fromApp(this.app);
			const scan = buildVaultActivity(source, this.settings);
			allActivity = scan.allActivity;
			todayCount = scan.windowed.get(todayIso)?.count ?? 0;
			this.lastScan = {
				allActivity,
				todayCount,
				timestamp: Date.now(),
			};
		}

		const streak = computeStreakFromSet(allActivity, todayIso);

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

		setTooltip(
			el,
			buildStatusTooltip(streak, todayCount),
			{ placement: "top" }
		);
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
