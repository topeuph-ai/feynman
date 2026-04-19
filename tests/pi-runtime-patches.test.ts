import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { patchPiRuntimeNodeModules } from "../src/pi/runtime-patches.js";

const SOURCE = `
async function prepareToolCall(currentContext, assistantMessage, toolCall, config, signal) {
    const tool = currentContext.tools?.find((t) => t.name === toolCall.name);
    if (!tool) {
        return {
            kind: "immediate",
            result: createErrorToolResult(\`Tool \${toolCall.name} not found\`),
            isError: true,
        };
    }
    try {
        const preparedToolCall = prepareToolCallArguments(tool, toolCall);
        const validatedArgs = validateToolArguments(tool, preparedToolCall);
        if (config.beforeToolCall) {
            const beforeResult = await config.beforeToolCall({
                assistantMessage,
                toolCall,
                args: validatedArgs,
                context: currentContext,
            }, signal);
        }
        return {
            kind: "prepared",
            toolCall,
            tool,
            args: validatedArgs,
        };
    }
    catch (error) {
        return {
            kind: "immediate",
            result: createErrorToolResult(error instanceof Error ? error.message : String(error)),
            isError: true,
        };
    }
}
`;

test("patchPiRuntimeNodeModules patches the installed Pi agent loop", async () => {
	const appRoot = mkdtempSync(join(tmpdir(), "feynman-runtime-patches-"));
	const agentLoopPath = join(appRoot, "node_modules", "@mariozechner", "pi-agent-core", "dist", "agent-loop.js");
	await mkdir(dirname(agentLoopPath), { recursive: true });
	writeFileSync(agentLoopPath, SOURCE, "utf8");

	assert.equal(patchPiRuntimeNodeModules(appRoot), true);

	const patched = readFileSync(agentLoopPath, "utf8");
	assert.match(patched, /function normalizeFeynmanToolAlias/);
	assert.match(patched, /\["google:search", "web_search"\]/);
	assert.match(patched, /prepareToolCallArguments\(tool, effectiveToolCall\)/);
	assert.equal(patchPiRuntimeNodeModules(appRoot), false);
});

test("patchPiRuntimeNodeModules is a no-op when Pi agent-core is absent", () => {
	const appRoot = mkdtempSync(join(tmpdir(), "feynman-runtime-patches-missing-"));

	assert.equal(patchPiRuntimeNodeModules(appRoot), false);
});
