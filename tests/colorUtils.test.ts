import { describe, it, expect } from "vitest";
import {
	DISCRETE_PALETTES,
	applyRampToContainer,
	computeColorRamp,
	computeQuantileBuckets,
	isNamedPalette,
	levelForCount,
	parseColor,
	quantile,
} from "../src/colorUtils";
import type { ActivityMap } from "../src/types";
import type { VaultPulseSettings } from "../src/settings";

function mapFromCounts(counts: number[]): ActivityMap {
	const map: ActivityMap = new Map();
	counts.forEach((c, i) => {
		const iso = `2026-01-${String(i + 1).padStart(2, "0")}`;
		map.set(iso, { isoDate: iso, files: [], count: c });
	});
	return map;
}

function makeSettings(overrides: Partial<VaultPulseSettings> = {}): VaultPulseSettings {
	return {
		activitySource: "combined",
		colorBase: "theme",
		customHexColor: "#39d353",
		weekStart: 0,
		...overrides,
	};
}

describe("quantile", () => {
	it("returns 0 for empty array", () => {
		expect(quantile([], 0.5)).toBe(0);
	});

	it("returns the single value for a single-element array", () => {
		expect(quantile([42], 0.25)).toBe(42);
		expect(quantile([42], 0.95)).toBe(42);
	});

	it("computes R-7 percentiles", () => {
		expect(quantile([1, 2, 5, 20], 0.25)).toBeCloseTo(1.75);
		expect(quantile([1, 2, 5, 20], 0.5)).toBeCloseTo(3.5);
		expect(quantile([1, 2, 5, 20], 0.75)).toBeCloseTo(8.75);
	});
});

describe("computeQuantileBuckets", () => {
	it("returns all zeros when no non-zero days", () => {
		const map = mapFromCounts([0, 0, 0, 0]);
		expect(computeQuantileBuckets(map)).toEqual({ p25: 0, p50: 0, p75: 0 });
	});

	it("computes thresholds from the user's acceptance-criterion sample", () => {
		const map = mapFromCounts([0, 1, 2, 5, 20]);
		const b = computeQuantileBuckets(map);
		expect(b.p25).toBeCloseTo(1.75);
		expect(b.p50).toBeCloseTo(3.5);
		expect(b.p75).toBeCloseTo(8.75);
	});
});

describe("levelForCount (acceptance criterion)", () => {
	it("each count in [0, 1, 2, 5, 20] lands in a distinct level", () => {
		const map = mapFromCounts([0, 1, 2, 5, 20]);
		const buckets = computeQuantileBuckets(map);

		expect(levelForCount(0, buckets)).toBe(0);
		expect(levelForCount(1, buckets)).toBe(1);
		expect(levelForCount(2, buckets)).toBe(2);
		expect(levelForCount(5, buckets)).toBe(3);
		expect(levelForCount(20, buckets)).toBe(4);
	});

	it("level 0 for zero, never higher", () => {
		const buckets = { p25: 1, p50: 2, p75: 3 };
		expect(levelForCount(0, buckets)).toBe(0);
		expect(levelForCount(-5, buckets)).toBe(0);
	});

	it("collapsed buckets fall back to 2 / 4 split", () => {
		const buckets = { p25: 5, p50: 5, p75: 5 };
		expect(levelForCount(5, buckets)).toBe(4);
		expect(levelForCount(1, buckets)).toBe(2);
	});
});

describe("parseColor", () => {
	it("parses 6-digit hex with and without #", () => {
		expect(parseColor("#39d353")).toEqual({ r: 57, g: 211, b: 83 });
		expect(parseColor("39d353")).toEqual({ r: 57, g: 211, b: 83 });
	});

	it("parses 3-digit hex", () => {
		expect(parseColor("#f0f")).toEqual({ r: 255, g: 0, b: 255 });
	});

	it("parses rgb() notation", () => {
		expect(parseColor("rgb(57, 211, 83)")).toEqual({ r: 57, g: 211, b: 83 });
	});

	it("parses rgba() notation (ignores alpha)", () => {
		expect(parseColor("rgba(57, 211, 83, 0.5)")).toEqual({ r: 57, g: 211, b: 83 });
	});

	it("parses space-separated rgb() (modern CSS)", () => {
		expect(parseColor("rgb(57 211 83)")).toEqual({ r: 57, g: 211, b: 83 });
	});

	it("falls back to GitHub green on invalid input", () => {
		expect(parseColor("nonsense")).toEqual({ r: 57, g: 211, b: 83 });
	});
});

describe("isNamedPalette", () => {
	it("recognizes built-in palettes", () => {
		expect(isNamedPalette("green")).toBe(true);
		expect(isNamedPalette("heat")).toBe(true);
		expect(isNamedPalette("sunset")).toBe(true);
	});

	it("rejects alpha-blend modes", () => {
		expect(isNamedPalette("theme")).toBe(false);
		expect(isNamedPalette("custom")).toBe(false);
	});
});

describe("DISCRETE_PALETTES", () => {
	it("each named palette has exactly 4 levels", () => {
		for (const name of ["green", "heat", "sunset"]) {
			expect(DISCRETE_PALETTES[name]).toHaveLength(4);
		}
	});

	it("all palette colors are valid 6-digit hex", () => {
		for (const colors of Object.values(DISCRETE_PALETTES)) {
			for (const c of colors) {
				expect(c).toMatch(/^#[0-9a-f]{6}$/i);
			}
		}
	});
});

describe("computeColorRamp", () => {
	it("binds level 0 to the theme variable", () => {
		const ramp = computeColorRamp(makeSettings({ colorBase: "custom", customHexColor: "#39d353" }));
		expect(ramp.level0).toBe("var(--background-modifier-border)");
	});

	it("uses discrete palette colors for named palettes", () => {
		const ramp = computeColorRamp(makeSettings({ colorBase: "heat" }));
		expect(ramp.level1).toBe(DISCRETE_PALETTES.heat[0]);
		expect(ramp.level4).toBe(DISCRETE_PALETTES.heat[3]);
	});

	it("sunset palette crosses hues (light-warm to deep-cool)", () => {
		const ramp = computeColorRamp(makeSettings({ colorBase: "sunset" }));
		expect(ramp.level1).toBe("#fef3c7");
		expect(ramp.level4).toBe("#4338ca");
	});

	it("alpha-blends for custom hex", () => {
		const ramp = computeColorRamp(
			makeSettings({ colorBase: "custom", customHexColor: "#39d353" })
		);
		expect(ramp.level1).toContain("0.250");
		expect(ramp.level4).toContain("1.000");
		expect(ramp.level1).toContain("57, 211, 83");
	});

	it("falls back to GitHub green when custom hex is invalid", () => {
		const ramp = computeColorRamp(
			makeSettings({ colorBase: "custom", customHexColor: "zzz" })
		);
		expect(ramp.level4).toContain("57, 211, 83");
	});
});

describe("applyRampToContainer", () => {
	it("sets --vp-level-0..4 custom properties", () => {
		const container = document.createElement("div");
		applyRampToContainer(container, computeColorRamp(makeSettings({ colorBase: "heat" })));
		expect(container.style.getPropertyValue("--vp-level-0")).toBe(
			"var(--background-modifier-border)"
		);
		expect(container.style.getPropertyValue("--vp-level-4")).toBe(DISCRETE_PALETTES.heat[3]);
	});
});
