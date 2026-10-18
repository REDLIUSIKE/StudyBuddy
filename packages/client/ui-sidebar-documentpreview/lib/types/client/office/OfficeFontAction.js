import { jsx as _jsx } from "react/jsx-runtime";
import { FontNotice } from "./FontNotice.js";
/**
 * Expose font details only for the currently loaded Office revision.
 * @param props - toolbar revision, tab reader, Office store, and localized copy.
 * @returns the font warning, or nothing before conversion completes.
 */
export function OfficeFontAction({ content, useTabInfo, useStore, t }) {
    const { tab } = useTabInfo();
    const held = useStore(state => state.byTab[tab.id]);
    if (content.kind !== 'renderer' || held?.revision !== content.revision || held.file === undefined)
        return null;
    return _jsx(FontNotice, { fonts: held.file.missingFonts, t: t }, content.revision);
}
//# sourceMappingURL=OfficeFontAction.js.map