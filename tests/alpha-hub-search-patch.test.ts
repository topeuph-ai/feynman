import test from "node:test";
import assert from "node:assert/strict";

import { patchAlphaHubSearchSource } from "../scripts/lib/alpha-hub-search-patch.mjs";

const SOURCE = `
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

async function callTool(name, args) {
  return { name, args };
}

export async function searchByEmbedding(query) {
  return await callTool('embedding_similarity_search', { query });
}

export async function searchByKeyword(query) {
  return await callTool('full_text_papers_search', { query });
}

export async function agenticSearch(query) {
  return await callTool('agentic_paper_retrieval', { query });
}
`;

test("patchAlphaHubSearchSource falls back to discover_papers for removed alphaXiv search tools", () => {
	const patched = patchAlphaHubSearchSource(SOURCE);

	assert.match(patched, /function shouldFallbackToDiscoverPapers/);
	assert.match(patched, /function shouldFallbackToSearchFallback/);
	assert.match(patched, /callTool\('discover_papers', args\)/);
	assert.match(patched, /const ALPHAXIV_REST_SEARCH_URL = 'https:\/\/api\.alphaxiv\.org\/search\/v2\/paper\/fast'/);
	assert.match(patched, /url\.searchParams\.set\('q', query\)/);
	assert.match(patched, /url\.searchParams\.set\('includePrivate', 'false'\)/);
	assert.match(patched, /return await searchRestFast\(query\)/);
	assert.match(patched, /question: query/);
	assert.match(patched, /keywords: query/);
	assert.match(patched, /difficulty: mode === 'keyword' \? 'easy' : 'graduate'/);
	assert.match(patched, /Tool embedding_similarity_search not found/);
	assert.match(patched, /return await callTool\('embedding_similarity_search', \{ query \}\)/);
	assert.match(patched, /return await fallbackSearch\(query, 'semantic', err\)/);
	assert.match(patched, /return await fallbackSearch\(query, 'keyword', err\)/);
	assert.match(patched, /return await fallbackSearch\(query, 'agentic', err\)/);
});

test("patchAlphaHubSearchSource is idempotent", () => {
	const once = patchAlphaHubSearchSource(SOURCE);
	const twice = patchAlphaHubSearchSource(once);
	assert.equal(twice, once);
});

test("patchAlphaHubSearchSource upgrades the discover_papers-only fallback", () => {
	const discoverOnly = patchAlphaHubSearchSource(SOURCE).replace(
		/const ALPHAXIV_REST_SEARCH_URL[\s\S]*?\nasync function callTool\(name, args\) \{/,
		"async function callTool(name, args) {",
	).replaceAll("return await fallbackSearch(query, 'semantic', err);", "if (shouldFallbackToDiscoverPapers(err)) return await discoverPapers(query, 'semantic');\n    throw err;")
		.replaceAll("return await fallbackSearch(query, 'keyword', err);", "if (shouldFallbackToDiscoverPapers(err)) return await discoverPapers(query, 'keyword');\n    throw err;")
		.replaceAll("return await fallbackSearch(query, 'agentic', err);", "if (shouldFallbackToDiscoverPapers(err)) return await discoverPapers(query, 'agentic');\n    throw err;");

	const upgraded = patchAlphaHubSearchSource(discoverOnly);

	assert.match(upgraded, /async function searchRestFast/);
	assert.match(upgraded, /return await fallbackSearch\(query, 'semantic', err\)/);
	assert.match(upgraded, /return await fallbackSearch\(query, 'keyword', err\)/);
	assert.match(upgraded, /return await fallbackSearch\(query, 'agentic', err\)/);
});
