import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, IconBrowseOutlineRegular, IconPlusOutlineRegular, Modal, Tag, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import { isBuiltInPreset, presetDisplayText } from "./locales.js";
import { requiresCodingTools } from "./settings-store.js";
import { PresetGuideDialog, presetGuide, trapPresetReaderTab } from "./PresetGuideDialog.js";
import css from './AgentPresetSection.module.css';
function CardDescription({ text }) {
    const ref = useRef(null);
    const [truncated, setTruncated] = useState(false);
    useLayoutEffect(() => {
        const el = ref.current;
        /* v8 ignore next -- the ref is attached before layout effects run. */
        if (el === null)
            return;
        const measure = () => { setTruncated(el.scrollHeight > el.clientHeight); };
        measure();
        // Card width follows the settings pane, which resizes with the window.
        if (typeof ResizeObserver === 'undefined')
            return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => { observer.disconnect(); };
    }, [text]);
    return (_jsx(Tooltip, { label: text, side: "bottom", delayMs: 400, disabled: !truncated, maxWidth: 360, children: _jsx("span", { ref: ref, className: css.cardDesc, title: "", children: text }) }));
}
/** Render the roster with its default, mode help, composition viewer, and the guidance to Creator mode.
 * @param props Settings actions, snapshot hooks and localized text.
 * @returns The preset settings section.
 */
export function AgentPresetSection({ useAgentPresetSection, load, view, closeView, makeDefault, startCreatorDraft, close: closeSettings, useDeveloperTools, t, }) {
    const state = useAgentPresetSection(value => value);
    const developerTools = useDeveloperTools(enabled => enabled);
    const [guide, setGuide] = useState(null);
    const viewTrigger = useRef(null);
    const closeViewOnUnmount = useRef(closeView);
    useEffect(() => { void load(); }, [load]);
    useLayoutEffect(() => { closeViewOnUnmount.current = closeView; }, [closeView]);
    useEffect(() => () => { closeViewOnUnmount.current(); }, []);
    const closeViewer = () => { closeView(); viewTrigger.current?.focus(); };
    const viewed = state.view;
    const viewedRow = viewed === null ? undefined : state.rows.find(row => row.id === viewed.id);
    const viewedTitle = viewed === null ? '' : viewedRow === undefined ? viewed.title : presetDisplayText(viewedRow, t).name;
    // Creator mode authors presets in conversation; it needs the flow to land a
    // session in and the self-referential preset on the roster.
    const creator = startCreatorDraft !== undefined && state.rows.some(row => row.id === 'cordis') ? startCreatorDraft : undefined;
    /* The custom group is where a preset of one's own appears, so its entry
       stays on screen even while the group is empty. */
    const creatorButton = creator === undefined
        ? null
        : (_jsxs("button", { type: "button", className: css.creatorButton, disabled: state.saving, onClick: () => { creator(); closeSettings(); }, children: [_jsx(IconPlusOutlineRegular, { size: 14 }), t('creatorDraft')] }));
    return _jsxs("section", { className: css.section, children: [_jsx("h2", { className: css.title, children: t('nav') }), _jsx("p", { className: css.intro, children: t('sectionIntro') }), state.error === null ? null : _jsx("p", { className: css.error, role: "alert", children: state.error }), [true, false].map((builtIn) => {
                const rows = state.rows.filter(row => isBuiltInPreset(row) === builtIn
                    && (developerTools || !requiresCodingTools(row)));
                const entry = builtIn ? null : creatorButton;
                if (rows.length === 0 && entry === null)
                    return null;
                return _jsxs("section", { className: css.group, children: [_jsx("h3", { className: css.groupHead, children: t(builtIn ? 'builtInGroup' : 'customGroup') }), rows.length === 0 ? null : _jsx("ul", { className: css.cards, children: rows.map((row) => {
                                const display = presetDisplayText(row, t);
                                const help = presetGuide(row.id, builtIn ? 'system' : 'user');
                                const selectionAction = row.broken !== undefined ? t('brokenBadge')
                                    : t(row.isDefault ? 'inUse' : 'setDefault');
                                return _jsxs("li", { "data-agent-preset-id": row.id, className: [
                                        css.card, row.broken === undefined ? undefined : css.cardBroken,
                                        row.isDefault ? css.cardActive : undefined,
                                    ].filter(Boolean).join(' '), children: [_jsxs("button", { type: "button", className: css.cardMain, "aria-pressed": row.isDefault, disabled: row.isDefault || (row.broken === undefined && state.saving), "aria-disabled": row.broken !== undefined, "aria-label": `${selectionAction}: ${display.name}`, title: selectionAction, onClick: () => { if (row.broken === undefined)
                                                void makeDefault(row.id); }, children: [_jsxs("span", { className: css.cardHead, children: [_jsxs("span", { className: css.cardIdentity, children: [_jsx("span", { className: css.cardName, title: display.name, children: display.name }), row.broken === undefined ? null : _jsxs("span", { className: css.brokenBadge, children: [t('brokenBadge'), _jsx("span", { className: css.brokenTip, "aria-hidden": "true", children: row.broken })] }), _jsx(Tag, { tone: row.isDefault ? 'solid' : 'outline', children: row.isDefault ? t('inUse') : t(builtIn ? 'builtInGroup' : 'customGroup') })] }), _jsx("code", { className: css.cardId, title: row.id, children: row.id })] }), _jsx(CardDescription, { text: display.description ?? t('noDescription') }), row.broken === undefined ? null : _jsx("span", { className: css.cardBrokenReason, role: "alert", children: row.broken })] }), _jsxs("div", { className: css.cardFoot, children: [help === undefined ? null : _jsxs("div", { className: css.cardHelp, children: [_jsx(Button, { variant: "ghost", className: css.helpButton, "aria-label": `${t('modeExplanation')}: ${display.name}`, onClick: () => { setGuide({ content: help, page: 'explanation' }); }, children: t('modeExplanation') }), _jsx(Button, { variant: "ghost", className: css.helpButton, "aria-label": `${t('howToUse')}: ${display.name}`, onClick: () => { setGuide({ content: help, page: 'usage' }); }, children: t('howToUse') })] }), _jsx("button", { type: "button", className: css.iconButton, "data-tip": t('view'), "aria-label": `${t('view')}: ${display.name}`, onClick: (event) => { viewTrigger.current = event.currentTarget; void view(row.id); }, children: _jsx(IconBrowseOutlineRegular, {}) })] })] }, row.id);
                            }) }), entry] }, String(builtIn));
            }), guide === null ? null : _jsx(PresetGuideDialog, { guide: guide.content, initialPage: guide.page, t: t, onClose: () => { setGuide(null); } }), _jsx(Modal, { open: viewed !== null, onClose: closeViewer, closeLabel: t('close'), onKeyDownCapture: (event) => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        closeViewer();
                    }
                    else
                        trapPresetReaderTab(event);
                }, title: viewed === null ? '' : `${t('view')} · ${viewedTitle}`, className: css.dialog, footer: _jsx(Button, { variant: "outline", autoFocus: true, onClick: closeViewer, children: t('close') }), children: viewed === null ? null : _jsx("pre", { className: css.viewerCode, children: viewed.content }) })] });
}
//# sourceMappingURL=AgentPresetSection.js.map