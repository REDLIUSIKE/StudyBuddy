import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The guide tab's body: a chain host, and the guide it falls back to.
 *
 * The chain is the replacement seam. A product with its own idea of what an
 * empty sidebar should say registers into `sidebar.right.tab.guide`, and its entry
 * takes the whole body; with no entry, or with every entry declining, the guide
 * below renders. The shipped guide is the owner's fallback rather than a chain
 * entry of its own, so there is always exactly one body and the shipped one
 * cannot be outvoted by accident.
 *
 * The shipped guide is a muted compass over the entry capsules every
 * registered type contributed, centred in the body, and nothing else — no
 * heading, as a browser start page shows its doors without a caption. While
 * at most four entries are listed, a capsule with a description shows it
 * under the title; a longer list drops every description to stay light.
 * Picking one opens that type as a page
 * in this tab's place, so the guide is a doorway rather than a page that stays
 * open.
 */
import { ShortcutKeys } from '@deepseek-ai/dsh-client-ui-primitives';
import { CompassGlyph, CubeGlyph } from "./GuideTitle.js";
import css from './GuideBody.module.css';
/** Entry count past which the guide drops the capsules' descriptions to stay light. */
const MAX_DESCRIBED_ENTRIES = 4;
/** One entry capsule: the contributing type's glyph and title, and its description while the guide is short. */
function EntryBox({ entry, described, onPick, shortcut }) {
    const Icon = entry.icon ?? CubeGlyph;
    const description = described ? entry.description?.() : undefined;
    return (_jsxs("button", { type: "button", className: css.entry, "data-sidebar-right-guide-entry": entry.kind, "aria-keyshortcuts": shortcut?.aria, onClick: () => { onPick(entry); }, children: [_jsx("span", { className: css.entryIcon, children: _jsx(Icon, { size: description === undefined ? 22 : 26, className: entry.icon === undefined ? css.placeholderInk : undefined }) }), _jsxs("span", { className: css.entryText, children: [_jsx("span", { className: css.entryTitle, children: entry.title() }), description !== undefined && _jsx("span", { className: css.entryDescription, children: description })] }), shortcut !== undefined && shortcut.keys.length > 0 && _jsx(ShortcutKeys, { keys: shortcut.keys })] }));
}
/** The shipped guide: the tab's own compass over the doors out of the column. */
function ShippedGuide({ children }) {
    return (_jsxs("div", { className: css.guide, "data-sidebar-right-guide": true, children: [_jsx("span", { className: css.hero, "aria-hidden": "true", children: _jsx(CompassGlyph, { size: 56 }) }), children] }));
}
/** The guide tab's body, replaceable through its chain child. */
export function GuideBody({ useTabInfo, useGuideEntries, renderSlot, renderSlotChain, useShortcuts }) {
    const shortcuts = useShortcuts(entries => entries);
    const { tab } = useTabInfo();
    const entries = useGuideEntries(entries => entries);
    const options = {
        hookContext: useTabInfo,
        fallback: (_jsx(ShippedGuide, { children: entries.map((entry) => {
                const described = entries.length <= MAX_DESCRIBED_ENTRIES;
                const description = described ? entry.description?.() : undefined;
                return _jsx("div", { className: css.entryCell, children: renderSlot('sidebar.right.tab.guide.entry', {
                        entryId: entry.id, kind: entry.kind, title: entry.title(),
                        ...description === undefined ? {} : { description },
                    }, {
                        entryKey: entry.providerId, hookContext: useTabInfo,
                        fallback: _jsx(EntryBox, { entry: entry, described: described, shortcut: shortcuts.find(shortcut => shortcut.id === entry.commandId), onPick: (selected) => { tab.actions.openTab(selected.kind, { replaceTab: true }); } }),
                    }) }, JSON.stringify([entry.providerId, entry.id]));
            }) })),
    };
    return renderSlotChain('sidebar.right.tab.guide', {}, options);
}
//# sourceMappingURL=GuideBody.js.map