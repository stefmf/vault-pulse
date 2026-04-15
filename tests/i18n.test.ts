import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { t, currentLocale } from "../src/i18n";

describe("i18n t()", () => {
	beforeEach(() => {
		(window as unknown as { moment?: { locale: () => string } }).moment = {
			locale: () => "en",
		};
	});

	afterEach(() => {
		delete (window as unknown as { moment?: unknown }).moment;
		vi.restoreAllMocks();
	});

	it("looks up a nested key", () => {
		expect(t("ribbon.openPane")).toBe("Open Vault Pulse");
	});

	it("returns the key itself when missing", () => {
		expect(t("does.not.exist")).toBe("does.not.exist");
	});

	it("interpolates params", () => {
		expect(t("detail.streak", { days: 5 })).toBe("5-day streak");
	});

	it("leaves unresolved placeholders visible", () => {
		expect(t("detail.streak", { unused: 7 })).toBe("{days}-day streak");
	});

	it("selects singular plural form via Intl.PluralRules", () => {
		expect(t("detail.files", { count: 1 })).toBe("1 file");
	});

	it("selects other plural form", () => {
		expect(t("detail.files", { count: 3 })).toBe("3 files");
		expect(t("detail.files", { count: 0 })).toBe("0 files");
	});

	it("falls back to en when locale is unknown", () => {
		(window as unknown as { moment: { locale: () => string } }).moment = {
			locale: () => "de",
		};
		expect(t("ribbon.openPane")).toBe("Open Vault Pulse");
	});

	it("currentLocale strips region suffix", () => {
		(window as unknown as { moment: { locale: () => string } }).moment = {
			locale: () => "en-US",
		};
		expect(currentLocale()).toBe("en");
	});
});
