import { VideoBody } from "./VideoBody.js";
import { en, zh } from "./locales.js";
export const VIDEO_BODY_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/video';
/** Describe playable video suffixes; the browser reports unsupported encodings without text fallback. */
export function videoBodyDefinition(title) {
    const extensions = ['mp4', 'webm', 'm4v', 'mov', 'ogv'];
    return { id: VIDEO_BODY_ID, extensions, binaryExtensions: extensions, priority: 'builtin', title, loading: 'renderer', wrap: false };
}
/** Register the video dictionary, selector and body with their owning plugin lifetime. */
export function apply(ctx) {
    const t = ctx.locale.bind('sidebarVideo');
    ctx.effect(() => ctx.locale.register('sidebarVideo', { zh, en }), 'document-video: dictionaries');
    ctx.effect(() => ctx.documentPreviews.register(videoBodyDefinition(() => t('title'))), 'document-video: metadata');
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
        name: 'sidebar.right.tab.document', key: VIDEO_BODY_ID, locale: 'sidebarVideo',
    }, VideoBody)), 'document-video: body');
}
//# sourceMappingURL=index.js.map