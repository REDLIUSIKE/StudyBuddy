export { Config } from "./config.js";
/**
 * Embed validated preview settings in browser pages.
 * @param ctx - Host context serving browser pages.
 * @param config - Cache limits adopted when the page loads.
 */
export function apply(ctx, config) {
    ctx.on('webserver/index-inject', (table) => {
        table.push({ kind: 'global', name: '__DSH_DOCUMENT_PREVIEW_CONFIG__', value: config });
    });
}
//# sourceMappingURL=index.js.map