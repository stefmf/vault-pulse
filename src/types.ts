import type { TFile } from "obsidian";

export interface ActivityDay {
	isoDate: string;
	files: TFile[];
	count: number;
}

export type ActivityMap = Map<string, ActivityDay>;

export interface QuantileBuckets {
	p25: number;
	p50: number;
	p75: number;
}

export type ActivityLevel = 0 | 1 | 2 | 3 | 4;

export interface ColorRamp {
	level0: string;
	level1: string;
	level2: string;
	level3: string;
	level4: string;
}
