import { DateTime } from "luxon";
import { setTooltip } from "obsidian";
import { dayCountLabel, toISODate } from "./dateUtils";

export interface InteractionOptions {
	container: HTMLElement;
	onCellSelect: (iso: string, count: number) => void;
}

export interface InteractionHandle {
	teardown(): void;
}

const ARROW_OFFSETS: Record<string, number> = {
	ArrowLeft: -7,
	ArrowRight: 7,
	ArrowUp: -1,
	ArrowDown: 1,
};

/**
 * Hover tooltip, click selection, and arrow-key navigation on the grid.
 * All handlers use event delegation on the container so they survive grid
 * re-renders as long as the container itself is stable.
 */
export function attachInteractions(options: InteractionOptions): InteractionHandle {
	const { container, onCellSelect } = options;

	const onMouseOver = (evt: MouseEvent) => {
		const cell = cellFrom(evt.target);
		if (!cell) return;
		const iso = cell.dataset.date;
		if (!iso) return;
		const count = Number(cell.dataset.count ?? 0);
		setTooltip(cell, dayCountLabel(DateTime.fromISO(iso), count), { placement: "top" });
	};

	const onClick = (evt: MouseEvent) => {
		const cell = cellFrom(evt.target);
		if (!cell) return;
		const iso = cell.dataset.date;
		if (!iso) return;
		const count = Number(cell.dataset.count ?? 0);
		onCellSelect(iso, count);
		evt.stopPropagation();
	};

	const onKeyDown = (evt: KeyboardEvent) => {
		const cell = cellFrom(evt.target);
		if (!cell) return;
		const offset = ARROW_OFFSETS[evt.key];
		if (offset === undefined) return;
		evt.preventDefault();

		const iso = cell.dataset.date;
		if (!iso) return;

		const nextIso = toISODate(DateTime.fromISO(iso).plus({ days: offset }));
		const nextCell = container.querySelector<HTMLElement>(
			`.vault-pulse-cell[data-date="${nextIso}"]`
		);
		if (!nextCell) return;

		const count = Number(nextCell.dataset.count ?? 0);
		onCellSelect(nextIso, count);
		nextCell.focus();
	};

	container.addEventListener("mouseover", onMouseOver);
	container.addEventListener("click", onClick);
	container.addEventListener("keydown", onKeyDown);

	return {
		teardown() {
			container.removeEventListener("mouseover", onMouseOver);
			container.removeEventListener("click", onClick);
			container.removeEventListener("keydown", onKeyDown);
		},
	};
}

/**
 * The heatmap cell under an event target. Uses Obsidian's cross-window
 * `instanceOf`, since `instanceof HTMLElement` is false in a pop-out window.
 */
function cellFrom(target: EventTarget | null): HTMLElement | null {
	const node = target as Node | null;
	if (!node?.instanceOf(HTMLElement)) return null;
	return node.closest<HTMLElement>(".vault-pulse-cell");
}
