import { jsx as _jsx } from "react/jsx-runtime";
import { ICON_MEDIUM_STROKE, ICON_REGULAR_STROKE } from "./icons/index.js";
import { BrowseOutlineArtwork, ChatLinesOutlineArtwork, FolderCloseArtwork, } from "./icons/shared-artwork.js";
/**
 * Render the icon that identifies one inline reference domain.
 * @param props - Reference kind, optional size, and optional CSS class.
 * @returns The corresponding decorative current-color SVG glyph.
 */
function ReferenceIconArtwork({ kind, size = 16, className, strokeWidth }) {
    switch (kind) {
        case 'session': return _jsx(ChatLinesOutlineArtwork, { size: size, className: className, strokeWidth: strokeWidth });
        case 'file': return _jsx(BrowseOutlineArtwork, { size: size, className: className, strokeWidth: strokeWidth });
        case 'folder': return _jsx(FolderCloseArtwork, { size: size, className: className, strokeWidth: strokeWidth });
    }
}
/**
 * Render a regular one-pixel reference icon.
 * @param props - Reference kind, size, and optional class.
 * @returns The regular decorative reference glyph.
 */
export function ReferenceIconRegular(props) {
    return _jsx(ReferenceIconArtwork, { ...props, strokeWidth: ICON_REGULAR_STROKE });
}
/**
 * Render a medium 1.3px reference icon.
 * @param props - Reference kind, size, and optional class.
 * @returns The medium decorative reference glyph.
 */
export function ReferenceIconMedium(props) {
    return _jsx(ReferenceIconArtwork, { ...props, strokeWidth: ICON_MEDIUM_STROKE });
}
//# sourceMappingURL=ReferenceIcon.js.map