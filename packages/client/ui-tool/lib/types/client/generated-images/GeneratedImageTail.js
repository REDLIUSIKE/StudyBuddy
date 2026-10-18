import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Saved image results in the completed reply, independent of Tool process folding. */
import { useState } from 'react';
import { ImageLightbox } from '@deepseek-ai/dsh-client-ui-primitives';
import { mediaTaskUrl } from "../tool/models/media-generation-model.js";
import { imagesForClosing } from "./turn-images.js";
import css from './GeneratedImageTail.module.css';
function GeneratedImage({ task, t }) {
    const [failed, setFailed] = useState(false), [open, setOpen] = useState(false), [attempt, setAttempt] = useState(0);
    const url = mediaTaskUrl(task, 'content');
    return _jsxs("figure", { className: css.image, "data-generated-image": task.requestId, children: [failed ? _jsxs("div", { className: css.failure, role: "status", children: [_jsx("span", { children: t('image.failed') }), _jsx("button", { type: "button", onClick: () => { setFailed(false); setAttempt(value => value + 1); }, children: t('image.retry') })] }) : _jsx("button", { className: css.preview, type: "button", "aria-label": t('image.open'), onClick: () => { setOpen(true); }, children: _jsx("img", { src: url, alt: t('image.alt'), loading: "lazy", onError: () => { setFailed(true); setOpen(false); } }, attempt) }), _jsx("a", { className: css.download, href: url, download: true, children: t('image.download') }), open && _jsx(ImageLightbox, { src: url, alt: t('image.alt'), labels: { dialog: t('image.alt'), close: t('image.close') }, onClose: () => { setOpen(false); } })] });
}
/** Render this Turn's saved images below its final reply.
 * @param props - completed Turn, viewed Session and localized image controls.
 * @returns visible image results, or no contribution when the Turn has none.
 */
export function GeneratedImageTail(props) {
    const images = imagesForClosing(props, props.sessionId, document.baseURI);
    return images.length === 0 ? null : _jsx("div", { className: css.root, "data-generated-images": true, children: images.map(task => _jsx(GeneratedImage, { task: task, t: props.t }, task.requestId)) });
}
//# sourceMappingURL=GeneratedImageTail.js.map