// Pure MIT Pi 1.0.0 format adapter. See pinned-sources.json.
/** Split a leading UTF-8 byte order mark from decoded text. */
export function splitBom(content) {
    return content.startsWith("\uFEFF") ? { bom: "\uFEFF", text: content.slice(1) } : { bom: "", text: content };
}
/** Remove a leading UTF-8 byte order mark from decoded text. */
export function stripBom(content) {
    return splitBom(content).text;
}
