/**
 * Minimal Obsidian module mock for vitest.
 *
 * Two responsibilities:
 *   1. Export the named symbols our pure-function tests transitively import.
 *   2. Patch jsdom prototypes with the DOM helpers Obsidian adds at runtime
 *      (createDiv, createSpan, createEl, createFragment, empty, addClass,
 *      removeClass, setCssProps). Without these, any test that exercises a
 *      renderer / detailPanel / confetti code path crashes on the first
 *      `containerEl.createDiv(...)` call.
 *
 * The helpers here are intentionally permissive — they cover the
 * `{ cls, text, attr, type }` shape we actually use, not the full Obsidian
 * `DomElementInfo` interface. Real Obsidian honors more keys; tests don't.
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
export class Menu {
	addItem(_cb: (item: unknown) => void): this {
		return this;
	}
	showAtMouseEvent(_evt: unknown): void {}
}
export const setTooltip = () => undefined;
export const setIcon = () => undefined;
export const debounce = <T extends (...args: unknown[]) => unknown>(fn: T): T => fn;

/* ---------------------------------------------------------------------------
 * DOM augmentation — mirror Obsidian's runtime patches on Element / Document /
 * DocumentFragment so tests can call createDiv/createSpan/createEl/etc.
 * ------------------------------------------------------------------------- */

interface DomElementInfo {
	cls?: string | string[];
	text?: string;
	attr?: Record<string, string>;
	type?: string;
	href?: string;
	title?: string;
}

type ParentWithCreate = ParentNode & {
	appendChild: <T extends Node>(node: T) => T;
};

function applyInfo(el: HTMLElement, info?: DomElementInfo | string): void {
	if (info === undefined) return;
	if (typeof info === "string") {
		el.className = info;
		return;
	}
	if (info.cls !== undefined) {
		if (Array.isArray(info.cls)) {
			for (const c of info.cls) if (c) el.classList.add(c);
		} else if (info.cls) {
			el.className = info.cls;
		}
	}
	if (info.text !== undefined) el.textContent = info.text;
	if (info.title !== undefined) el.title = info.title;
	if (info.href !== undefined) el.setAttribute("href", info.href);
	if (info.type !== undefined) el.setAttribute("type", info.type);
	if (info.attr) {
		for (const [k, v] of Object.entries(info.attr)) el.setAttribute(k, v);
	}
}

function makeChild<K extends keyof HTMLElementTagNameMap>(
	parent: ParentWithCreate,
	tag: K,
	info?: DomElementInfo | string,
	callback?: (el: HTMLElementTagNameMap[K]) => void
): HTMLElementTagNameMap[K] {
	const doc = (parent as Node).ownerDocument ?? globalThis.document;
	const el = doc.createElement(tag);
	applyInfo(el, info);
	parent.appendChild(el);
	callback?.(el);
	return el;
}

function installDomHelpers(): void {
	const targets: ParentWithCreate[] = [
		Element.prototype as unknown as ParentWithCreate,
		Document.prototype as unknown as ParentWithCreate,
		DocumentFragment.prototype as unknown as ParentWithCreate,
	];
	for (const proto of targets) {
		const p = proto as unknown as Record<string, unknown>;
		p.createDiv = function (this: ParentWithCreate, info?: DomElementInfo | string, cb?: (el: HTMLDivElement) => void) {
			return makeChild(this, "div", info, cb);
		};
		p.createSpan = function (this: ParentWithCreate, info?: DomElementInfo | string, cb?: (el: HTMLSpanElement) => void) {
			return makeChild(this, "span", info, cb);
		};
		p.createEl = function (
			this: ParentWithCreate,
			tag: keyof HTMLElementTagNameMap,
			info?: DomElementInfo | string,
			cb?: (el: HTMLElement) => void
		) {
			return makeChild(this, tag, info, cb);
		};
	}

	const elProto = Element.prototype as unknown as Record<string, unknown>;
	elProto.empty = function (this: Element) {
		while (this.firstChild) this.removeChild(this.firstChild);
	};
	elProto.addClass = function (this: Element, ...classes: string[]) {
		for (const c of classes) if (c) this.classList.add(c);
	};
	elProto.removeClass = function (this: Element, ...classes: string[]) {
		for (const c of classes) if (c) this.classList.remove(c);
	};
	elProto.setCssProps = function (
		this: HTMLElement,
		props: Record<string, string>
	) {
		for (const [k, v] of Object.entries(props)) this.style.setProperty(k, v);
	};
	elProto.isShown = function (this: HTMLElement) {
		return true;
	};

	// Global createFragment() — Obsidian exposes this on the obsidian module
	// AND as a window-level helper. Tests can use either path.
	const win = globalThis as unknown as Record<string, unknown>;
	if (typeof win.createFragment !== "function") {
		win.createFragment = function (
			cb?: (frag: DocumentFragment) => void
		): DocumentFragment {
			const frag = document.createDocumentFragment();
			cb?.(frag);
			return frag;
		};
	}

	// `activeDocument` global — points at the focused window's document.
	// In tests, that's just the jsdom document.
	if (!("activeDocument" in win)) {
		Object.defineProperty(win, "activeDocument", {
			get: () => globalThis.document,
		});
	}
	if (!("activeWindow" in win)) {
		Object.defineProperty(win, "activeWindow", {
			get: () => globalThis.window,
		});
	}
}

installDomHelpers();

/* Re-export createFragment for code that imports it from "obsidian". */
export function createFragment(
	cb?: (frag: DocumentFragment) => void
): DocumentFragment {
	const frag = document.createDocumentFragment();
	cb?.(frag);
	return frag;
}
