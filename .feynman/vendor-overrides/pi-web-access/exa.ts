import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { activityMonitor } from "./activity.js";

import type { SearchOptions, SearchResponse, SearchResult } from "./perplexity.js";

const EXA_API_URL = "https://api.exa.ai/search";
const CONFIG_PATH = join(homedir(), ".pi", "web-search.json");

interface WebSearchConfig {
	exaApiKey?: string;
}

interface ExaSearchResult {
	title?: string;
	url?: string;
	text?: string;
	highlights?: string[];
	summary?: string;
}

let cachedConfig: WebSearchConfig | null = null;

function loadConfig(): WebSearchConfig {
	if (cachedConfig) return cachedConfig;

	if (existsSync(CONFIG_PATH)) {
		try {
			cachedConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as WebSearchConfig;
			return cachedConfig;
		} catch {
			cachedConfig = {};
		}
	} else {
		cachedConfig = {};
	}
	return cachedConfig;
}

function getApiKey(): string {
	const config = loadConfig();
	const key = process.env.EXA_API_KEY || config.exaApiKey;
	if (!key) {
		throw new Error(
			"Exa API key not found. Either:\n" +
			`  1. Create ${CONFIG_PATH} with { "exaApiKey": "your-key" }\n` +
			"  2. Set EXA_API_KEY environment variable\n" +
			"Get a key from the Exa dashboard."
		);
	}
	return key;
}

function toSnippet(result: ExaSearchResult): string {
	if (Array.isArray(result.highlights) && result.highlights.length > 0) {
		return result.highlights.join(" ");
	}
	if (typeof result.summary === "string" && result.summary.trim()) {
		return result.summary.trim();
	}
	if (typeof result.text === "string" && result.text.trim()) {
		return result.text.trim().slice(0, 400);
	}
	return "";
}

function formatAnswer(results: SearchResult[]): string {
	return results
		.map((result, index) => {
			const snippet = result.snippet ? `\n${result.snippet}` : "";
			return `${index + 1}. ${result.title}\n${result.url}${snippet}`;
		})
		.join("\n\n");
}

export function isExaAvailable(): boolean {
	const config = loadConfig();
	return Boolean(process.env.EXA_API_KEY || config.exaApiKey);
}

export async function searchWithExa(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
	const activityId = activityMonitor.logStart({ type: "api", query });
	const apiKey = getApiKey();
	const numResults = Math.min(options.numResults ?? 5, 20);
	const includeDomains = options.domainFilter?.filter((entry) => !entry.startsWith("-")) ?? [];
	const excludeDomains = options.domainFilter?.filter((entry) => entry.startsWith("-")).map((entry) => entry.slice(1)) ?? [];

	const requestBody: Record<string, unknown> = {
		query,
		type: "auto",
		numResults,
		contents: {
			highlights: {
				numSentences: 3,
			},
		},
	};

	if (includeDomains.length > 0) {
		requestBody.includeDomains = includeDomains;
	}
	if (excludeDomains.length > 0) {
		requestBody.excludeDomains = excludeDomains;
	}

	try {
		const response = await fetch(EXA_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": apiKey,
			},
			body: JSON.stringify(requestBody),
			signal: options.signal,
		});

		if (!response.ok) {
			activityMonitor.logComplete(activityId, response.status);
			throw new Error(`Exa API error ${response.status}: ${(await response.text()).slice(0, 300)}`);
		}

		const data = await response.json() as { results?: ExaSearchResult[] };
		const results = (Array.isArray(data.results) ? data.results : [])
			.slice(0, numResults)
			.map((result, index) => ({
				title: result.title?.trim() || `Source ${index + 1}`,
				url: result.url?.trim() || "",
				snippet: toSnippet(result),
			}))
			.filter((result) => result.url.length > 0);

		activityMonitor.logComplete(activityId, response.status);
		return {
			answer: formatAnswer(results),
			results,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message.toLowerCase().includes("abort")) {
			activityMonitor.logComplete(activityId, 0);
		} else {
			activityMonitor.logError(activityId, message);
		}
		throw error;
	}
}
