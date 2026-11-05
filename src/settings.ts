import { App, PluginSettingTab, Setting } from "obsidian";
import type VaultPulsePlugin from "./main";
import { t } from "./i18n";

export type ActivitySource = "modified" | "created" | "combined";
/** "updated": `updated:` frontmatter, then the file's mtime. "mtime": mtime only. */
export type ModifiedDateSource = "updated" | "mtime";
export type ColorBase = "theme" | "green" | "heat" | "sunset" | "custom";
export type WindowDays = 90 | 180 | 365;

export interface VaultPulseSettings {
	activitySource: ActivitySource;
	modifiedDate: ModifiedDateSource;
	colorBase: ColorBase;
	customHexColor: string;
	weekStart: 0 | 1;
	windowDays: WindowDays;
	excludeFolders: string;
	includeTags: string;
	showCalendar: boolean;
	showHeatmap: boolean;
	showSparkline: boolean;
	showStreakCounter: boolean;
	showMiniStats: boolean;
	showStatusBar: boolean;
	longestStreak: number;
}

export const DEFAULT_SETTINGS: VaultPulseSettings = {
	activitySource: "combined",
	modifiedDate: "updated",
	colorBase: "theme",
	customHexColor: "#39d353",
	weekStart: 0,
	windowDays: 365,
	excludeFolders: "",
	includeTags: "",
	showCalendar: true,
	showHeatmap: true,
	showSparkline: true,
	showStreakCounter: true,
	showMiniStats: true,
	showStatusBar: true,
	longestStreak: 0,
};

export interface SectionVisibility {
	calendar: boolean;
	heatmap: boolean;
}

/**
 * Which pane sections render. At least one always does: if both toggles are
 * off (for example after two synced devices each turned one off), the
 * calendar shows. The settings tab uses the same rule to disable the toggle
 * of the last visible section.
 */
export function effectiveVisibility(
	settings: Pick<VaultPulseSettings, "showCalendar" | "showHeatmap">
): SectionVisibility {
	if (!settings.showCalendar && !settings.showHeatmap) {
		return { calendar: true, heatmap: false };
	}
	return { calendar: settings.showCalendar, heatmap: settings.showHeatmap };
}

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
			.setName(t("settings.activitySource"))
			.setDesc(t("settings.activitySourceDesc"))
			.addDropdown((dd) =>
				dd
					.addOption("combined", t("settings.activitySourceCombined"))
					.addOption("modified", t("settings.activitySourceModified"))
					.addOption("created", t("settings.activitySourceCreated"))
					.setValue(this.plugin.settings.activitySource)
					.onChange(async (value) => {
						this.plugin.settings.activitySource = value as ActivitySource;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.modifiedDate"))
			.setDesc(t("settings.modifiedDateDesc"))
			.addDropdown((dd) =>
				dd
					.addOption("updated", t("settings.modifiedDateUpdated"))
					.addOption("mtime", t("settings.modifiedDateMtime"))
					.setValue(this.plugin.settings.modifiedDate)
					.onChange(async (value) => {
						this.plugin.settings.modifiedDate = value as ModifiedDateSource;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.colorPalette"))
			.setDesc(t("settings.colorPaletteDesc"))
			.addDropdown((dd) =>
				dd
					.addOption("theme", t("settings.colorPaletteTheme"))
					.addOption("green", t("settings.colorPaletteGreen"))
					.addOption("heat", t("settings.colorPaletteHeat"))
					.addOption("sunset", t("settings.colorPaletteSunset"))
					.addOption("custom", t("settings.colorPaletteCustom"))
					.setValue(this.plugin.settings.colorBase)
					.onChange(async (value) => {
						this.plugin.settings.colorBase = value as ColorBase;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.colorBase === "custom") {
			new Setting(containerEl)
				.setName(t("settings.customHex"))
				.setDesc(t("settings.customHexDesc"))
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
			.setName(t("settings.windowLength"))
			.setDesc(t("settings.windowLengthDesc"))
			.addDropdown((dd) =>
				dd
					.addOption("90", t("settings.windowLength90"))
					.addOption("180", t("settings.windowLength180"))
					.addOption("365", t("settings.windowLength365"))
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
			.setName(t("settings.weekStart"))
			.setDesc(t("settings.weekStartDesc"))
			.addDropdown((dd) =>
				dd
					.addOption("0", t("settings.weekStartSunday"))
					.addOption("1", t("settings.weekStartMonday"))
					.setValue(String(this.plugin.settings.weekStart))
					.onChange(async (value) => {
						this.plugin.settings.weekStart = parseInt(value, 10) as 0 | 1;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.excludeFolders"))
			.setDesc(t("settings.excludeFoldersDesc"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.excludeFoldersPlaceholder"))
					.setValue(this.plugin.settings.excludeFolders)
					.onChange(async (value) => {
						this.plugin.settings.excludeFolders = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.includeTags"))
			.setDesc(t("settings.includeTagsDesc"))
			.addText((text) =>
				text
					.setPlaceholder(t("settings.includeTagsPlaceholder"))
					.setValue(this.plugin.settings.includeTags)
					.onChange(async (value) => {
						this.plugin.settings.includeTags = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName(t("settings.visibility")).setHeading();

		// The toggle of the only visible section is disabled, so the pane
		// never ends up empty. Re-render after a change to update that state.
		const visible = effectiveVisibility(this.plugin.settings);
		const onlyCalendar = visible.calendar && !visible.heatmap;
		const onlyHeatmap = visible.heatmap && !visible.calendar;

		new Setting(containerEl)
			.setName(t("settings.showCalendar"))
			.setDesc(
				onlyCalendar ? t("settings.lastSectionDesc") : t("settings.showCalendarDesc")
			)
			.setDisabled(onlyCalendar)
			.addToggle((toggle) =>
				toggle
					.setValue(visible.calendar)
					.setDisabled(onlyCalendar)
					.onChange(async (value) => {
						// Start from what the user sees, so a merged both-off
						// state can't hide the calendar when the heatmap comes back.
						this.plugin.settings.showCalendar = value;
						this.plugin.settings.showHeatmap = visible.heatmap;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.showHeatmap"))
			.setDesc(
				onlyHeatmap ? t("settings.lastSectionDesc") : t("settings.showHeatmapDesc")
			)
			.setDisabled(onlyHeatmap)
			.addToggle((toggle) =>
				toggle
					.setValue(visible.heatmap)
					.setDisabled(onlyHeatmap)
					.onChange(async (value) => {
						this.plugin.settings.showHeatmap = value;
						this.plugin.settings.showCalendar = visible.calendar;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.showSparkline"))
			.setDesc(t("settings.showSparklineDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showSparkline)
					.onChange(async (value) => {
						this.plugin.settings.showSparkline = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.showStreakCounter"))
			.setDesc(t("settings.showStreakCounterDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStreakCounter)
					.onChange(async (value) => {
						this.plugin.settings.showStreakCounter = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.showMiniStats"))
			.setDesc(t("settings.showMiniStatsDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showMiniStats)
					.onChange(async (value) => {
						this.plugin.settings.showMiniStats = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t("settings.showStatusBar"))
			.setDesc(t("settings.showStatusBarDesc"))
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showStatusBar)
					.onChange(async (value) => {
						this.plugin.settings.showStatusBar = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
