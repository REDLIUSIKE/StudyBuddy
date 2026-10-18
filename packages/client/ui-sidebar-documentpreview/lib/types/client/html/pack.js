import { decodeText } from "./bytes.js";
const MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_ASSETS = 64;
/** Whether this reference can be read relative to the original document, never the parent application URL. */
function relative(reference) {
    return reference.length > 0 && !/^(?:[a-z][a-z\d+.-]*:|[/\\#?])/iu.test(reference) && !reference.includes('\0');
}
/**
 * Collect static dependencies without executing or mounting document elements in the parent page.
 * A base element leaves URL resolution to the browser. Only direct .js classic scripts and .css
 * links are packed; local CSS url/import, modules and dynamically constructed URLs are unsupported.
 * @param data - complete UTF-8 HTML bytes.
 * @param readRelative - original-document-scoped read, never exposed to the iframe.
 * @param signal - stops reads and prevents publication after cancellation.
 * @returns complete HTML and its finite static asset set; decoding, limits and read failures reject.
 */
export async function packHtml(data, readRelative, signal) {
    signal.throwIfAborted();
    let total = data.byteLength;
    if (total > MAX_TOTAL_BYTES)
        throw new Error('HTML package exceeds its total byte limit');
    const template = document.createElement('template');
    template.innerHTML = decodeText(data);
    const assets = [];
    if (template.content.querySelector('base[href]') !== null)
        return { data, assets };
    const seen = new Set();
    for (const element of template.content.querySelectorAll('script[src],link[href]')) {
        const script = element.localName === 'script';
        const type = element.getAttribute('type')?.trim().toLowerCase() ?? '';
        if (script && !['', 'text/javascript', 'application/javascript'].includes(type))
            continue;
        if (!script && !(element.getAttribute('rel') ?? '').toLowerCase().split(/\s+/u).includes('stylesheet'))
            continue;
        // The selector requires the corresponding URL attribute.
        const reference = element.getAttribute(script ? 'src' : 'href');
        const suffix = reference.search(/[?#]/u);
        const path = suffix === -1 ? reference : reference.slice(0, suffix);
        if (!relative(reference) || !(script ? /\.js$/iu : /\.css$/iu).test(path))
            continue;
        const kind = script ? 'script' : 'stylesheet';
        const key = `${kind}:${reference}`;
        if (seen.has(key))
            continue;
        if (assets.length >= MAX_ASSETS)
            throw new Error('HTML package exceeds its asset count limit');
        signal.throwIfAborted();
        const asset = await readRelative(reference, signal);
        signal.throwIfAborted();
        const size = asset.data.byteLength;
        if (size > MAX_ASSET_BYTES)
            throw new Error('HTML asset exceeds its byte limit');
        total += size;
        if (total > MAX_TOTAL_BYTES)
            throw new Error('HTML package exceeds its total byte limit');
        decodeText(asset.data);
        assets.push({ kind, reference, data: asset.data });
        seen.add(key);
    }
    return { data, assets };
}
//# sourceMappingURL=pack.js.map