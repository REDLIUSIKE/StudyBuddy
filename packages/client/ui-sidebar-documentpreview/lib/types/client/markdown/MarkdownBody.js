import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** One retained Markdown renderer over the document owner's accumulated text. */
import { lazy, Suspense, useMemo } from 'react';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { splitFrontmatter } from "./frontmatter.js";
import { markdownImageUrl } from "./path-images.js";
import css from './MarkdownBody.module.css';
/** Show the verbatim frontmatter when the field-list chunk cannot load. */
function FrontmatterFallback({ fallback }) {
    return fallback;
}
const FrontmatterFields = lazy(() => import("./frontmatter-fields.js").then(module => ({ default: module.FrontmatterFields }), 
// The failed chunk only removes the field layout; the body and verbatim metadata stay usable.
() => ({ default: FrontmatterFallback })));
/**
 * Render one accumulated document; EOF completes the primitive's full parse.
 * A leading YAML frontmatter block renders as a field list instead of Markdown; its
 * verbatim source stands in while the field-list chunk loads or when it fails.
 * @param props - owner-loaded contents and localized primitive labels.
 * @returns Markdown content, or nothing for a non-text delivery.
 */
export function MarkdownBody({ content, resourceAddress, useResource, t }) {
    const absolutePath = useResource(resourceAddress).value?.absolutePath;
    const pathImages = useMemo(() => ({
        resolve: value => markdownImageUrl(document.baseURI, absolutePath, value),
    }), [absolutePath]);
    const copyLabel = t('code.copy');
    const copiedLabel = t('code.copied');
    const footnotes = t('footnotes');
    const codeLabel = t('codeBlock.title');
    const wrapLabel = t('codeBlock.wrap');
    const unwrapLabel = t('codeBlock.unwrap');
    const labels = useMemo(() => ({
        code: { copyLabel, copiedLabel, toolbarLabels: { codeLabel, wrapLabel, unwrapLabel } }, footnotes,
    }), [copyLabel, copiedLabel, footnotes, codeLabel, wrapLabel, unwrapLabel]);
    const text = content.kind === 'text' ? content.text : '';
    const split = useMemo(() => splitFrontmatter(text), [text]);
    if (content.kind !== 'text')
        return null;
    return (_jsxs("div", { className: css.document, "data-document-markdown": true, children: [split === undefined ? null : _jsx(FrontmatterBox, { source: split.source }), _jsx(MarkdownText, { text: split?.body ?? text, streaming: !content.eof, labels: labels, pathImages: pathImages })] }));
}
/**
 * Frame one frontmatter block and choose its field list or verbatim source.
 * @param props - YAML between the frontmatter delimiters.
 * @returns the metadata box; it collapses when the document has no content.
 */
function FrontmatterBox({ source }) {
    const verbatim = _jsx("pre", { className: css.frontmatterSource, children: source });
    return (_jsx("div", { className: css.frontmatter, "data-document-frontmatter": true, children: _jsx(Suspense, { fallback: verbatim, children: _jsx(FrontmatterFields, { source: source, fallback: verbatim }) }) }));
}
//# sourceMappingURL=MarkdownBody.js.map