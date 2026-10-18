import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Compact, read-only fields and lists for recorded Tool results. */
import { CodeBlock, MarkdownText, IconCheckOutlineRegular, IconChevronRightOutlineRegular, IconPlayOutlineRegular, } from '@deepseek-ai/dsh-client-ui-primitives';
import { codeToolbarLabels, markdownLabels } from "../models/primitive-labels.js";
import css from './ToolDetails.module.css';
function DetailItem({ item, t, onOpenFile }) {
    const status = item.status;
    return (_jsxs("li", { className: css.item, "data-change": item.change?.value, children: [item.title !== undefined && (_jsxs("div", { className: css.heading, children: [status !== undefined && (_jsx("span", { className: css.status, role: "img", "aria-label": item.change?.label ?? status.label, children: item.change?.value === 'added' ? '+'
                            : item.change?.value === 'removed' ? '−'
                                : status.value === 'completed' ? _jsx(IconCheckOutlineRegular, { size: 14 })
                                    : status.value === 'in_progress' ? _jsx(IconPlayOutlineRegular, { size: 14 })
                                        : _jsx("span", { className: css.pending }) })), item.location !== undefined && onOpenFile !== undefined ? (_jsx("button", { className: css.path, type: "button", onClick: () => {
                            const location = item.location;
                            if (location !== undefined)
                                onOpenFile(location.path, location.line === undefined ? undefined : { line: location.line });
                        }, children: item.title })) : _jsx("span", { className: css.text, children: item.title }), item.badge !== undefined && _jsx("span", { className: css.badge, "data-tone": item.badge.tone, children: item.badge.label }), status !== undefined && (_jsxs("span", { className: css.statusText, children: [item.previousStatus !== undefined && (_jsxs(_Fragment, { children: [_jsx("span", { className: css.previous, children: item.previousStatus }), _jsx("span", { children: " \u2192 " })] })), _jsx("span", { children: status.label }), item.change?.value === 'updated' && item.previousStatus === undefined && _jsxs("span", { children: [" \u00B7 ", item.change.label] })] }))] })), item.subtitle !== undefined && _jsx("div", { className: css.subtitle, children: item.subtitle }), item.description !== undefined && _jsx("p", { className: css.description, children: item.description }), item.fields.length > 0 && (_jsx("dl", { className: css.fields, children: item.fields.map(field => (_jsxs("div", { className: css.field, children: [_jsx("dt", { children: field.label }), _jsx("dd", { children: field.value })] }, field.label))) })), item.lines !== undefined && _jsx("ul", { className: css.lines, children: item.lines.map((line, index) => _jsx("li", { children: line }, index)) }), item.markdown !== undefined && _jsx("div", { className: css.prose, children: _jsx(MarkdownText, { text: item.markdown, labels: markdownLabels(t) }) }), item.code !== undefined && (_jsx(CodeBlock, { toolbarLabels: codeToolbarLabels(t), className: css.code, code: item.code.text, lang: item.code.language, copyLabel: t('copy'), copiedLabel: t('copied') })), item.groups?.map((group, index) => (_jsxs("details", { className: css.group, children: [_jsxs("summary", { children: [_jsx(IconChevronRightOutlineRegular, {}), _jsx("span", { children: group.label })] }), _jsx("ul", { className: css.list, children: group.items.map((child, childIndex) => _jsx(DetailItem, { item: child, t: t, onOpenFile: onOpenFile }, childIndex)) })] }, index)))] }));
}
/**
 * Render recorded values with local disclosures, copy controls, and file navigation.
 * @param props.model - Localized fields or list items; an empty list uses its empty label.
 * @param props.hasInspect - Reserve space for the row's upper-right Inspect button.
 * @param props.t - Conversation dictionary for shared Markdown and code controls.
 * @param props.onOpenFile - Open a recorded file location in the session workspace.
 * @returns The expanded detail body.
 */
export function ToolDetails({ model, hasInspect = false, t, onOpenFile }) {
    return (_jsxs("div", { className: css.root, "data-inspect": hasInspect || undefined, "data-caption": model.caption !== undefined || undefined, children: [model.caption !== undefined && _jsx("div", { className: css.caption, children: model.caption }), model.items.length === 0 ? _jsx("p", { className: css.empty, children: model.empty }) : (_jsx("ul", { className: css.list, children: model.items.map((item, index) => _jsx(DetailItem, { item: item, t: t, onOpenFile: onOpenFile }, index)) })), model.unchanged !== undefined && (_jsxs("details", { className: css.unchanged, children: [_jsxs("summary", { children: [_jsx(IconChevronRightOutlineRegular, {}), model.unchanged.label] }), _jsx("ul", { className: css.list, children: model.unchanged.items.map((item, index) => _jsx(DetailItem, { item: item, t: t, onOpenFile: onOpenFile }, index)) })] }))] }));
}
//# sourceMappingURL=ToolDetails.js.map