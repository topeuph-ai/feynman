const SEARCH_BY_EMBEDDING = [
	"export async function searchByEmbedding(query) {",
	"  return await callTool('embedding_similarity_search', { query });",
	"}",
].join("\n");

const SEARCH_BY_KEYWORD = [
	"export async function searchByKeyword(query) {",
	"  return await callTool('full_text_papers_search', { query });",
	"}",
].join("\n");

const AGENTIC_SEARCH = [
	"export async function agenticSearch(query) {",
	"  return await callTool('agentic_paper_retrieval', { query });",
	"}",
].join("\n");

const FALLBACK_HELPERS = `
function shouldFallbackToDiscoverPapers(err) {
  const message = getErrorMessage(err);
  return (
    message.includes('Tool embedding_similarity_search not found') ||
    message.includes('Tool full_text_papers_search not found') ||
    message.includes('Tool agentic_paper_retrieval not found') ||
    message.includes('embedding_similarity_search not found') ||
    message.includes('full_text_papers_search not found') ||
    message.includes('agentic_paper_retrieval not found')
  );
}

async function discoverPapers(query, mode) {
  const args = {
    question: query,
    keywords: query,
    difficulty: mode === 'keyword' ? 'easy' : 'graduate',
  };
  return await callTool('discover_papers', args);
}
`;

const REST_FALLBACK_HELPERS = `
const ALPHAXIV_REST_SEARCH_URL = 'https://api.alphaxiv.org/search/v2/paper/fast';

function shouldFallbackToSearchFallback(err) {
  const message = getErrorMessage(err);
  return (
    shouldFallbackToDiscoverPapers(err) ||
    message.includes('Tool discover_papers not found') ||
    message.includes('discover_papers not found') ||
    message.includes('-32602')
  );
}

async function searchRestFast(query) {
  const url = new URL(ALPHAXIV_REST_SEARCH_URL);
  url.searchParams.set('q', query);
  url.searchParams.set('includePrivate', 'false');

  const token = await getValidToken();
  const response = await fetch(url, {
    headers: token ? { Authorization: \`Bearer \${token}\` } : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(\`alphaXiv REST search failed (\${response.status}): \${text || response.statusText}\`);
  }

  return await response.json();
}

async function fallbackSearch(query, mode, cause) {
  if (!shouldFallbackToSearchFallback(cause)) {
    throw cause;
  }

  try {
    return await discoverPapers(query, mode);
  } catch (err) {
    if (shouldFallbackToSearchFallback(err)) {
      return await searchRestFast(query);
    }
    throw err;
  }
}
`;

const OLD_PATCHED_SEARCH_BY_EMBEDDING = [
	"export async function searchByEmbedding(query) {",
	"  try {",
	"    return await callTool('embedding_similarity_search', { query });",
	"  } catch (err) {",
	"    if (shouldFallbackToDiscoverPapers(err)) return await discoverPapers(query, 'semantic');",
	"    throw err;",
	"  }",
	"}",
].join("\n");

const OLD_PATCHED_SEARCH_BY_KEYWORD = [
	"export async function searchByKeyword(query) {",
	"  try {",
	"    return await callTool('full_text_papers_search', { query });",
	"  } catch (err) {",
	"    if (shouldFallbackToDiscoverPapers(err)) return await discoverPapers(query, 'keyword');",
	"    throw err;",
	"  }",
	"}",
].join("\n");

const OLD_PATCHED_AGENTIC_SEARCH = [
	"export async function agenticSearch(query) {",
	"  try {",
	"    return await callTool('agentic_paper_retrieval', { query });",
	"  } catch (err) {",
	"    if (shouldFallbackToDiscoverPapers(err)) return await discoverPapers(query, 'agentic');",
	"    throw err;",
	"  }",
	"}",
].join("\n");

const PATCHED_SEARCH_BY_EMBEDDING = [
	"export async function searchByEmbedding(query) {",
	"  try {",
	"    return await callTool('embedding_similarity_search', { query });",
	"  } catch (err) {",
	"    return await fallbackSearch(query, 'semantic', err);",
	"  }",
	"}",
].join("\n");

const PATCHED_SEARCH_BY_KEYWORD = [
	"export async function searchByKeyword(query) {",
	"  try {",
	"    return await callTool('full_text_papers_search', { query });",
	"  } catch (err) {",
	"    return await fallbackSearch(query, 'keyword', err);",
	"  }",
	"}",
].join("\n");

const PATCHED_AGENTIC_SEARCH = [
	"export async function agenticSearch(query) {",
	"  try {",
	"    return await callTool('agentic_paper_retrieval', { query });",
	"  } catch (err) {",
	"    return await fallbackSearch(query, 'agentic', err);",
	"  }",
	"}",
].join("\n");

export function patchAlphaHubSearchSource(source) {
	if (source.includes("async function searchRestFast(")) {
		return source;
	}
	const hasSearchFunctions =
		source.includes(SEARCH_BY_EMBEDDING) ||
		source.includes(SEARCH_BY_KEYWORD) ||
		source.includes(AGENTIC_SEARCH) ||
		source.includes(OLD_PATCHED_SEARCH_BY_EMBEDDING) ||
		source.includes(OLD_PATCHED_SEARCH_BY_KEYWORD) ||
		source.includes(OLD_PATCHED_AGENTIC_SEARCH);
	if (!hasSearchFunctions) {
		return source;
	}

	let patched = source;
	const anchor = "async function callTool(name, args) {";
	if (patched.includes(anchor)) {
		const helpers = patched.includes("function shouldFallbackToDiscoverPapers(")
			? REST_FALLBACK_HELPERS
			: `${FALLBACK_HELPERS}\n${REST_FALLBACK_HELPERS}`;
		patched = patched.replace(anchor, `${helpers}\n${anchor}`);
	}
	patched = patched
		.replace(OLD_PATCHED_SEARCH_BY_EMBEDDING, PATCHED_SEARCH_BY_EMBEDDING)
		.replace(OLD_PATCHED_SEARCH_BY_KEYWORD, PATCHED_SEARCH_BY_KEYWORD)
		.replace(OLD_PATCHED_AGENTIC_SEARCH, PATCHED_AGENTIC_SEARCH)
		.replace(SEARCH_BY_EMBEDDING, PATCHED_SEARCH_BY_EMBEDDING)
		.replace(SEARCH_BY_KEYWORD, PATCHED_SEARCH_BY_KEYWORD)
		.replace(AGENTIC_SEARCH, PATCHED_AGENTIC_SEARCH);
	return patched;
}
