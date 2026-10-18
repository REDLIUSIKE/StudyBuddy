import { jsx as _jsx } from "react/jsx-runtime";
import { useId } from 'react';
import { CODE_FILE_ARTWORK, CODE_FILE_ICON_ID_TOKEN } from "./code-file-icon-artwork.js";
/**
 * Render one full-color square code-file glyph from the embedded icon set.
 * @param props - Detailed code type, optional size, and optional CSS class.
 * @returns The selected decorative SVG with its identifying palette intact.
 */
export function CodeFileIcon({ type, size = 20, className }) {
    const instanceId = `dsh-code-icon-${useId().replaceAll(':', '')}`;
    const artwork = CODE_FILE_ARTWORK[type].replaceAll(CODE_FILE_ICON_ID_TOKEN, instanceId);
    // Package tests reject unsafe markup and invalid local references in this
    // static table. Per-instance ids keep gradients and clip paths independent.
    return (_jsx("svg", { width: size, height: size, className: className, viewBox: "0 0 20 20", xmlns: "http://www.w3.org/2000/svg", "aria-hidden": true, dangerouslySetInnerHTML: { __html: artwork } }));
}
//# sourceMappingURL=CodeFileIcon.js.map