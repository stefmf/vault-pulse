import { DateTime } from "luxon";
import { setTooltip } from "obsidian";
import { toISODate } from "./dateUtils";

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
		const tooltip = `${DateTime.fromISO(iso).toFormat("MMM d")} · ${count} ${
			count === 1 ? "file" : "files"
		}`;
		setTooltip(cell, tooltip, { placement: "top" });
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

function cellFrom(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof HTMLElement)) return null;
	return target.closest<HTMLElement>(".vault-pulse-cell");
}
