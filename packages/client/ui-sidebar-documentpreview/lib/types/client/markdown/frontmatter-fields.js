import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Field list for a Markdown document's leading YAML frontmatter. The Markdown
 * body loads this module lazily so the YAML parser stays out of the startup
 * chunk.
 */
import { useMemo } from 'react';
import { isMap, isNode, isScalar, parseDocument } from 'yaml';
import css from './frontmatter-fields.module.css';
/**
 * Resolve top-level mapping fields from the YAML syntax tree.
 * @param source - YAML between the frontmatter delimiters.
 * @returns the fields, `[]` for a document without content, or `undefined` for invalid YAML and non-mapping documents.
 */
function parseFields(source) {
    const parsed = parseDocument(source);
    if (parsed.errors.length > 0)
        return undefined;
    if (parsed.contents === null)
        return [];
    if (!isMap(parsed.contents))
        return undefined;
    return parsed.contents.items.map(({ key, value }) => ({
        key: nodeText(source, key),
        value: nodeText(source, value),
        block: isNode(value) && !isScalar(value),
    }));
}
// Strings show their resolved value, so folded and multiline text reads as prose; other
// nodes keep their authored text, so `1.0` stays `1.0` and aliases stay unexpanded.
function nodeText(source, node) {
    if (isScalar(node) && typeof node.value === 'string')
        return node.value.trimEnd();
    if (!isNode(node))
        return '';
    /* v8 ignore next -- parsed nodes always carry their source range. */
    const [start, end] = node.range ?? [0, 0];
    const indent = start - source.lastIndexOf('\n', start - 1) - 1;
    return source.slice(start, end).replace(new RegExp(`\\n {0,${indent}}`, 'gu'), '\n').trimEnd();
}
/**
 * Render frontmatter fields, or the owner's verbatim block when the YAML is not a mapping.
 * @param props - frontmatter source and its verbatim fallback.
 * @returns the field list, the fallback, or nothing for a document without content.
 */
export function FrontmatterFields({ source, fallback }) {
    const fields = useMemo(() => parseFields(source), [source]);
    if (fields === undefined)
        return fallback;
    if (fields.length === 0)
        return null;
    return (_jsx("dl", { className: css.fields, children: fields.map((field, index) => (_jsxs("div", { className: css.field, children: [_jsx("dt", { className: css.key, children: field.key }), _jsx("dd", { className: field.block ? css.block : css.value, children: field.value })] }, index))) }));
}
//# sourceMappingURL=frontmatter-fields.js.map