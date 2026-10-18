/**
 * Exclusive computer use through an installed Cua Driver MCP executable.
 * The MCP client owns discovery, execution, image admission, and reconnection.
 * @module
 */
import z from '@deepseek-ai/schemastery';
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand';
import * as McpClient from '@deepseek-ai/dsh-mcp-client';
/** Cordis plugin identity for the installed Cua Driver provider. */
export const name = 'experimental-computer-use-cua-driver-mcp';
/** The shared reservation and tool registry must exist before connection. */
export const inject = ['computerUse', 'tools'];
/** Validate executable options; the MCP client resolves connection defaults. */
export const Config = z.object({
    command: z.string().pattern(/[^\s]/u).default('cua-driver'),
    args: z.array(String).default(['mcp']),
    toolCallTimeoutMs: z.number().min(1),
    reconnect: z.object({
        enabled: z.boolean(),
        initialDelayMs: z.number().min(1),
        maxDelayMs: z.number().min(1),
        maxAttempts: z.number().min(1).step(1),
    }),
});
/**
 * Reserve computer use and activate the installed Cua Driver's MCP tools.
 * Initial connection or discovery failure rejects activation and rolls back.
 * Disposal retains the reservation until the MCP child has finished teardown.
 * @param ctx - context providing computer use and the tool registry.
 * @param config - validated executable options and optional connection overrides.
 * @returns initial MCP tool-discovery completion.
 */
export async function apply(ctx, config) {
    const connection = McpClient.Config({
        command: config.command,
        args: config.args,
        ...config.toolCallTimeoutMs === undefined ? {} : { toolCallTimeoutMs: config.toolCallTimeoutMs },
        reconnect: config.reconnect,
        transport: 'stdio',
        serverName: 'cua-driver-mcp',
        failOnStartupError: true,
    });
    // One effect orders child shutdown before release; separate fiber effects
    // unload concurrently and could otherwise admit another live driver.
    let child;
    ctx.effect(function* () {
        yield ctx.computerUse.register(ComputerUseProviderName('cua-driver-mcp'));
        child = ctx.plugin(McpClient, connection);
        yield child.dispose;
    }, 'computer-use-cua-driver-mcp.connection');
    await child.await();
}
//# sourceMappingURL=index.js.map