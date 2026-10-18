import { TextPreview } from "./TextPreview.js";
import { TextTitle } from "./TextTitle.js";
import { TEXTPREVIEW_ID, textDefinition } from "./definition.js";
import { textFace } from "./face.js";
import { createReadPage } from "./rpc.js";
import { createTextStore } from "./store.js";
import { en, zh } from "./locales.js";
import { DocumentPreviewRegistry } from "./document/registry.js";
import { documentTabInfoFactory } from "./document/contract.js";
import { apply as registerText } from "./text/index.js";
import { apply as registerMarkdown } from "./markdown/index.js";
import { apply as registerHtml } from "./html/index.js";
import { apply as registerImage } from "./image/index.js";
import { apply as registerVideo } from "./video/index.js";
import { apply as registerPdf } from "./pdf/index.js";
import { apply as registerCode } from "./code/index.js";
import { apply as registerOffice } from "./office/index.js";
import { apply as registerExcel } from "./excel/index.js";
import { Config } from "../config.js";
/** This package's copy namespace. */
const NS = 'sidebarDocumentPreview';
/**
 * Required browser services: the tab registry, the slot registry, copy, and the
 * workspace Remote for bytes and paged text reads.
 */
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles', 'configForms', 'resources'];
/**
 * Client plugin body: register the type, its dictionaries, its body, and its chip title.
 * @param ctx - client root context carrying the registry, slots, copy, and file readers.
 */
export function apply(ctx) {
    const config = Config(globalThis.__DSH_DOCUMENT_PREVIEW_CONFIG__ ?? {});
    const previews = new DocumentPreviewRegistry();
    const disposePreviews = ctx.reflect.provide('documentPreviews', previews);
    ctx.effect(() => disposePreviews);
    ctx.effect(() => ctx.sidebarRightTabs.register(textDefinition()), 'ui-sidebar-documentpreview: text type');
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-documentpreview: dictionaries');
    const store = createTextStore();
    const face = textFace(createReadPage(ctx.remote), (file, signal) => ctx.remote.workspaceFiles.readBytes(file.sessionId, file.path, {}, signal), ctx.resources);
    const source = { getSnapshot: previews.getSnapshot, subscribe: previews.subscribe };
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: TEXTPREVIEW_ID, locale: NS, store,
        children: {
            'sidebar.right.tab.document': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: documentTabInfoFactory } } },
            'sidebar.right.tab.document.actions': { kind: 'list', scope: 'session' },
            'sidebar.right.tab.document.unpreviewable': { kind: 'list', scope: 'session' },
            'sidebar.right.tab.document.action': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: documentTabInfoFactory } } },
        },
        inject: (sessionId, actions) => ({
            ...face(sessionId, actions), hooks: { documentPreviews: source },
        }),
    }, TextPreview)), 'ui-sidebar-documentpreview: text body');
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TEXTPREVIEW_ID }, TextTitle)), 'ui-sidebar-documentpreview: text title');
    registerText(ctx);
    registerMarkdown(ctx);
    registerHtml(ctx);
    registerImage(ctx);
    registerVideo(ctx);
    registerPdf(ctx);
    registerOffice(ctx, config.office);
    registerExcel(ctx, config.excel);
    registerCode(ctx);
}
//# sourceMappingURL=index.js.map