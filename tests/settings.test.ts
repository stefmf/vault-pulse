import { describe, it, expect } from "vitest";
import "../tests/__mocks__/obsidian";
import {
	DEFAULT_SETTINGS,
	effectiveVisibility,
	type VaultPulseSettings,
} from "../src/settings";

describe("DEFAULT_SETTINGS", () => {
	it("fills the 0.4.0 keys for a data.json saved by 0.3.4", () => {
		// The shape 0.3.4 wrote, without the keys added in 0.4.0.
		const saved: Partial<VaultPulseSettings> = {
			activitySource: "combined",
			colorBase: "heat",
			weekStart: 0,
			windowDays: 365,
			longestStreak: 10,
		};
		// Same merge as VaultPulsePlugin.loadSettings.
		const merged = Object.assign({}, DEFAULT_SETTINGS, saved);
		expect(merged.modifiedDate).toBe("updated");
		expect(merged.showCalendar).toBe(true);
		expect(merged.showHeatmap).toBe(true);
		expect(merged.colorBase).toBe("heat");
		expect(merged.longestStreak).toBe(10);
	});
});

describe("effectiveVisibility", () => {
	it("follows the toggles when at least one is on", () => {
		expect(effectiveVisibility({ showCalendar: true, showHeatmap: true })).toEqual({
			calendar: true,
			heatmap: true,
		});
		expect(effectiveVisibility({ showCalendar: true, showHeatmap: false })).toEqual({
			calendar: true,
			heatmap: false,
		});
		expect(effectiveVisibility({ showCalendar: false, showHeatmap: true })).toEqual({
			calendar: false,
			heatmap: true,
		});
	});

	it("shows the calendar when both are off, as after a two-device merge", () => {
		expect(effectiveVisibility({ showCalendar: false, showHeatmap: false })).toEqual({
			calendar: true,
			heatmap: false,
		});
	});
});
