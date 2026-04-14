import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	DEFAULT_SETTINGS,
	VaultPulseSettings,
	VaultPulseSettingTab,
} from "./settings";
import { VaultPulseView, VIEW_TYPE_VAULT_PULSE } from "./view";

export const HOVER_LINK_SOURCE = "vault-pulse";

export default class VaultPulsePlugin extends Plugin {
	settings!: VaultPulseSettings;

	async onload(): Promise<void> {
		await this.loadSettings();

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

		this.addRibbonIcon("layout-grid", "Open vault pulse", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-heatmap",
			name: "Open heatmap",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "jump-to-today",
			name: "Jump to today",
			callback: () => {
				void this.jumpToToday();
			},
		});

		this.addSettingTab(new VaultPulseSettingTab(this.app, this));
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
	}
}
