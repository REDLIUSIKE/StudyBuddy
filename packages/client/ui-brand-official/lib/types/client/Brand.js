import { jsx as _jsx } from "react/jsx-runtime";
/**
 * Render the standalone mark only when the host is not showing the full wordmark.
 * @param props - Host-supplied mark presentation.
 * @returns the approved StudyBuddy mark.
 */
export function OfficialBrandMark({ size, wide }) {
    if (wide)
        return null;
    return _jsx("img", { src: "/brand/guibao.png", width: size, height: size, style: { objectFit: 'contain' }, alt: "\u7845\u5B9D" });
}
/**
 * Render the complete wordmark with its single integrated mascot letter.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
    return _jsx("img", { src: "/brand/sidebar-v4-1x.png", srcSet: "/brand/sidebar-v4-1x.png 1x, /brand/sidebar-v4-2x.png 2x, /brand/sidebar-v4-3x.png 3x", width: 160, height: 36, style: { objectFit: 'contain' }, alt: "StudyBuddy \u7845\u57FA\u540C\u684C" });
}
/** Approved compact mark for the conversation hero. */
export function StudyBuddyHeroMark({ size, className }) {
    return _jsx("img", { src: "/brand/guibao.png", width: size, height: size, className: className, style: { objectFit: 'contain' }, alt: "\u7845\u5B9D" });
}
//# sourceMappingURL=Brand.js.map