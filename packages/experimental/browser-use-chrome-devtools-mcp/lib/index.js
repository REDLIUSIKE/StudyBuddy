import { fileURLToPath } from "node:url";
import { BrowserMcpConfig, mountSessionMcp, validateBrowserMcpConfig } from "@deepseek-ai/dsh-experimental-browser-use-runtime/mcp";
//#region lib/types/index.js
/** Chromium inspection and automation through the pinned Chrome DevTools MCP server. @module */
/** Cordis identity for the Chrome DevTools MCP browser provider. */
const name = "experimental-browser-use-chrome-devtools-mcp";
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
* Expose Chrome DevTools' upstream catalog through one MCP process per live Session.
* Attached browsers remain externally owned; the server disables usage statistics.
* @param ctx - provider context supplying browser use, Agents, and tools.
* @param config - validated browser choice and optional tool timeout.
*/
function apply(ctx, config) {
	validateBrowserMcpConfig(config);
	const args = [fileURLToPath(import.meta.resolve("chrome-devtools-mcp/build/src/bin/chrome-devtools-mcp.js")), "--no-usage-statistics"];
	if (config.mode === "attach") args.push(/^wss?:/u.test(config.endpoint) ? "--ws-endpoint" : "--browser-url", config.endpoint);
	else {
		args.push("--isolated", `--headless=${String(config.headless)}`);
		if (config.executablePath !== void 0) args.push("--executable-path", config.executablePath);
	}
	mountSessionMcp(ctx, {
		name: "chrome-devtools-mcp",
		exclusive: config.mode === "attach",
		command: process.execPath,
		args,
		...config.toolCallTimeoutMs === void 0 ? {} : { toolCallTimeoutMs: config.toolCallTimeoutMs }
	});
}
//#endregion
export { Config, apply, inject, name };
