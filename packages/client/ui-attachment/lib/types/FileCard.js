import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { fileExtension, FileTypeIcon, fileSizeText, IconCloseFillRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './FileCard.module.css';
/** One pending file card: type glyph, name, size or upload status, remove, retry. */
export function FileCard({ name, bytes, state, progress, labels, onRemove, onRetry, }) {
    const extension = fileExtension(name).toUpperCase().slice(0, 8);
    const meta = state === 'uploading'
        ? labels.uploading
        : state === 'error'
            ? labels.failed
            : [extension, fileSizeText(bytes)].filter(part => part !== '').join(' ');
    const retryable = state === 'error';
    return (_jsxs("div", { className: `${css.card}${retryable ? ` ${css.failed}` : ''}`, title: name, children: [_jsx("span", { className: css.icon, "aria-hidden": true, children: state === 'uploading'
                    ? _jsx("span", { className: css.spinner })
                    : _jsx(FileTypeIcon, { path: name }) }), retryable
                ? (_jsxs("button", { type: "button", className: `${css.body} ${css.retry}`, "aria-label": labels.retry, onClick: onRetry, children: [_jsx("span", { className: css.name, children: name }), _jsx("span", { className: `${css.meta} ${css.metaFailed}`, children: meta })] }))
                : (_jsxs("span", { className: css.body, "aria-label": labels.label, children: [_jsx("span", { className: css.name, children: name }), _jsx("span", { className: css.meta, children: meta })] })), _jsx("button", { type: "button", className: retryable ? `${css.remove} ${css.removeFailed}` : css.remove, "aria-label": labels.remove, onClick: onRemove, children: _jsx(IconCloseFillRegular, { size: 12 }) }), state === 'uploading' && (_jsx("span", { className: css.progressTrack, "aria-hidden": true, children: _jsx("span", { className: css.progressBar, style: progress === undefined ? undefined : { width: `${String(Math.min(1, Math.max(0, progress)) * 100)}%` } }) }))] }));
}
//# sourceMappingURL=FileCard.js.map