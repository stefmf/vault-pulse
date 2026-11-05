import { defineConfig, globalIgnores } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

// The rule set the community directory's scanner builds on, plus sentence
// case on UI strings (in src/i18n/en.json and any left in TypeScript).
// Run from the repo root so manifest.json, package.json and LICENSE are linted.
const sentenceCase = {
	enforceCamelCaseLower: true,
	// Setting brands replaces the rule's defaults, so the ones used here are restated.
	brands: ["Vault Pulse", "Obsidian", "GitHub", "Markdown"],
	// Example folder paths in a description; prefix matching is case-sensitive.
	ignoreWords: ["Archive", "My-Archive"],
	// Lowercase unit labels shown after a number in the stat chips ("12 week").
	ignoreRegex: ["^(week|month|year)$"],
};

export default defineConfig([
	globalIgnores([
		"node_modules",
		"main.js",
		"test-vault",
		"coverage",
		"esbuild.config.mjs",
		"version-bump.mjs",
		"scripts",
		"tests",
		"vitest.config.ts",
	]),
	...obsidianmd.configs.recommendedWithLocalesEn,
	{
		languageOptions: {
			parserOptions: {
				projectService: {
					allowDefaultProject: ["eslint.config.mjs"],
				},
			},
		},
	},
	{
		files: ["src/**/*.ts"],
		rules: {
			"obsidianmd/ui/sentence-case": ["error", sentenceCase],
		},
	},
	{
		files: ["src/i18n/en.json"],
		rules: {
			"obsidianmd/ui/sentence-case-json": ["error", sentenceCase],
		},
	},
]);
