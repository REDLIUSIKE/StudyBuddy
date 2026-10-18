import { hostFileOf } from "../rpc.js";
import { HtmlBody } from "./HtmlBody.js";
import { en, zh } from "./locales.js";
/** HTML implementation identity, shared by metadata and the keyed slot. */
export const HTML_BODY_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/html';
/**
 * Describe the builtin HTML renderer's file types and loading mode.
 * @param title - locale-owned implementation name.
 * @returns metadata for complete HTML documents.
 */
export function htmlBodyDefinition(title) {
    return { id: HTML_BODY_ID, extensions: ['html', 'htm'], priority: 'builtin', title, loading: 'bytes-complete', wrap: false };
}
/**
 * Register the HTML dictionary, metadata and body with reversible effects.
 * @param ctx - owning plugin context.
 */
export function apply(ctx) {
    const t = ctx.locale.bind('documentHtml');
    ctx.effect(() => ctx.locale.register('documentHtml', { zh, en }));
    ctx.effect(() => ctx.documentPreviews.register(htmlBodyDefinition(() => t('title'))));
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
        name: 'sidebar.right.tab.document', key: HTML_BODY_ID, locale: 'documentHtml',
        inject: () => ({
            hooks: { interactivePreview: ctx.configForms.developerTools.enabled },
            readRelated: (address, relativePath, signal) => {
                const file = hostFileOf(address);
                return ctx.remote.workspaceFiles.readBytes(file.sessionId, relativePath, { baseFile: file.path }, signal);
            },
        }),
    }, HtmlBody)));
}
//# sourceMappingURL=index.js.map