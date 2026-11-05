/**
 * Scan-time benchmark on a 20,000-note stub vault. Run with `npx vitest bench`;
 * not part of `npm test` or CI. Compare against an earlier version by running
 * the same file at that commit.
 */
import { bench, describe } from "vitest";
import { DateTime } from "luxon";
import { TFile, type CachedMetadata } from "obsidian";
import { buildVaultActivity, type DataSource } from "../src/data";
import { DEFAULT_SETTINGS } from "../src/settings";

const NOTES = 20_000;
const today = DateTime.fromISO("2026-11-05").startOf("day");

function stubVault(): DataSource {
	const files: TFile[] = [];
	const caches = new Map<TFile, CachedMetadata>();
	for (let i = 0; i < NOTES; i++) {
		const created = today.minus({ days: i % 1500 });
		const modified = today.minus({ days: (i * 7) % 400 });
		const file = new TFile(`folder${i % 40}/note${i}.md`, {
			ctime: modified.toMillis(),
			mtime: modified.toMillis(),
			size: 100,
		});
		files.push(file);
		const frontmatter: Record<string, unknown> = {
			created: created.toISODate(),
			tags: i % 3 === 0 ? ["project"] : [],
		};
		if (i % 5 === 0) frontmatter.updated = modified.toISODate();
		caches.set(file, { frontmatter });
	}
	return {
		getMarkdownFiles: () => files,
		getFileCache: (file) => caches.get(file) ?? null,
	};
}

const source = stubVault();

describe(`buildVaultActivity, ${NOTES} notes`, () => {
	bench("default settings", () => {
		buildVaultActivity(source, DEFAULT_SETTINGS, { today });
	});
	bench("modified date from file time", () => {
		buildVaultActivity(source, { ...DEFAULT_SETTINGS, modifiedDate: "mtime" }, { today });
	});
});
