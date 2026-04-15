import en from "./en.json";

type LocaleBundle = typeof en;

// Register future locales here (copy en.json → <lang>.json, import, add entry).
const LOCALES: Record<string, LocaleBundle> = { en };

const DEFAULT_LOCALE = "en";

interface MomentGlobal {
	moment?: { locale?: () => string };
}

function getLocale(): string {
	const m = (window as unknown as MomentGlobal).moment;
	const raw = m?.locale?.() ?? DEFAULT_LOCALE;
	return raw.split("-")[0];
}

function lookup(
	obj: Record<string, unknown>,
	path: string
): string | undefined {
	const out = path.split(".").reduce<unknown>(
		(o, k) =>
			o != null && typeof o === "object"
				? (o as Record<string, unknown>)[k]
				: undefined,
		obj
	);
	return typeof out === "string" ? out : undefined;
}

function interpolate(
	value: string,
	params: Record<string, string | number>
): string {
	return value.replace(/\{(\w+)\}/g, (_, k: string) =>
		k in params ? String(params[k]) : `{${k}}`
	);
}

/**
 * Translate a key into the active UI locale, falling back to English.
 *
 * Plural handling: when `params.count` is present, the caller may provide
 * `<key>_one`, `<key>_other`, (`_few`, `_many`, `_two`, `_zero` for locales
 * that need them) alongside the base key. `Intl.PluralRules` selects the
 * appropriate form — English only needs `_one` + `_other`, other locales can
 * provide more. If no plural form exists, the base key's value is used.
 */
export function t(
	key: string,
	params?: Record<string, string | number>
): string {
	const locale = getLocale();
	const bundle = (LOCALES[locale] ?? LOCALES[DEFAULT_LOCALE]) as unknown as Record<
		string,
		unknown
	>;
	const fallback = LOCALES[DEFAULT_LOCALE] as unknown as Record<string, unknown>;

	let value = lookup(bundle, key) ?? lookup(fallback, key) ?? key;

	if (params && "count" in params) {
		const count = Number(params.count);
		if (Number.isFinite(count)) {
			const rule = new Intl.PluralRules(locale).select(count);
			const pluralKey = `${key}_${rule}`;
			const pluralValue =
				lookup(bundle, pluralKey) ?? lookup(fallback, pluralKey);
			if (pluralValue) value = pluralValue;
		}
	}

	return params ? interpolate(value, params) : value;
}

/**
 * UI locale for date formatting libraries (Luxon, Intl.DateTimeFormat).
 */
export function currentLocale(): string {
	return getLocale();
}
