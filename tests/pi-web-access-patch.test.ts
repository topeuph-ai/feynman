import test from "node:test";
import assert from "node:assert/strict";

import { patchPiWebAccessSource } from "../scripts/lib/pi-web-access-patch.mjs";

test("patchPiWebAccessSource rewrites legacy Pi web-search config paths", () => {
	const input = [
		'import { join } from "node:path";',
		'import { homedir } from "node:os";',
		'const CONFIG_PATH = join(homedir(), ".pi", "web-search.json");',
		"",
	].join("\n");

	const patched = patchPiWebAccessSource("perplexity.ts", input);

	assert.match(patched, /FEYNMAN_WEB_SEARCH_CONFIG/);
	assert.match(patched, /PI_WEB_SEARCH_CONFIG/);
});

test("patchPiWebAccessSource updates index.ts directory handling", () => {
	const input = [
		'import { existsSync, mkdirSync } from "node:fs";',
		'import { join } from "node:path";',
		'import { homedir } from "node:os";',
		'const WEB_SEARCH_CONFIG_PATH = join(homedir(), ".pi", "web-search.json");',
		'const dir = join(homedir(), ".pi");',
		"",
	].join("\n");

	const patched = patchPiWebAccessSource("index.ts", input);

	assert.match(patched, /import \{ dirname, join \} from "node:path";/);
	assert.match(patched, /const dir = dirname\(WEB_SEARCH_CONFIG_PATH\);/);
});

test("patchPiWebAccessSource defaults workflow to none for index.ts", () => {
	const input = [
		'function resolveWorkflow(input: unknown, hasUI: boolean): WebSearchWorkflow {',
		'\tif (!hasUI) return "none";',
		'\tif (typeof input === "string" && input.trim().toLowerCase() === "none") return "none";',
		'\treturn "summary-review";',
		'}',
		'workflow: Type.Optional(',
		'\tStringEnum(["none", "summary-review"], {',
		'\t\tdescription: "Search workflow mode: none = no curator, summary-review = open curator with auto summary draft (default)",',
		'\t}),',
		'),',
		"",
	].join("\n");

	const patched = patchPiWebAccessSource("index.ts", input);

	assert.match(patched, /return "none";/);
	assert.doesNotMatch(patched, /summary-review = open curator with auto summary draft \(default\)/);
});

test("patchPiWebAccessSource is idempotent", () => {
	const input = [
		'import { join } from "node:path";',
		'import { homedir } from "node:os";',
		'const CONFIG_PATH = join(homedir(), ".pi", "web-search.json");',
		"",
	].join("\n");

	const once = patchPiWebAccessSource("perplexity.ts", input);
	const twice = patchPiWebAccessSource("perplexity.ts", once);

	assert.equal(twice, once);
});
