import tsParser from "@typescript-eslint/parser";
import obsidianmd from "eslint-plugin-obsidianmd";

// Minimal, non-typed ruleset covering the bot's required checks.
// Typed rules (no-plugin-as-component, etc.) need a tsconfig with types;
// omit them here to avoid the parser-services dependency.
export default [
	{
		files: ["src/**/*.ts"],
		languageOptions: {
			parser: tsParser,
			parserOptions: { ecmaVersion: "latest", sourceType: "module" },
		},
		plugins: { obsidianmd },
		rules: {
			"obsidianmd/ui/sentence-case": [
				"error",
				{ enforceCamelCaseLower: true },
			],
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/detach-leaves": "error",
			"obsidianmd/no-sample-code": "error",
			"obsidianmd/no-tfile-tfolder-cast": "error",
			"obsidianmd/object-assign": "error",
			"obsidianmd/commands/no-command-in-command-id": "error",
			"obsidianmd/commands/no-command-in-command-name": "error",
			"obsidianmd/commands/no-plugin-id-in-command-id": "error",
			"obsidianmd/commands/no-plugin-name-in-command-name": "error",
			"obsidianmd/regex-lookbehind": "error",
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/vault/iterate": "error",
			"obsidianmd/hardcoded-config-path": "error",
			"obsidianmd/prefer-abstract-input-suggest": "error",
			"obsidianmd/no-forbidden-elements": "error",
		},
	},
];
