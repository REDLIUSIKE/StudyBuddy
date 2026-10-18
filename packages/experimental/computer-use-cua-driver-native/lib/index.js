import Schema from "@deepseek-ai/schemastery";
import { ComputerUseProviderName } from "@deepseek-ai/dsh-computer-use/brand";
import { createMcpToolDefinition } from "@deepseek-ai/dsh-mcp-client";
import { z } from "zod";
//#region lib/types/index.js
/**
* Computer use through the in-process Cua Driver native SDK and its own tools.
* @module @deepseek-ai/dsh-experimental-computer-use-cua-driver-native
*/
/** Cordis plugin identity for the native Cua Driver provider. */
const name = "experimental-computer-use-cua-driver-native";
/** Services required before the native runtime can publish tools. */
const inject = [
	"computerUse",
	"tools",
	"systemPrompt"
];
/** The native provider uses the installed SDK's same-process defaults. */
const Config = Schema.object({});
const ToolCatalog = z.object({ tools: z.array(z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	inputSchema: z.record(z.string(), z.unknown()),
	outputSchema: z.unknown().optional()
})) });
/** DeepSeek's function-name alphabet and maximum length are protocol constants. */
const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/u;
const GUIDANCE = `Cua Driver native computer-use tools operate the host desktop. Discover the exact app and window, then get a fresh window snapshot before acting. Use element_token from that snapshot, or coordinates from its screenshot. A new snapshot of that window invalidates its earlier element tokens. Select either target or the legacy pid/window_id fields; do not combine them.

Prefer background delivery. A refusal does not authorize a foreground retry. Verify the requested outcome from fresh state after an action; a delivered click alone does not prove the outcome. After cancellation, inspect current state before retrying because completed input is not rolled back. Other sessions and applications may change the same desktop.

On macOS, cursor-overlay operations may return facility_unavailable even when screenshots and input work.`;
/**
* Own one native runtime and expose its catalog through the MCP result adapter.
* Startup failures roll back every registration. Unload removes tools, aborts
* calls and image admission, awaits settlement and SDK shutdown, then releases computer use.
* @param ctx - context providing the exclusive registration and tool services.
* @returns after native import, runtime creation, and tool discovery complete.
*/
async function apply(ctx) {
	const lifetime = new AbortController();
	const pending = /* @__PURE__ */ new Set();
	let driver;
	ctx.on("internal/plugin", (fiber) => {
		if (fiber === ctx.fiber && fiber.uid === null) lifetime.abort();
	}, { global: true });
	let ready = Promise.resolve();
	const dispose = ctx.effect(function* () {
		yield ctx.computerUse.register(ComputerUseProviderName("cua-driver-native"));
		yield async () => {
			lifetime.abort();
			await ready.catch(() => {});
			await Promise.allSettled(pending);
			if (driver !== void 0) {
				await driver.shutdown();
				driver.uniffiDestroy();
			}
		};
		const child = ctx.plugin({
			name: "computer-use-cua-driver-native-runtime",
			inject: ["tools", "systemPrompt"],
			apply: mountRuntime
		});
		yield child.dispose;
		ready = Promise.resolve(child).then(() => {});
	}, "computer-use-cua-driver-native.runtime");
	try {
		await ready;
	} catch (error) {
		await dispose();
		throw error;
	}
	/** The child owns tool registrations; the outer effect owns native teardown. */
	async function mountRuntime(inner) {
		const { CuaDriver } = await import("@trycua/cua-driver");
		lifetime.signal.throwIfAborted();
		const activeDriver = driver = CuaDriver.create(void 0);
		const catalog = ToolCatalog.parse(JSON.parse(await activeDriver.listToolsJson({ signal: lifetime.signal })));
		lifetime.signal.throwIfAborted();
		const names = /* @__PURE__ */ new Set();
		for (const tool of catalog.tools) {
			const publicName = `cua_driver_native__${tool.name}`;
			if (!TOOL_NAME.test(publicName)) throw new Error(`Cua Driver tool "${tool.name}" exceeds the supported function-name format`);
			if (names.has(publicName)) throw new Error(`Cua Driver listed tool "${tool.name}" more than once`);
			names.add(publicName);
			const definition = createMcpToolDefinition(inner, {
				name: publicName,
				rawName: tool.name,
				description: tool.description ?? "",
				inputSchema: tool.inputSchema,
				outputSchema: tool.outputSchema,
				async call(args, execution) {
					const combined = AbortSignal.any([execution.signal, lifetime.signal]);
					combined.throwIfAborted();
					const result = await activeDriver.callTool(tool.name, JSON.stringify(args), { signal: combined });
					combined.throwIfAborted();
					return JSON.parse(result.rawJson);
				}
			});
			inner.tools.register(definition);
		}
		inner.on("tools/execute", async (exec, next) => {
			if (!names.has(exec.name)) return next();
			const upstream = exec.signal;
			exec.signal = AbortSignal.any([upstream, lifetime.signal]);
			const operation = Promise.resolve().then(next);
			pending.add(operation);
			try {
				return await operation;
			} finally {
				pending.delete(operation);
				exec.signal = upstream;
			}
		});
		inner.systemPrompt.section({
			name: "computer-use:cua-driver-native",
			order: inner.systemPrompt.getSectionOrder("TOOL_COMPUTER_USE"),
			text: GUIDANCE
		});
	}
}
//#endregion
export { Config, apply, inject, name };
