import { retainDocumentTabs } from "../document/tab-lifetime.js";
import { LazyPdfBody } from "./LazyPdfBody.js";
import { createPdfStore } from "./store.js";
import { ZoomViewport, zoomSurfaceClass } from "../zoom/ZoomViewport.js";
import { en, zh } from "./locales.js";
/** PDF metadata and keyed body share this package-local implementation identity. */
export const PDF_BODY_ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/pdf';
/**
 * Describe the builtin PDF renderer independently from its keyed body slot.
 * @param title - locale-owned implementation name.
 * @returns the complete-file PDF registration.
 */
export function pdfBodyDefinition(title) {
    return { id: PDF_BODY_ID, extensions: ['pdf'], binaryExtensions: ['pdf'], priority: 'builtin', title, loading: 'bytes-complete', wrap: false };
}
/** @param ctx - context carrying the locale, document registry, and slot registry. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('sidebarPdf', { zh, en }));
    const t = ctx.locale.bind('sidebarPdf');
    ctx.effect(() => ctx.documentPreviews.register(pdfBodyDefinition(() => t('title'))));
    const presentation = pdfBodyRegistration(ctx);
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
        name: 'sidebar.right.tab.document', key: PDF_BODY_ID, locale: 'sidebarPdf', ...presentation,
    }, LazyPdfBody)));
}
/**
 * Retain PDF viewing state for a document entry's tab lifetime.
 * @param ctx - owning registration context.
 * @returns the store and injection shared by ordinary and Office PDF registrations.
 */
export function pdfBodyRegistration(ctx) {
    const store = createPdfStore();
    const retainTab = retainDocumentTabs(ctx);
    return {
        store,
        inject: (_sessionId, actions) => ({
            retainTab: (tabId, signal) => { retainTab(tabId, signal, actions.forget); },
            ZoomViewport,
            zoomSurfaceClass,
        }),
    };
}
//# sourceMappingURL=index.js.map