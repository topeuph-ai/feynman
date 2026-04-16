import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { installPackageSources, seedBundledWorkspacePackages } from "../src/pi/package-ops.js";

function createBundledWorkspace(appRoot: string, packageNames: string[]): void {
	for (const packageName of packageNames) {
		const packageDir = resolve(appRoot, ".feynman", "npm", "node_modules", packageName);
		mkdirSync(packageDir, { recursive: true });
		writeFileSync(
			join(packageDir, "package.json"),
			JSON.stringify({ name: packageName, version: "1.0.0" }, null, 2) + "\n",
			"utf8",
		);
	}
}

function writeSettings(agentDir: string, settings: Record<string, unknown>): void {
	mkdirSync(agentDir, { recursive: true });
	writeFileSync(resolve(agentDir, "settings.json"), JSON.stringify(settings, null, 2) + "\n", "utf8");
}

function writeFakeNpmScript(root: string, body: string): string {
	const scriptPath = resolve(root, "fake-npm.mjs");
	writeFileSync(scriptPath, body, "utf8");
	return scriptPath;
}

test("seedBundledWorkspacePackages links bundled packages into the Feynman npm prefix", () => {
	const appRoot = mkdtempSync(join(tmpdir(), "feynman-bundle-"));
	const homeRoot = mkdtempSync(join(tmpdir(), "feynman-home-"));
	const agentDir = resolve(homeRoot, "agent");
	mkdirSync(agentDir, { recursive: true });

	createBundledWorkspace(appRoot, ["pi-subagents", "@samfp/pi-memory"]);

	const seeded = seedBundledWorkspacePackages(agentDir, appRoot, [
		"npm:pi-subagents",
		"npm:@samfp/pi-memory",
	]);

	assert.deepEqual(seeded.sort(), ["npm:@samfp/pi-memory", "npm:pi-subagents"]);
	const globalRoot = resolve(homeRoot, "npm-global", "lib", "node_modules");
	assert.equal(existsSync(resolve(globalRoot, "pi-subagents", "package.json")), true);
	assert.equal(existsSync(resolve(globalRoot, "@samfp", "pi-memory", "package.json")), true);
});

test("seedBundledWorkspacePackages preserves existing installed packages", () => {
	const appRoot = mkdtempSync(join(tmpdir(), "feynman-bundle-"));
	const homeRoot = mkdtempSync(join(tmpdir(), "feynman-home-"));
	const agentDir = resolve(homeRoot, "agent");
	const existingPackageDir = resolve(homeRoot, "npm-global", "lib", "node_modules", "pi-subagents");

	mkdirSync(agentDir, { recursive: true });
	createBundledWorkspace(appRoot, ["pi-subagents"]);
	mkdirSync(existingPackageDir, { recursive: true });
	writeFileSync(resolve(existingPackageDir, "package.json"), '{"name":"pi-subagents","version":"user"}\n', "utf8");

	const seeded = seedBundledWorkspacePackages(agentDir, appRoot, ["npm:pi-subagents"]);

	assert.deepEqual(seeded, []);
	assert.equal(readFileSync(resolve(existingPackageDir, "package.json"), "utf8"), '{"name":"pi-subagents","version":"user"}\n');
	assert.equal(lstatSync(existingPackageDir).isSymbolicLink(), false);
});

test("installPackageSources filters noisy npm chatter but preserves meaningful output", async () => {
	const root = mkdtempSync(join(tmpdir(), "feynman-package-ops-"));
	const workingDir = resolve(root, "project");
	const agentDir = resolve(root, "agent");
	mkdirSync(workingDir, { recursive: true });

	const scriptPath = writeFakeNpmScript(root, [
		`console.log("npm warn deprecated node-domexception@1.0.0: Use your platform's native DOMException instead");`,
		'console.log("changed 343 packages in 9s");',
		'console.log("59 packages are looking for funding");',
		'console.log("run `npm fund` for details");',
		'console.error("visible stderr line");',
		'console.log("visible stdout line");',
		"process.exit(0);",
	].join("\n"));

	writeSettings(agentDir, {
		npmCommand: [process.execPath, scriptPath],
	});

	let stdout = "";
	let stderr = "";
	const originalStdoutWrite = process.stdout.write.bind(process.stdout);
	const originalStderrWrite = process.stderr.write.bind(process.stderr);
	(process.stdout.write as unknown as (chunk: string | Uint8Array) => boolean) = ((chunk: string | Uint8Array) => {
		stdout += chunk.toString();
		return true;
	}) as typeof process.stdout.write;
	(process.stderr.write as unknown as (chunk: string | Uint8Array) => boolean) = ((chunk: string | Uint8Array) => {
		stderr += chunk.toString();
		return true;
	}) as typeof process.stderr.write;

	try {
		const result = await installPackageSources(workingDir, agentDir, ["npm:test-visible-package"]);
		assert.deepEqual(result.installed, ["npm:test-visible-package"]);
		assert.deepEqual(result.skipped, []);
	} finally {
		process.stdout.write = originalStdoutWrite;
		process.stderr.write = originalStderrWrite;
	}

	const combined = `${stdout}\n${stderr}`;
	assert.match(combined, /visible stdout line/);
	assert.match(combined, /visible stderr line/);
	assert.doesNotMatch(combined, /node-domexception/);
	assert.doesNotMatch(combined, /changed 343 packages/);
	assert.doesNotMatch(combined, /packages are looking for funding/);
	assert.doesNotMatch(combined, /npm fund/);
});

test("installPackageSources skips native packages on unsupported Node majors before invoking npm", async () => {
	const root = mkdtempSync(join(tmpdir(), "feynman-package-ops-"));
	const workingDir = resolve(root, "project");
	const agentDir = resolve(root, "agent");
	const markerPath = resolve(root, "npm-invoked.txt");
	mkdirSync(workingDir, { recursive: true });

	const scriptPath = writeFakeNpmScript(root, [
		`import { writeFileSync } from "node:fs";`,
		`writeFileSync(${JSON.stringify(markerPath)}, "invoked\\n", "utf8");`,
		"process.exit(0);",
	].join("\n"));

	writeSettings(agentDir, {
		npmCommand: [process.execPath, scriptPath],
	});

	const originalVersion = process.versions.node;
	Object.defineProperty(process.versions, "node", { value: "25.0.0", configurable: true });
	try {
		const result = await installPackageSources(workingDir, agentDir, ["npm:@kaiserlich-dev/pi-session-search"]);
		assert.deepEqual(result.installed, []);
		assert.deepEqual(result.skipped, ["npm:@kaiserlich-dev/pi-session-search"]);
		assert.equal(existsSync(markerPath), false);
	} finally {
		Object.defineProperty(process.versions, "node", { value: originalVersion, configurable: true });
	}
});
