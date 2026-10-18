function assertNever(row) {
    throw new Error(`web boot: unknown index injection row ${JSON.stringify(row)}`);
}
/**
 * Execute every row in table order.
 * @param rows - Injection table from the boot payload.
 * @param loadScript - Executes one script-src row through the page owner's asset transport.
 */
export async function applyIndexInjections(rows, loadScript) {
    for (const row of rows) {
        switch (row.kind) {
            case 'global':
                globalThis[row.name] = row.value;
                break;
            case 'script': {
                const el = document.createElement('script');
                el.textContent = row.text;
                (row.placement === 'head' ? document.head : document.body).append(el);
                break;
            }
            case 'script-src':
                await loadScript(row.src);
                break;
            case 'script-preload':
                // Some transports cannot preload without executing; loadScript owns the actual request.
                break;
            case 'style': {
                const el = document.createElement('style');
                el.textContent = row.text;
                document.head.append(el);
                break;
            }
            case 'html':
                (row.placement === 'head' ? document.head : document.body).insertAdjacentHTML('beforeend', row.html);
                break;
            default:
                assertNever(row);
        }
    }
}
//# sourceMappingURL=apply-injections.js.map