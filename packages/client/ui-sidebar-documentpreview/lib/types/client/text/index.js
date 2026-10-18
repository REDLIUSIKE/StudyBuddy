import { TextBody } from "./TextBody.js";
/** Stable plain-text implementation identity within this package. */
export const PLAIN_BODY_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/text';
/**
 * Describe the plain-text fallback.
 * @param title - locale-owned implementation name.
 * @returns plain-text registration metadata.
 */
export function textBodyDefinition(title) {
    return { id: PLAIN_BODY_ID, extensions: [], priority: 'builtin', title, loading: 'text-pages', wrap: true };
}
/** @param ctx - owning plugin context. Register the fallback metadata and keyed body. */
export function apply(ctx) {
    const t = ctx.locale.bind('sidebarDocumentPreview');
    ctx.effect(() => ctx.documentPreviews.register(textBodyDefinition(() => t('viewer.text'))));
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({ name: 'sidebar.right.tab.document', key: PLAIN_BODY_ID }, TextBody)));
}
//# sourceMappingURL=index.js.map