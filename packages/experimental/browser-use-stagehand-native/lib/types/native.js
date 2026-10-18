/** Native Stagehand operations run inside one isolated browser Worker. */
import { StagehandClientCreateConfigSchema } from '@browserbasehq/stagehand';
import { assertNever } from '@deepseek-ai/dsh-util-values';
import { z } from 'zod';
/** Explicit credentials for one model supported by the pinned Stagehand SDK. */
export const stagehandModelSchema = z.object({
    modelName: z.string(),
    apiKey: z.string().refine(value => value.trim().length > 0, 'Stagehand requires a nonblank model API key'),
    headers: z.record(z.string(), z.string()).optional(),
}).strict().transform((model) => {
    StagehandClientCreateConfigSchema.parse({ model });
    // The native-only fields above exclude the SDK's callback-model alternative.
    return {
        modelName: model.modelName,
        apiKey: model.apiKey,
        ...model.headers === undefined ? {} : { headers: model.headers },
    };
});
const pageArgs = { pageId: z.string().min(1).optional() };
/** Model and worker requests share the same validated browser arguments. */
export const browserInputs = {
    navigate: z.object({ ...pageArgs, url: z.url() }).strict(),
    tabs: z.discriminatedUnion('action', [
        z.object({ action: z.literal('list') }).strict(),
        z.object({ action: z.literal('new'), url: z.url().optional() }).strict(),
        z.object({ action: z.enum(['select', 'close']), pageId: z.string().min(1) }).strict(),
    ]),
    screenshot: z.object({ ...pageArgs, fullPage: z.boolean().default(false) }).strict(),
    act: z.object({ ...pageArgs, instruction: z.string().min(1) }).strict(),
    observe: z.object({ ...pageArgs, instruction: z.string().min(1) }).strict(),
    extract: z.object({ ...pageArgs, instruction: z.string().min(1), schema: z.record(z.string(), z.json()).optional() }).strict(),
};
/** SDK requests did not drain before their connection Worker terminated. */
export class StagehandDrainError extends Error {
}
/**
 * Open the pinned SDK using its public initialization and native model configuration.
 * The host owns launched Chromium separately; this Worker owns only its CDP connection.
 * @param config - resolved profile-owned browser options.
 * @returns the native operation runtime after initialization completes.
 */
export async function openNativeBrowser(config) {
    const { Stagehand, localBrowser } = await import('@browserbasehq/stagehand');
    const browser = await localBrowser.connect({
        cdpUrl: z.string().parse(config.cdpEndpoint),
        ...config.extensionId === undefined ? {} : { extensionId: config.extensionId },
    });
    const stagehand = await Stagehand.create({ browser, model: config.model, logging: { level: 'off' } });
    return {
        close: () => stagehand.close(),
        async execute(method, rawArgs) {
            switch (method) {
                case 'navigate': {
                    const args = browserInputs.navigate.parse(rawArgs);
                    const page = await selectPage(browser, args.pageId);
                    await page.goto(args.url, { timeout: config.operationTimeoutMs });
                    return textResult({ pageId: page.pageId, url: await page.url(), title: await page.title() });
                }
                case 'tabs': {
                    const args = browserInputs.tabs.parse(rawArgs);
                    const context = browser.context;
                    if (args.action === 'new')
                        await context.newPage(args.url);
                    if (args.action === 'select')
                        await context.setActivePage(await selectPage(browser, args.pageId));
                    if (args.action === 'close')
                        await (await selectPage(browser, args.pageId)).close();
                    const active = await context.activePage();
                    return textResult({ tabs: await Promise.all((await context.pages()).map(async (page) => ({
                            pageId: page.pageId, url: await page.url(), title: await page.title(), active: page.pageId === active?.pageId,
                        }))) });
                }
                case 'screenshot': {
                    const args = browserInputs.screenshot.parse(rawArgs);
                    const page = await selectPage(browser, args.pageId);
                    const bytes = await page.screenshot({ type: 'png', fullPage: args.fullPage });
                    return { content: [
                            { type: 'text', text: `Screenshot of tab ${page.pageId}.` },
                            { type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType: 'image/png' },
                        ] };
                }
                case 'act': {
                    const args = browserInputs.act.parse(rawArgs);
                    const result = await stagehand.act(args.instruction, {
                        page: await selectPage(browser, args.pageId), timeout: config.operationTimeoutMs,
                    });
                    if (!result.data.success)
                        throw new Error(result.data.message);
                    return textResult(result);
                }
                case 'observe': {
                    const args = browserInputs.observe.parse(rawArgs);
                    return textResult(await stagehand.observe(args.instruction, {
                        page: await selectPage(browser, args.pageId), timeout: config.operationTimeoutMs,
                    }));
                }
                case 'extract': {
                    const args = browserInputs.extract.parse(rawArgs);
                    const options = { page: await selectPage(browser, args.pageId), timeout: config.operationTimeoutMs };
                    const result = args.schema === undefined
                        ? await stagehand.extract(args.instruction, options)
                        : await stagehand.extract(args.instruction, z.fromJSONSchema(args.schema), options);
                    return textResult(result);
                }
                /* v8 ignore next -- closed-union exhaustiveness guard; Worker methods are parsed before dispatch. */
                default: return assertNever(method, 'Stagehand browser operation');
            }
        },
    };
}
async function selectPage(browser, pageId) {
    const page = pageId === undefined
        ? await browser.context.activePage()
        : (await browser.context.pages()).find(candidate => candidate.pageId === pageId);
    if (page === undefined)
        throw new Error('Stagehand browser tab is unavailable; list tabs to select a current pageId');
    return page;
}
function textResult(value) {
    return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}
//# sourceMappingURL=native.js.map