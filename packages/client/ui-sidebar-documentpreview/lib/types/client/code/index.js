import { CODE_HIGHLIGHT_EXTENSIONS } from '@deepseek-ai/dsh-client-ui-primitives';
import { CodeBody } from "./CodeBody.js";
import { en, zh } from "./locales.js";
const ID = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/code';
const NS = 'sidebarCodePreview';
/** @param ctx - owning plugin context. Register localized metadata and the matching keyed document body. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }));
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.documentPreviews.register({
        id: ID,
        extensions: CODE_HIGHLIGHT_EXTENSIONS,
        priority: 'builtin',
        title: () => t('title'),
        loading: 'text-pages',
        wrap: true,
    }));
    ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({ name: 'sidebar.right.tab.document', key: ID, locale: NS }, CodeBody)));
}
//# sourceMappingURL=index.js.map