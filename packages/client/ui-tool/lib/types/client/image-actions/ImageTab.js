import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** A pure image tab using the same lightbox as the Chat thumbnail. */
import { useState } from 'react';
import { ImageLightbox } from '@deepseek-ai/dsh-client-ui-primitives';
import { parseImageAddress } from "./definition.js";
import css from './ImageTab.module.css';
export function ImageTab({ useTabInfo, sessionId, t }) {
    const { tab } = useTabInfo();
    const image = parseImageAddress(tab.contentId);
    const [enlarged, setEnlarged] = useState(false);
    const [failed, setFailed] = useState(false);
    if (image === undefined || image.sessionId !== sessionId)
        return _jsx("p", { children: t('image.failed') });
    return _jsxs("div", { className: css.root, "data-chat-session": sessionId, "data-conversation-image-tab": "", children: [failed ? _jsx("p", { role: "status", children: t('image.failed') }) : _jsx("button", { type: "button", className: css.imageButton, "aria-label": t('image.open'), onClick: () => setEnlarged(true), children: _jsx("img", { src: image.src, alt: image.name || t('image.alt'), onError: () => setFailed(true) }) }), enlarged && _jsx(ImageLightbox, { src: image.src, alt: image.name || t('image.alt'), labels: { dialog: t('image.open'), close: t('image.close') }, onClose: () => setEnlarged(false) })] });
}
//# sourceMappingURL=ImageTab.js.map