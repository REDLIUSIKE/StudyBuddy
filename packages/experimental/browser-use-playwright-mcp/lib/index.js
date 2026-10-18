import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserMcpConfig, mountSessionMcp, validateBrowserMcpConfig } from "@deepseek-ai/dsh-experimental-browser-use-runtime/mcp";
//#region lib/types/index.js
/** Chromium browser tools from the pinned Playwright MCP server. @module */
/** Cordis identity for the Playwright MCP browser provider. */
const name = "experimental-browser-use-playwright-mcp";
/** Services required for scoped MCP startup and prompt readiness checks. */
const inject = [
	"browserUse",
	"agents",
	"tools",
	"systemPrompt",
	"workingDirectory"
];
/** Validate the launch or attachment configuration before activation. */
const Config = BrowserMcpConfig;
/**
* Expose Playwright's upstream tools in each live Session's scope.
* The pinned npm server runs under the current Node executable; browser state is not persisted by DSH.
* @param ctx - provider context supplying browser use, Agents, and tools.
* @param config - validated browser choice and optional tool timeout.
*/
function apply(ctx, config) {
	validateBrowserMcpConfig(config);
	const cli = join(dirname(fileURLToPath(import.meta.resolve("@playwright/mcp/package.json"))), "cli.js");
	const env = Object.fromEntries(Object.keys(process.env).filter((key) => key.toUpperCase().startsWith("PLAYWRIGHT_MCP_")).map((key) => [key, ""]));
	const args = [
		cli,
		"--browser",
		"chromium"
	];
	if (config.mode === "attach") args.push("--cdp-endpoint", config.endpoint);
	else {
		args.push("--isolated");
		if (config.headless) args.push("--headless");
		if (config.executablePath !== void 0) args.push("--executable-path", config.executablePath);
	}
	mountSessionMcp(ctx, {
		name: "playwright-mcp",
		exclusive: config.mode === "attach",
		command: process.execPath,
		args,
		env,
		...config.toolCallTimeoutMs === void 0 ? {} : { toolCallTimeoutMs: config.toolCallTimeoutMs }
	});
}
//#endregion
export { Config, apply, inject, name };
