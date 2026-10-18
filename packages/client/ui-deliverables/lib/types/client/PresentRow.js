import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Present call status and expandable durable result text. */
import { useState } from 'react';
import { DisclosureRow, IconDeliverDocRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './PresentRow.module.css';
/* v8 ignore next -- Non-expandable rows never invoke DisclosureRow's required toggle callback. */
const noop = () => undefined;
/** Raw arguments can be partial while a call is streaming. */
function fileNames(raw) {
    let args;
    try {
        args = JSON.parse(raw);
    }
    catch {
        return raw;
    } // Truncated tool JSON remains visible until the call completes.
    if (typeof args !== 'object' || args === null || !('files' in args) || !Array.isArray(args.files))
        return raw;
    return args.files.flatMap((file) => typeof file === 'object' && file !== null && 'path' in file && typeof file.path === 'string'
        ? [file.path] : []).join(', ');
}
/**
 * Render a present call using its recorded arguments and result.
 * @param props - tool call and localized status copy.
 * @returns a status row with a result disclosure.
 */
export function PresentRow(props) {
    return props.phase === 'preparing' ? _jsx(PreparingPresentRow, { ...props }) : _jsx(StartedPresentRow, { ...props });
}
function PreparingPresentRow({ t }) {
    return _jsx("div", { "data-tool": "present", "data-state": "preparing", "aria-label": t('row.preparing'), children: _jsx(DisclosureRow, { title: t('row.title'), icon: _jsx(IconDeliverDocRegular, { size: 14 }), open: false, expandable: false, onToggle: noop, running: true }) });
}
function StartedPresentRow({ block, inspect, t }) {
    const settled = 'kind' in block;
    const state = !settled ? 'running' : block.error?.code === 'interrupted' ? 'stopped' : block.isError ? 'error' : 'ok';
    const args = (settled ? block.call?.argsRaw : block.argsRaw) ?? '';
    const output = settled ? block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item)).join('\n') : '';
    const details = output || (settled && block.error ? `${block.error.name}: ${block.error.code}` : '');
    const [expanded, setExpanded] = useState(false);
    return _jsx("div", { "data-tool": "present", "data-state": state, children: _jsxs(DisclosureRow, { title: t('row.title'), icon: _jsx(IconDeliverDocRegular, { size: 14 }), open: expanded && details !== '', expandable: details !== '', expandOnRowClick: true, keepContentWhenOpen: true, onToggle: () => { setExpanded(value => !value); }, collapsedContent: _jsxs("span", { className: css.summary, children: [_jsx("span", { children: t(`row.${state}`) }), _jsx("span", { className: css.paths, children: fileNames(args) })] }), children: [_jsx("pre", { className: css.output, children: details }), inspect && _jsx("button", { type: "button", className: css.inspect, onClick: inspect, children: t('row.inspect') })] }) });
}
//# sourceMappingURL=PresentRow.js.map