import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconCloseFillRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { AttachmentRail } from "../AttachmentRail.js";
import { DropOverlay } from "../DropOverlay.js";
import { FileCard } from "../FileCard.js";
import { ImageLightbox } from '@deepseek-ai/dsh-client-ui-primitives';
import { attachmentRailLabels, dropOverlayLabels, fileCardLabels, lightboxLabels } from "./labels.js";
import { installDocumentDropEvents } from "./drop-events.js";
import css from './ComposerAttachments.module.css';
/** Draft image previews, pending-file cards, drop target, and original-image preview. */
export function ComposerAttachments({ attachments, canAcceptDrop, onAddFiles, onRemoveAttachment, uploads, onRetryFile, dropLimits, t, }) {
    const [preview, setPreview] = useState(null);
    const [dragActive, setDragActive] = useState(false);
    const dragDepth = useRef(0);
    const closePreview = useCallback(() => { setPreview(null); }, []);
    useEffect(() => {
        if (preview !== null && !attachments.some(attachment => attachment.id === preview.id))
            setPreview(null);
    }, [attachments, preview]);
    useEffect(() => {
        return installDocumentDropEvents(canAcceptDrop, onAddFiles, dragDepth, setDragActive);
    }, [canAcceptDrop, onAddFiles]);
    const railItems = useMemo(() => attachments.map(attachment => ({
        id: attachment.id,
        attachment,
    })), [attachments]);
    return (_jsxs(_Fragment, { children: [dragActive && (_jsx(DropOverlay, { disabled: !canAcceptDrop, labels: dropOverlayLabels(t, canAcceptDrop, dropLimits) })), railItems.length > 0 && (_jsx("div", { className: css.rail, children: _jsx(AttachmentRail, { items: railItems, labels: attachmentRailLabels(t), renderItem: (item) => {
                        const attachment = item.attachment;
                        if (attachment.kind === 'file') {
                            const upload = uploads[attachment.id];
                            return (_jsx(FileCard, { name: attachment.file.name || t('file.label'), bytes: attachment.file.size, state: upload === undefined || upload.status === 'uploading'
                                    ? 'uploading'
                                    : upload.status === 'ready' ? 'ready' : 'error', ...upload?.status === 'uploading' && upload.total !== undefined && upload.total > 0
                                    ? { progress: upload.loaded / upload.total }
                                    : {}, labels: fileCardLabels(t, attachment.file.name), onRemove: () => { onRemoveAttachment(attachment.id); }, onRetry: () => { onRetryFile(attachment.id); } }));
                        }
                        return (_jsxs("div", { className: css.imageItem, children: [_jsx("button", { type: "button", className: css.thumbnail, title: t('image.openOriginal'), onClick: () => { setPreview(attachment); }, children: _jsx("img", { src: attachment.previewUrl, alt: attachment.file.name || t('image.pending') }) }), _jsx("button", { type: "button", className: css.remove, "aria-label": t('image.remove', { name: attachment.file.name }), onClick: () => { onRemoveAttachment(attachment.id); }, children: _jsx(IconCloseFillRegular, { size: 12 }) })] }));
                    } }) })), preview !== null && (_jsx(ImageLightbox, { src: preview.previewUrl, alt: preview.file.name || t('image.original'), labels: lightboxLabels(t), onClose: closePreview }))] }));
}
//# sourceMappingURL=ComposerAttachments.js.map