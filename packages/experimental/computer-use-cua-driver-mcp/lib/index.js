import z from "@deepseek-ai/schemastery";
import { ComputerUseProviderName } from "@deepseek-ai/dsh-computer-use/brand";
import * as McpClient from "@deepseek-ai/dsh-mcp-client";
//#region lib/types/index.js
/**
* Exclusive computer use through an installed Cua Driver MCP executable.
* The MCP client owns discovery, execution, image admission, and reconnection.
* @module
*/
/** Cordis plugin identity for the installed Cua Driver provider. */
const name = "experimental-computer-use-cua-driver-mcp";
/** The shared reservation and tool registry must exist before connection. */
const inject = ["computerUse", "tools"];
/** Validate executable options; the MCP client resolves connection defaults. */
const Config = z.object({
	command: z.string().pattern(/[^\s]/u).default("cua-driver"),
	args: z.array(String).default(["mcp"]),
	toolCallTimeoutMs: z.number().min(1),
	reconnect: z.object({
		enabled: z.boolean(),
		initialDelayMs: z.number().min(1),
		maxDelayMs: z.number().min(1),
		maxAttempts: z.number().min(1).step(1)
	})
});
/**
* Reserve computer use and activate the installed Cua Driver's MCP tools.
* Initial connection or discovery failure rejects activation and rolls back.
* Disposal retains the reservation until the MCP child has finished teardown.
* @param ctx - context providing computer use and the tool registry.
* @param config - validated executable options and optional connection overrides.
* @returns initial MCP tool-discovery completion.
*/
async function apply(ctx, config) {
	const connection = McpClient.Config({
		command: config.command,
		args: config.args,
		...config.toolCallTimeoutMs === void 0 ? {} : { toolCallTimeoutMs: config.toolCallTimeoutMs },
		reconnect: config.reconnect,
		transport: "stdio",
		serverName: "cua-driver-mcp",
		failOnStartupError: true
	});
	let child;
	ctx.effect(function* () {
		yield ctx.computerUse.register(ComputerUseProviderName("cua-driver-mcp"));
		child = ctx.plugin(McpClient, connection);
		yield child.dispose;
	}, "computer-use-cua-driver-mcp.connection");
	await child.await();
}
//#endregion
export { Config, apply, inject, name };
