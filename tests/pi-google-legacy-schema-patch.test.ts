import test from "node:test";
import assert from "node:assert/strict";

import { patchPiGoogleLegacySchemaSource } from "../scripts/lib/pi-google-legacy-schema-patch.mjs";

test("patchPiGoogleLegacySchemaSource rewrites legacy parameters conversion to normalize const", () => {
	const input = [
		"export function convertTools(tools, useParameters = false) {",
		"    if (tools.length === 0) return undefined;",
		"    return [",
		"        {",
		"            functionDeclarations: tools.map((tool) => ({",
		"                name: tool.name,",
		"                description: tool.description,",
		'                ...(useParameters ? { parameters: tool.parameters } : { parametersJsonSchema: tool.parameters }),',
		"            })),",
		"        },",
		"    ];",
		"}",
		"",
	].join("\n");

	const patched = patchPiGoogleLegacySchemaSource(input);

	assert.match(patched, /function normalizeLegacyToolSchema\(schema\)/);
	assert.match(patched, /normalized\.enum = \[value\]/);
	assert.match(patched, /parameters: normalizeLegacyToolSchema\(tool\.parameters\)/);
});

test("patchPiGoogleLegacySchemaSource is idempotent", () => {
	const input = [
		"export function convertTools(tools, useParameters = false) {",
		'                ...(useParameters ? { parameters: tool.parameters } : { parametersJsonSchema: tool.parameters }),',
		"}",
		"",
	].join("\n");

	const once = patchPiGoogleLegacySchemaSource(input);
	const twice = patchPiGoogleLegacySchemaSource(once);

	assert.equal(twice, once);
});
