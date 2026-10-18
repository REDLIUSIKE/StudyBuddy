import { MessagePort, parentPort, workerData } from "node:worker_threads";
import { z } from "zod";
import { StagehandClientCreateConfigSchema } from "@browserbasehq/stagehand";
import { assertNever } from "@deepseek-ai/dsh-util-values";
//#region lib/types/native.js
/** Native Stagehand operations run inside one isolated browser Worker. */
/** Explicit credentials for one model supported by the pinned Stagehand SDK. */
const stagehandModelSchema = z.object({
	modelName: z.string(),
	apiKey: z.string().refine((value) => value.trim().length > 0, "Stagehand requires a nonblank model API key"),
	headers: z.record(z.string(), z.string()).optional()
}).strict().transform((model) => {
	StagehandClientCreateConfigSchema.parse({ model });
	return {
		modelName: model.modelName,
		apiKey: model.apiKey,
		...model.headers === void 0 ? {} : { headers: model.headers }
	};
});
const pageArgs = { pageId: z.string().min(1).optional() };
/** Model and worker requests share the same validated browser arguments. */
const browserInputs = {
	navigate: z.object({
		...pageArgs,
		url: z.url()
	}).strict(),
	tabs: z.discriminatedUnion("action", [
		z.object({ action: z.literal("list") }).strict(),
		z.object({
			action: z.literal("new"),
			url: z.url().optional()
		}).strict(),
		z.object({
			action: z.enum(["select", "close"]),
			pageId: z.string().min(1)
		}).strict()
	]),
	screenshot: z.object({
		...pageArgs,
		fullPage: z.boolean().default(false)
	}).strict(),
	act: z.object({
		...pageArgs,
		instruction: z.string().min(1)
	}).strict(),
	observe: z.object({
		...pageArgs,
		instruction: z.string().min(1)
	}).strict(),
	extract: z.object({
		...pageArgs,
		instruction: z.string().min(1),
		schema: z.record(z.string(), z.json()).optional()
	}).strict()
};
/**
* Open the pinned SDK using its public initialization and native model configuration.
* The host owns launched Chromium separately; this Worker owns only its CDP connection.
* @param config - resolved profile-owned browser options.
* @returns the native operation runtime after initialization completes.
*/
async function openNativeBrowser(config) {
	const { Stagehand, localBrowser } = await import("@browserbasehq/stagehand");
	const browser = await localBrowser.connect({
		cdpUrl: z.string().parse(config.cdpEndpoint),
		...config.extensionId === void 0 ? {} : { extensionId: config.extensionId }
	});
	const stagehand = await Stagehand.create({
		browser,
		model: config.model,
		logging: { level: "off" }
	});
	return {
		close: () => stagehand.close(),
		async execute(method, rawArgs) {
			switch (method) {
				case "navigate": {
					const args = browserInputs.navigate.parse(rawArgs);
					const page = await selectPage(browser, args.pageId);
					await page.goto(args.url, { timeout: config.operationTimeoutMs });
					return textResult({
						pageId: page.pageId,
						url: await page.url(),
						title: await page.title()
					});
				}
				case "tabs": {
					const args = browserInputs.tabs.parse(rawArgs);
					const context = browser.context;
					if (args.action === "new") await context.newPage(args.url);
					if (args.action === "select") await context.setActivePage(await selectPage(browser, args.pageId));
					if (args.action === "close") await (await selectPage(browser, args.pageId)).close();
					const active = await context.activePage();
					return textResult({ tabs: await Promise.all((await context.pages()).map(async (page) => ({
						pageId: page.pageId,
						url: await page.url(),
						title: await page.title(),
						active: page.pageId === active?.pageId
					}))) });
				}
				case "screenshot": {
					const args = browserInputs.screenshot.parse(rawArgs);
					const page = await selectPage(browser, args.pageId);
					const bytes = await page.screenshot({
						type: "png",
						fullPage: args.fullPage
					});
					return { content: [{
						type: "text",
						text: `Screenshot of tab ${page.pageId}.`
					}, {
						type: "image",
						data: Buffer.from(bytes).toString("base64"),
						mimeType: "image/png"
					}] };
				}
				case "act": {
					const args = browserInputs.act.parse(rawArgs);
					const result = await stagehand.act(args.instruction, {
						page: await selectPage(browser, args.pageId),
						timeout: config.operationTimeoutMs
					});
					if (!result.data.success) throw new Error(result.data.message);
					return textResult(result);
				}
				case "observe": {
					const args = browserInputs.observe.parse(rawArgs);
					return textResult(await stagehand.observe(args.instruction, {
						page: await selectPage(browser, args.pageId),
						timeout: config.operationTimeoutMs
					}));
				}
				case "extract": {
					const args = browserInputs.extract.parse(rawArgs);
					const options = {
						page: await selectPage(browser, args.pageId),
						timeout: config.operationTimeoutMs
					};
					return textResult(args.schema === void 0 ? await stagehand.extract(args.instruction, options) : await stagehand.extract(args.instruction, z.fromJSONSchema(args.schema), options));
				}
				/* v8 ignore next -- closed-union exhaustiveness guard; Worker methods are parsed before dispatch. */
				default: return assertNever(method, "Stagehand browser operation");
			}
		}
	};
}
async function selectPage(browser, pageId) {
	const page = pageId === void 0 ? await browser.context.activePage() : (await browser.context.pages()).find((candidate) => candidate.pageId === pageId);
	if (page === void 0) throw new Error("Stagehand browser tab is unavailable; list tabs to select a current pageId");
	return page;
}
function textResult(value) {
	return { content: [{
		type: "text",
		text: JSON.stringify(value)
	}] };
}
z.discriminatedUnion("ok", [z.object({
	ok: z.literal(true),
	value: z.unknown()
}).strict(), z.object({
	ok: z.literal(false),
	error: z.string()
}).strict()]);
/** Transferable reply channel paired with a validated operation payload. */
const requestSchema = z.object({
	method: z.string(),
	args: z.unknown(),
	reply: z.instanceof(MessagePort)
}).strict();
/**
* Validate and answer one request without leaving rejected callbacks unobserved.
* @param raw - untrusted message received from the Worker boundary.
* @param execute - owner that validates and executes the method arguments.
* @returns after the response has been posted and the reply port released.
*/
async function answer(raw, execute) {
	const { method, args, reply } = requestSchema.parse(raw);
	try {
		reply.postMessage({
			ok: true,
			value: await execute(method, args)
		});
	} catch (error) {
		reply.postMessage({
			ok: false,
			error: error instanceof Error ? error.message : String(error)
		});
	} finally {
		reply.close();
	}
}
//#endregion
//#region lib/types/worker.js
/** Isolated browser runtime configures native inference in Stagehand's extension. */
const port = parentPort;
if (port === null) throw new Error("Stagehand attachment requires a Worker parent");
const { extensionId, cdpEndpoint, executablePath, ...config } = z.object({
	model: stagehandModelSchema,
	mode: z.enum(["launch", "attach"]),
	cdpEndpoint: z.string().optional(),
	executablePath: z.string().optional(),
	extensionId: z.string().optional(),
	headless: z.boolean(),
	operationTimeoutMs: z.number().int().positive(),
	shutdownGraceMs: z.number().int().positive()
}).parse(workerData);
const methodSchema = z.enum(Object.keys(browserInputs));
const opening = openNativeBrowser({
	...config,
	...extensionId === void 0 ? {} : { extensionId },
	...cdpEndpoint === void 0 ? {} : { cdpEndpoint },
	...executablePath === void 0 ? {} : { executablePath }
});
opening.catch((error) => {});
port.on("message", (raw) => {
	answer(raw, async (method, args) => {
		const native = await opening;
		if (method === "ready") return;
		if (method === "close") return native.close();
		return native.execute(methodSchema.parse(method), args);
	}).catch((error) => {
		console.error("Stagehand Worker protocol failed:", error);
		process.exit(1);
	});
});
//#endregion
export {};
