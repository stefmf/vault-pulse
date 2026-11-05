import {
	App,
	PluginSettingTab,
	type SettingDefinition,
	type SettingDefinitionItem,
} from "obsidian";
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

/** Settings stored as numbers but chosen from a dropdown (string values). */
const NUMERIC_KEYS = new Set<string>(["weekStart", "windowDays"]);

/**
 * Declarative settings (Obsidian 1.13+), so every setting appears in
 * Obsidian's settings search. Values go through `getControlValue` /
 * `setControlValue`, which keep the plugin's side effects (rescan, status
 * bar) and the "one section always visible" rule.
 */
export class VaultPulseSettingTab extends PluginSettingTab {
	plugin: VaultPulsePlugin;

	constructor(app: App, plugin: VaultPulsePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getControlValue(key: string): unknown {
		const value = (this.plugin.settings as unknown as Record<string, unknown>)[key];
		return NUMERIC_KEYS.has(key) ? String(value) : value;
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings as unknown as Record<string, unknown>;
		if (key === "showCalendar" || key === "showHeatmap") {
			// Start from what the user sees, so a merged both-off state can't
			// hide the calendar when the heatmap is switched back on.
			const visible = effectiveVisibility(this.plugin.settings);
			this.plugin.settings.showCalendar = visible.calendar;
			this.plugin.settings.showHeatmap = visible.heatmap;
		}
		settings[key] = NUMERIC_KEYS.has(key) ? Number(value) : value;
		await this.plugin.saveSettings();
		// Re-evaluate which toggle is disabled and whether Custom hex shows.
		this.update();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.settings;
		const visible = effectiveVisibility(settings);
		const onlyCalendar = visible.calendar && !visible.heatmap;
		const onlyHeatmap = visible.heatmap && !visible.calendar;

		const general: SettingDefinition[] = [
			{
				name: t("settings.activitySource"),
				desc: t("settings.activitySourceDesc"),
				control: {
					type: "dropdown",
					key: "activitySource",
					options: {
						combined: t("settings.activitySourceCombined"),
						modified: t("settings.activitySourceModified"),
						created: t("settings.activitySourceCreated"),
					},
				},
			},
			{
				name: t("settings.modifiedDate"),
				desc: t("settings.modifiedDateDesc"),
				control: {
					type: "dropdown",
					key: "modifiedDate",
					options: {
						updated: t("settings.modifiedDateUpdated"),
						mtime: t("settings.modifiedDateMtime"),
					},
				},
			},
			{
				name: t("settings.colorPalette"),
				desc: t("settings.colorPaletteDesc"),
				control: {
					type: "dropdown",
					key: "colorBase",
					options: {
						theme: t("settings.colorPaletteTheme"),
						green: t("settings.colorPaletteGreen"),
						heat: t("settings.colorPaletteHeat"),
						sunset: t("settings.colorPaletteSunset"),
						custom: t("settings.colorPaletteCustom"),
					},
				},
			},
			{
				name: t("settings.customHex"),
				desc: t("settings.customHexDesc"),
				visible: () => this.plugin.settings.colorBase === "custom",
				control: { type: "color", key: "customHexColor" },
			},
			{
				name: t("settings.windowLength"),
				desc: t("settings.windowLengthDesc"),
				control: {
					type: "dropdown",
					key: "windowDays",
					options: {
						"90": t("settings.windowLength90"),
						"180": t("settings.windowLength180"),
						"365": t("settings.windowLength365"),
					},
				},
			},
			{
				name: t("settings.weekStart"),
				desc: t("settings.weekStartDesc"),
				control: {
					type: "dropdown",
					key: "weekStart",
					options: {
						"0": t("settings.weekStartSunday"),
						"1": t("settings.weekStartMonday"),
					},
				},
			},
			{
				name: t("settings.excludeFolders"),
				desc: t("settings.excludeFoldersDesc"),
				control: {
					type: "text",
					key: "excludeFolders",
					placeholder: t("settings.excludeFoldersPlaceholder"),
				},
			},
			{
				name: t("settings.includeTags"),
				desc: t("settings.includeTagsDesc"),
				control: {
					type: "text",
					key: "includeTags",
					placeholder: t("settings.includeTagsPlaceholder"),
				},
			},
		];

		return [
			...general,
			{
				type: "group",
				heading: t("settings.visibility"),
				items: [
					{
						name: t("settings.showCalendar"),
						desc: onlyCalendar
							? t("settings.lastSectionDesc")
							: t("settings.showCalendarDesc"),
						control: { type: "toggle", key: "showCalendar", disabled: onlyCalendar },
					},
					{
						name: t("settings.showHeatmap"),
						desc: onlyHeatmap
							? t("settings.lastSectionDesc")
							: t("settings.showHeatmapDesc"),
						control: { type: "toggle", key: "showHeatmap", disabled: onlyHeatmap },
					},
					{
						name: t("settings.showSparkline"),
						desc: t("settings.showSparklineDesc"),
						control: { type: "toggle", key: "showSparkline" },
					},
					{
						name: t("settings.showStreakCounter"),
						desc: t("settings.showStreakCounterDesc"),
						control: { type: "toggle", key: "showStreakCounter" },
					},
					{
						name: t("settings.showMiniStats"),
						desc: t("settings.showMiniStatsDesc"),
						control: { type: "toggle", key: "showMiniStats" },
					},
					{
						name: t("settings.showStatusBar"),
						desc: t("settings.showStatusBarDesc"),
						control: { type: "toggle", key: "showStatusBar" },
					},
				],
			},
		];
	}
}
