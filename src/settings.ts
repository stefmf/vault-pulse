import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultPulsePlugin from "./main";

export type ActivitySource = "modified" | "created" | "combined";
export type ColorBase = "theme" | "green" | "heat" | "sunset" | "custom";
export type WindowDays = 90 | 180 | 365;

export interface VaultPulseSettings {
	activitySource: ActivitySource;
	colorBase: ColorBase;
	customHexColor: string;
	weekStart: 0 | 1;
	windowDays: WindowDays;
	excludeFolders: string;
	includeTags: string;
}

export const DEFAULT_SETTINGS: VaultPulseSettings = {
	activitySource: "combined",
	colorBase: "theme",
	customHexColor: "#39d353",
	weekStart: 0,
	windowDays: 365,
	excludeFolders: "",
	includeTags: "",
};

const HEX_COLOR_RE = /^#?[0-9a-f]{6}$/i;

export class VaultPulseSettingTab extends PluginSettingTab {
	plugin: VaultPulsePlugin;

	constructor(app: App, plugin: VaultPulsePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Activity source")
			.setDesc(
				"Which timestamp counts as activity for a given day. Combined dedupes when created and modified fall on the same day."
			)
			.addDropdown((dd) =>
				dd
					.addOption("combined", "Created or modified")
					.addOption("modified", "Modified only")
					.addOption("created", "Created only")
					.setValue(this.plugin.settings.activitySource)
					.onChange(async (value) => {
						this.plugin.settings.activitySource = value as ActivitySource;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Color palette")
			.setDesc(
				"Color scheme for active cells. Auto follows your Obsidian theme's interactive-accent color; named palettes use their own hues."
			)
			.addDropdown((dd) =>
				dd
					.addOption("theme", "Auto (theme accent)")
					.addOption("green", "Green (GitHub-style)")
					.addOption("heat", "Heat (orange → red)")
					.addOption("sunset", "Sunset (gold → indigo)")
					.addOption("custom", "Custom hex")
					.setValue(this.plugin.settings.colorBase)
					.onChange(async (value) => {
						this.plugin.settings.colorBase = value as ColorBase;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.colorBase === "custom") {
			new Setting(containerEl)
				.setName("Custom hex color")
				.setDesc("Hex color like #39d353. Used when Color palette is set to Custom.")
				.addText((text) =>
					text
						.setPlaceholder("#39d353")
						.setValue(this.plugin.settings.customHexColor)
						.onChange(async (value) => {
							if (HEX_COLOR_RE.test(value)) {
								this.plugin.settings.customHexColor = value.startsWith("#")
									? value
									: `#${value}`;
								await this.plugin.saveSettings();
							}
						})
				);
		}

		new Setting(containerEl)
			.setName("Window length")
			.setDesc(
				"How many days the heatmap spans. Shorter windows give a narrower grid but finer detail."
			)
			.addDropdown((dd) =>
				dd
					.addOption("90", "90 days")
					.addOption("180", "180 days")
					.addOption("365", "365 days")
					.setValue(String(this.plugin.settings.windowDays))
					.onChange(async (value) => {
						this.plugin.settings.windowDays = parseInt(
							value,
							10
						) as WindowDays;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Week starts on")
			.setDesc("First day of the week in the grid.")
			.addDropdown((dd) =>
				dd
					.addOption("0", "Sunday")
					.addOption("1", "Monday")
					.setValue(String(this.plugin.settings.weekStart))
					.onChange(async (value) => {
						this.plugin.settings.weekStart = parseInt(value, 10) as 0 | 1;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Exclude folders")
			.setDesc(
				"Comma-separated list of folder paths to skip when counting activity. Matches by prefix — e.g. Archive skips Archive/... but not My-Archive/..."
			)
			.addText((text) =>
				text
					.setPlaceholder("Archive, _templates")
					.setValue(this.plugin.settings.excludeFolders)
					.onChange(async (value) => {
						this.plugin.settings.excludeFolders = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Include tags")
			.setDesc(
				"Comma-separated list of tags. If set, only files with AT LEAST ONE of these tags count. Leave empty to include all files. Leading # is optional."
			)
			.addText((text) =>
				text
					.setPlaceholder("project, journal")
					.setValue(this.plugin.settings.includeTags)
					.onChange(async (value) => {
						this.plugin.settings.includeTags = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
