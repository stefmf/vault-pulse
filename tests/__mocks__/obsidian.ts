/**
 * Minimal Obsidian module mock for vitest.
 * Only exports the symbols our pure-function tests transitively import.
 */

export interface FileStat {
	ctime: number;
	mtime: number;
	size: number;
}

export class TFile {
	path: string;
	basename: string;
	extension: string;
	stat: FileStat;

	constructor(path: string, stat?: Partial<FileStat>) {
		this.path = path;
		const name = path.split("/").pop() ?? "";
		this.basename = name.replace(/\.md$/, "");
		this.extension = "md";
		this.stat = { ctime: 0, mtime: 0, size: 0, ...stat };
	}
}

export interface CachedMetadata {
	frontmatter?: Record<string, unknown>;
}

/* Other symbols that may be imported but are not exercised in pure-function tests. */
export class App {}
export class Plugin {}
export class ItemView {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}
export class WorkspaceLeaf {}
export const setTooltip = () => undefined;
export const setIcon = () => undefined;
export const debounce = <T extends (...args: unknown[]) => unknown>(fn: T): T => fn;
