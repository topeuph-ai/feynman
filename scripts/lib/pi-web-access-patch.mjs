export const PI_WEB_ACCESS_PATCH_TARGETS = [
	"index.ts",
	"exa.ts",
	"gemini-api.ts",
	"gemini-search.ts",
	"gemini-web.ts",
	"github-extract.ts",
	"perplexity.ts",
	"video-extract.ts",
	"youtube-extract.ts",
];

const LEGACY_CONFIG_EXPR = 'join(homedir(), ".pi", "web-search.json")';
const PATCHED_CONFIG_EXPR =
	'process.env.FEYNMAN_WEB_SEARCH_CONFIG ?? process.env.PI_WEB_SEARCH_CONFIG ?? join(homedir(), ".pi", "web-search.json")';

export function patchPiWebAccessSource(relativePath, source) {
	let patched = source;
	let changed = false;

	if (!patched.includes(PATCHED_CONFIG_EXPR)) {
		patched = patched.split(LEGACY_CONFIG_EXPR).join(PATCHED_CONFIG_EXPR);
		changed = patched !== source;
	}

	if (relativePath === "index.ts") {
		if (patched.includes('return "summary-review";')) {
			patched = patched.replace('return "summary-review";', 'return "none";');
			changed = true;
		}
		if (patched.includes('summary-review = open curator with auto summary draft (default)')) {
			patched = patched.replace(
				'summary-review = open curator with auto summary draft (default)',
				'summary-review = open curator with auto summary draft',
			);
			changed = true;
		}
	}

	if (relativePath === "index.ts" && changed) {
		patched = patched.replace('import { join } from "node:path";', 'import { dirname, join } from "node:path";');
		patched = patched.replace('const dir = join(homedir(), ".pi");', "const dir = dirname(WEB_SEARCH_CONFIG_PATH);");
	}

	return patched;
}
