import "dotenv/config";

import { mkdirSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

import {
	getUserName as getAlphaUserName,
	isLoggedIn as isAlphaLoggedIn,
	login as loginAlpha,
	logout as logoutAlpha,
} from "@companion-ai/alpha-hub/lib";
import {
	AuthStorage,
	createAgentSession,
	createCodingTools,
	DefaultResourceLoader,
	ModelRegistry,
	SessionManager,
	SettingsManager,
} from "@mariozechner/pi-coding-agent";

import { FEYNMAN_SYSTEM_PROMPT } from "./feynman-prompt.js";

type ThinkingLevel = "off" | "low" | "medium" | "high";

function printHelp(): void {
	console.log(`Feynman commands:
	  /help                     Show this help
	  /alpha-login              Sign in to alphaXiv
	  /alpha-logout             Clear alphaXiv auth
	  /alpha-status             Show alphaXiv auth status
	  /new                      Start a fresh persisted session
	  /exit                     Quit the REPL
	  /lit-review <topic>       Expand the literature review prompt template
	  /replicate <paper>        Expand the replication prompt template
	  /reading-list <topic>     Expand the reading list prompt template
	  /paper-code-audit <item>  Expand the paper/code audit prompt template
	  /paper-draft <topic>      Expand the paper-style writing prompt template

	CLI flags:
  --prompt "<text>"         Run one prompt and exit
  --alpha-login             Sign in to alphaXiv and exit
  --alpha-logout            Clear alphaXiv auth and exit
  --alpha-status            Show alphaXiv auth status and exit
  --model provider:model    Force a specific model
  --thinking level          off | low | medium | high
  --cwd /path/to/workdir    Working directory for tools
  --session-dir /path       Session storage directory`);
}

function parseModelSpec(spec: string, modelRegistry: ModelRegistry) {
	const trimmed = spec.trim();
	const separator = trimmed.includes(":") ? ":" : trimmed.includes("/") ? "/" : null;
	if (!separator) {
		return undefined;
	}

	const [provider, ...rest] = trimmed.split(separator);
	const id = rest.join(separator);
	if (!provider || !id) {
		return undefined;
	}

	return modelRegistry.find(provider, id);
}

function normalizeThinkingLevel(value: string | undefined): ThinkingLevel | undefined {
	if (!value) {
		return undefined;
	}

	const normalized = value.toLowerCase();
	if (normalized === "off" || normalized === "low" || normalized === "medium" || normalized === "high") {
		return normalized;
	}

	return undefined;
}

async function main(): Promise<void> {
	const here = dirname(fileURLToPath(import.meta.url));
	const appRoot = resolve(here, "..");

	const { values, positionals } = parseArgs({
		allowPositionals: true,
		options: {
			cwd: { type: "string" },
			help: { type: "boolean" },
			"alpha-login": { type: "boolean" },
			"alpha-logout": { type: "boolean" },
			"alpha-status": { type: "boolean" },
			model: { type: "string" },
			"new-session": { type: "boolean" },
			prompt: { type: "string" },
			"session-dir": { type: "string" },
			thinking: { type: "string" },
		},
	});

	if (values.help) {
		printHelp();
		return;
	}

	if (values["alpha-login"]) {
		const result = await loginAlpha();
		const name =
			(result.userInfo &&
			typeof result.userInfo === "object" &&
			"name" in result.userInfo &&
			typeof result.userInfo.name === "string")
				? result.userInfo.name
				: getAlphaUserName();
		console.log(name ? `alphaXiv login complete: ${name}` : "alphaXiv login complete");
		return;
	}

	if (values["alpha-logout"]) {
		logoutAlpha();
		console.log("alphaXiv auth cleared");
		return;
	}

	if (values["alpha-status"]) {
		if (isAlphaLoggedIn()) {
			const name = getAlphaUserName();
			console.log(name ? `alphaXiv logged in as ${name}` : "alphaXiv logged in");
		} else {
			console.log("alphaXiv not logged in");
		}
		return;
	}

	const workingDir = resolve(values.cwd ?? process.cwd());
	const sessionDir = resolve(values["session-dir"] ?? resolve(appRoot, ".feynman", "sessions"));
	mkdirSync(sessionDir, { recursive: true });
	const settingsManager = SettingsManager.create(appRoot);

	const authStorage = AuthStorage.create();
	const modelRegistry = new ModelRegistry(authStorage);
	const explicitModelSpec = values.model ?? process.env.FEYNMAN_MODEL;
	const explicitModel = explicitModelSpec ? parseModelSpec(explicitModelSpec, modelRegistry) : undefined;

	if (explicitModelSpec && !explicitModel) {
		throw new Error(`Unknown model: ${explicitModelSpec}`);
	}

	if (!explicitModel) {
		const available = await modelRegistry.getAvailable();
		if (available.length === 0) {
			throw new Error(
				"No models are available. Configure pi auth or export a provider API key before starting Feynman.",
			);
		}
	}

	const thinkingLevel = normalizeThinkingLevel(values.thinking ?? process.env.FEYNMAN_THINKING) ?? "medium";

	const resourceLoader = new DefaultResourceLoader({
		cwd: appRoot,
		additionalExtensionPaths: [resolve(appRoot, "extensions")],
		additionalPromptTemplatePaths: [resolve(appRoot, "prompts")],
		additionalSkillPaths: [resolve(appRoot, "skills")],
		settingsManager,
		systemPromptOverride: () => FEYNMAN_SYSTEM_PROMPT,
		appendSystemPromptOverride: () => [],
	});
	await resourceLoader.reload();

	const sessionManager = values["new-session"]
		? SessionManager.create(workingDir, sessionDir)
		: SessionManager.continueRecent(workingDir, sessionDir);

	const { session } = await createAgentSession({
		authStorage,
		cwd: workingDir,
		model: explicitModel,
		modelRegistry,
		resourceLoader,
		sessionManager,
		settingsManager,
		thinkingLevel,
		tools: createCodingTools(workingDir),
	});

	session.subscribe((event) => {
		if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
			process.stdout.write(event.assistantMessageEvent.delta);
			return;
		}

		if (event.type === "tool_execution_start") {
			process.stderr.write(`\n[tool] ${event.toolName}\n`);
			return;
		}

		if (event.type === "tool_execution_end" && event.isError) {
			process.stderr.write(`[tool-error] ${event.toolName}\n`);
		}
	});

	const initialPrompt = values.prompt ?? (positionals.length > 0 ? positionals.join(" ") : undefined);

	if (initialPrompt) {
		await session.prompt(initialPrompt);
		process.stdout.write("\n");
		session.dispose();
		return;
	}

	console.log("Feynman research agent");
	console.log(`working dir: ${workingDir}`);
	console.log(`session dir: ${sessionDir}`);
	console.log("type /help for commands");

	const rl = readline.createInterface({ input, output });

	try {
		while (true) {
			const line = (await rl.question("feynman> ")).trim();
			if (!line) {
				continue;
			}

			if (line === "/exit" || line === "/quit") {
				break;
			}

			if (line === "/help") {
				printHelp();
				continue;
			}

			if (line === "/alpha-login") {
				const result = await loginAlpha();
				const name =
					(result.userInfo &&
					typeof result.userInfo === "object" &&
					"name" in result.userInfo &&
					typeof result.userInfo.name === "string")
						? result.userInfo.name
						: getAlphaUserName();
				console.log(name ? `alphaXiv login complete: ${name}` : "alphaXiv login complete");
				continue;
			}

			if (line === "/alpha-logout") {
				logoutAlpha();
				console.log("alphaXiv auth cleared");
				continue;
			}

			if (line === "/alpha-status") {
				if (isAlphaLoggedIn()) {
					const name = getAlphaUserName();
					console.log(name ? `alphaXiv logged in as ${name}` : "alphaXiv logged in");
				} else {
					console.log("alphaXiv not logged in");
				}
				continue;
			}

			if (line === "/new") {
				await session.newSession();
				console.log("started a new session");
				continue;
			}

			await session.prompt(line);
			process.stdout.write("\n");
		}
	} finally {
		rl.close();
		session.dispose();
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
