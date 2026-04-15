import { Plugin, WorkspaceLeaf, debounce, setIcon, setTooltip } from "obsidian";
import { DateTime, Settings as LuxonSettings } from "luxon";
import {
	DEFAULT_SETTINGS,
	VaultPulseSettings,
	VaultPulseSettingTab,
} from "./settings";
import { VaultPulseView, VIEW_TYPE_VAULT_PULSE } from "./view";
import { currentLocale, t } from "./i18n";
import { buildActivityMap, buildAllActivity, fromApp } from "./data";
import { toISODate } from "./dateUtils";

export const HOVER_LINK_SOURCE = "vault-pulse";

export default class VaultPulsePlugin extends Plugin {
	settings!: VaultPulseSettings;
	private statusBarEl: HTMLElement | null = null;
	private scheduleStatusBar: () => void = () => {};

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
		this.scheduleStatusBar = debounce(
			() => this.renderStatusBar(),
			200,
			true
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

	private renderStatusBar(): void {
		const el = this.statusBarEl;
		if (!el) return;

		const source = fromApp(this.app);
		const allActivity = buildAllActivity(source, this.settings);
		const todayIso = toISODate(DateTime.local().startOf("day"));
		const todayCount =
			buildActivityMap(source, this.settings).get(todayIso)?.count ?? 0;
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
