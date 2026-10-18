/**
 * Resolve original-image lightbox strings from the conversation namespace.
 * @param t - conversation namespace translator.
 * @returns translated lightbox labels.
 */
export function lightboxLabels(t) {
    return { dialog: t('image.preview'), close: t('image.closePreview') };
}
/**
 * Resolve historical message-image strings from the conversation namespace.
 * @param t - conversation namespace translator.
 * @returns translated message-image labels.
 */
export function messageImageLabels(t) {
    return {
        image: t('image.label'),
        open: t('image.openOriginal'),
        openNamed: label => t('image.openOriginalLabel', { label }),
        loading: t('image.loading'),
        loadFailed: t('image.loadFailed'),
        lightbox: lightboxLabels(t),
    };
}
/**
 * Resolve the document-level drop invitation and its optional limits line.
 * @param t - conversation namespace translator.
 * @param accepting - whether the composer can accept dropped files.
 * @param limits - optional translated count and size values.
 * @returns translated drop-overlay labels.
 */
export function dropOverlayLabels(t, accepting, limits) {
    if (!accepting)
        return { title: t('attachment.dropBlocked') };
    return {
        title: t('attachment.dropTitle'),
        desc: limits === undefined ? undefined : t('attachment.dropDesc', limits),
    };
}
/**
 * Resolve pending-file card strings from the conversation namespace.
 * @param t - conversation namespace translator.
 * @param name - browser file name interpolated into remove/retry labels.
 * @returns translated file-card labels.
 */
export function fileCardLabels(t, name) {
    return {
        label: t('file.pending'),
        remove: t('file.remove', { name }),
        uploading: t('file.uploading'),
        failed: t('file.uploadFailed'),
        retry: t('file.retry', { name }),
    };
}
/**
 * Resolve the mixed draft-attachment rail strings from the conversation namespace.
 * @param t - conversation namespace translator.
 * @returns translated attachment-rail labels.
 */
export function attachmentRailLabels(t) {
    return {
        group: t('attachment.pending'),
        scrollLeft: t('attachment.scrollLeft'),
        scrollRight: t('attachment.scrollRight'),
    };
}
//# sourceMappingURL=labels.js.map