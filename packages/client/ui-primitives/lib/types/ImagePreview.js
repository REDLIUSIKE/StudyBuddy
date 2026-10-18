import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Passive, contained image preview for Markdown image links. */
import { useState } from 'react';
import { IconLoadingOutlineRegular } from "./icons/index.js";
import css from './ImagePreview.module.css';
/**
 * Render an image without introducing a second activation target.
 * @param props - Source, accessible description, localized status.
 * @returns A contained preview with loading or failure status.
 */
export function ImagePreview({ src, alt, loadingLabel, failedLabel }) {
    return _jsx(Preview, { src: src, alt: alt, loadingLabel: loadingLabel, failedLabel: failedLabel }, src);
}
function Preview({ src, alt, loadingLabel, failedLabel }) {
    const [state, setState] = useState('loading');
    return _jsxs("span", { className: css.frame, children: [state !== 'failed' && _jsx("img", { src: src, alt: alt, loading: "lazy", decoding: "async", referrerPolicy: "no-referrer", className: css.image, "data-ready": state === 'ready' || undefined, onLoad: () => { setState('ready'); }, onError: () => { setState('failed'); } }), state !== 'ready' && _jsxs("span", { className: css.status, role: "status", children: [state === 'loading' && _jsx(IconLoadingOutlineRegular, { size: 16 }), _jsx("span", { children: state === 'loading' ? loadingLabel : failedLabel })] })] });
}
//# sourceMappingURL=ImagePreview.js.map