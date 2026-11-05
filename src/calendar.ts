import { DateTime } from "luxon";
import { setIcon } from "obsidian";
import { calendarDays } from "./calendarGrid";
import type { DayNotes } from "./data";
import { weekdayNames } from "./dateUtils";
import { currentLocale, t } from "./i18n";

/** Dots drawn per kind (created, modified) under a day number. */
export const MAX_DOTS_PER_KIND = 3;

export interface CalendarOptions {
	container: HTMLElement;
	/** Any day in the month to show. */
	month: DateTime;
	weekStart: 0 | 1;
	todayIso: string;
	selectedIso: string | null;
	byDay: Map<string, DayNotes>;
}

/**
 * Build the month calendar: title and month arrows, weekday header, and 42
 * day cells. Clicks are handled by the view through delegation on
 * `container` (cells carry `data-date`, arrows `data-action`), so this
 * module attaches no listeners.
 */
export function renderCalendar(options: CalendarOptions): void {
	const { container, month, weekStart } = options;
	const locale = currentLocale();
	container.empty();

	const nav = container.createDiv({ cls: "vault-pulse-calendar-nav" });
	const title = nav.createDiv({ cls: "vault-pulse-calendar-title" });
	const shown = month.setLocale(locale);
	title.createSpan({
		cls: "vault-pulse-calendar-month",
		text: shown.toFormat("LLLL"),
	});
	title.createSpan({
		cls: "vault-pulse-calendar-year",
		text: shown.toFormat("yyyy"),
	});

	const arrows = nav.createDiv({ cls: "vault-pulse-calendar-arrows" });
	buildArrow(arrows, "prev", "chevron-left", t("calendar.prevMonth"));
	buildArrow(arrows, "next", "chevron-right", t("calendar.nextMonth"));

	const grid = container.createDiv({ cls: "vault-pulse-calendar-grid" });
	for (const name of weekdayNames(weekStart)) {
		grid.createDiv({ cls: "vault-pulse-calendar-weekday", text: name });
	}

	for (const day of calendarDays(month, weekStart)) {
		const cell = grid.createDiv({
			cls: "vault-pulse-calendar-day",
			attr: { "data-date": day.iso, role: "button", tabindex: "-1" },
		});
		if (!day.inMonth) cell.classList.add("is-adjacent");
		cell.createSpan({
			cls: "vault-pulse-calendar-day-number",
			text: String(day.day),
		});
		cell.createDiv({ cls: "vault-pulse-calendar-dots" });
	}

	updateCalendarCells(options);
}

/**
 * Refresh dots, today, the selected day and labels on the cells
 * `renderCalendar` built. Used when the shown month and week start are
 * unchanged, so a data change or a new selection never rebuilds the grid.
 */
export function updateCalendarCells(options: CalendarOptions): void {
	const { container, todayIso, selectedIso, byDay } = options;
	const locale = currentLocale();
	const cells = container.querySelectorAll<HTMLElement>(".vault-pulse-calendar-day");

	// One tab stop for the grid: the selected day if shown, else today, else
	// the first day of the month.
	const isos = Array.from(cells, (c) => c.dataset.date ?? "");
	const firstInMonth = Array.from(cells).find((c) => !c.classList.contains("is-adjacent"));
	const tabStop =
		(selectedIso && isos.includes(selectedIso) && selectedIso) ||
		(isos.includes(todayIso) && todayIso) ||
		firstInMonth?.dataset.date;

	cells.forEach((cell) => {
		const iso = cell.dataset.date;
		if (!iso) return;
		cell.tabIndex = iso === tabStop ? 0 : -1;
		const notes = byDay.get(iso);
		const created = notes?.created.length ?? 0;
		const modified = notes?.modified.length ?? 0;

		cell.classList.toggle("is-today", iso === todayIso);
		// Selection is an ARIA state, not an `.is-selected` class: some themes
		// (Dracula Official) restyle every `.is-selected` with !important.
		cell.setAttribute("aria-pressed", String(iso === selectedIso));

		// Label and dots depend only on the counts, so skip unchanged cells.
		const key = `${created}|${modified}`;
		if (cell.dataset.dots === key) return;
		cell.dataset.dots = key;
		cell.setAttribute(
			"aria-label",
			t("calendar.dayAria", {
				date: DateTime.fromISO(iso).setLocale(locale).toLocaleString(DateTime.DATE_FULL),
				created,
				modified,
			})
		);
		const dots = cell.querySelector<HTMLElement>(".vault-pulse-calendar-dots");
		if (!dots) return;
		dots.empty();
		// One group per kind, so a narrow cell wraps modified onto a second row
		// instead of splitting a kind.
		buildDotGroup(dots, "is-created", created);
		buildDotGroup(dots, "is-modified", modified);
	});
}

function buildDotGroup(parent: HTMLElement, kind: string, count: number): void {
	if (count === 0) return;
	const group = parent.createSpan({ cls: "vault-pulse-calendar-dot-group" });
	for (let i = 0; i < Math.min(count, MAX_DOTS_PER_KIND); i++) {
		group.createSpan({ cls: `vault-pulse-calendar-dot ${kind}` });
	}
}

function buildArrow(
	parent: HTMLElement,
	action: "prev" | "next",
	icon: string,
	label: string
): void {
	// `clickable-icon` gives Obsidian's flat icon-button look in every theme.
	const btn = parent.createEl("button", {
		cls: "clickable-icon vault-pulse-calendar-arrow",
		attr: { type: "button", "aria-label": label, "data-action": action },
	});
	setIcon(btn, icon);
}

