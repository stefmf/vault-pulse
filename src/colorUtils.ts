import type { ActivityMap, ActivityLevel, ColorRamp, QuantileBuckets } from "./types";
import type { ColorBase, VaultPulseSettings } from "./settings";

const GITHUB_GREEN = "#39d353";

/**
 * Discrete 4-color palettes. Each array is [level1, level2, level3, level4]
 * — level 0 always falls through to --background-modifier-border so it tracks
 * the theme's empty-cell color.
 *
 * Colors chosen to read well on both light and dark Obsidian backgrounds
 * (Tailwind-calibrated mid-range values).
 */
export const DISCRETE_PALETTES: Record<string, [string, string, string, string]> = {
	green: ["#9be9a8", "#40c463", "#30a14e", "#216e39"],
	heat: ["#fed7aa", "#fb923c", "#ea580c", "#b91c1c"],
	sunset: ["#fef3c7", "#f472b6", "#a855f7", "#4338ca"],
};

export function computeQuantileBuckets(activityMap: ActivityMap): QuantileBuckets {
	const nonZeroCounts: number[] = [];
	for (const day of activityMap.values()) {
		if (day.count > 0) nonZeroCounts.push(day.count);
	}
	nonZeroCounts.sort((a, b) => a - b);

	if (nonZeroCounts.length === 0) {
		return { p25: 0, p50: 0, p75: 0 };
	}

	return {
		p25: quantile(nonZeroCounts, 0.25),
		p50: quantile(nonZeroCounts, 0.5),
		p75: quantile(nonZeroCounts, 0.75),
	};
}

/**
 * Linear-interpolated quantile (R-7 method, used by numpy, Excel's PERCENTILE).
 */
export function quantile(sorted: number[], q: number): number {
	if (sorted.length === 0) return 0;
	if (sorted.length === 1) return sorted[0];
	const pos = (sorted.length - 1) * q;
	const base = Math.floor(pos);
	const rest = pos - base;
	if (base + 1 < sorted.length) {
		return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
	}
	return sorted[base];
}

/**
 * Map a file count to a 0..4 level.
 * Level 0 is "no activity". Levels 1..4 bucketed by p25/p50/p75 thresholds.
 *
 * Edge case: if the non-zero sample is too small to compute meaningful quantiles
 * (all thresholds collapse to the same value), fall back to "any activity => 2".
 */
export function levelForCount(count: number, buckets: QuantileBuckets): ActivityLevel {
	if (count <= 0) return 0;

	const collapsed = buckets.p25 === buckets.p75 && buckets.p50 === buckets.p75;
	if (collapsed) {
		return count >= buckets.p50 ? 4 : 2;
	}

	if (count <= buckets.p25) return 1;
	if (count <= buckets.p50) return 2;
	if (count <= buckets.p75) return 3;
	return 4;
}

interface RGB {
	r: number;
	g: number;
	b: number;
}

export function parseColor(input: string): RGB {
	const trimmed = input.trim();

	const hex6 = /^#?([0-9a-f]{6})$/i.exec(trimmed);
	if (hex6) {
		const hex = hex6[1];
		return {
			r: parseInt(hex.substring(0, 2), 16),
			g: parseInt(hex.substring(2, 4), 16),
			b: parseInt(hex.substring(4, 6), 16),
		};
	}

	const hex3 = /^#?([0-9a-f]{3})$/i.exec(trimmed);
	if (hex3) {
		const hex = hex3[1];
		return {
			r: parseInt(hex[0] + hex[0], 16),
			g: parseInt(hex[1] + hex[1], 16),
			b: parseInt(hex[2] + hex[2], 16),
		};
	}

	const rgb = /^rgba?\s*\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/i.exec(trimmed);
	if (rgb) {
		return {
			r: clamp(parseInt(rgb[1], 10)),
			g: clamp(parseInt(rgb[2], 10)),
			b: clamp(parseInt(rgb[3], 10)),
		};
	}

	return parseColor(GITHUB_GREEN);
}

function clamp(n: number): number {
	return Math.max(0, Math.min(255, n));
}

/**
 * Resolve a named palette or alpha-blend a single color into a 5-stop ramp.
 *
 * - Named palettes (green, heat, sunset): four discrete hex colors, each
 *   tuned for visibility on both themes.
 * - Theme / custom: alpha-blend one base color at 25/50/75/100% opacity so
 *   the theme's background shows through low-activity days.
 */
export function computeColorRamp(settings: VaultPulseSettings): ColorRamp {
	const name = settings.colorBase;
	const palette = DISCRETE_PALETTES[name];

	if (palette) {
		return {
			level0: "var(--background-modifier-border)",
			level1: palette[0],
			level2: palette[1],
			level3: palette[2],
			level4: palette[3],
		};
	}

	const baseColor = name === "custom" ? normalizeHex(settings.customHexColor) : readThemeAccent();
	const { r, g, b } = parseColor(baseColor);
	const rgba = (alpha: number) => `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
	return {
		level0: "var(--background-modifier-border)",
		level1: rgba(0.25),
		level2: rgba(0.5),
		level3: rgba(0.75),
		level4: rgba(1),
	};
}

function readThemeAccent(): string {
	const computed = getComputedStyle(activeDocument.body)
		.getPropertyValue("--interactive-accent")
		.trim();
	return computed || GITHUB_GREEN;
}

function normalizeHex(hex: string): string {
	if (!/^#?[0-9a-f]{6}$/i.test(hex)) return GITHUB_GREEN;
	return hex.startsWith("#") ? hex : `#${hex}`;
}

export function isNamedPalette(name: ColorBase): boolean {
	return name in DISCRETE_PALETTES;
}

export function applyRampToContainer(container: HTMLElement, ramp: ColorRamp): void {
	container.style.setProperty("--vp-level-0", ramp.level0);
	container.style.setProperty("--vp-level-1", ramp.level1);
	container.style.setProperty("--vp-level-2", ramp.level2);
	container.style.setProperty("--vp-level-3", ramp.level3);
	container.style.setProperty("--vp-level-4", ramp.level4);
}
