import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Read-only help stays local to Settings and never changes the selected preset. */
import { useId, useLayoutEffect, useRef, useState } from 'react';
import { Button, IconCloseOutlineRegular, IconListPenOutlineRegular, MarkdownText, Modal, SegmentedTabs, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './PresetGuideDialog.module.css';
const guides = new Map([
    ['standard', { name: 'presetStandardName', intro: 'guideStandardIntro', explanation: 'guideStandardExplanation', usage: 'guideStandardUsage' }],
    ['ptc', { name: 'presetPtcName', intro: 'guidePtcIntro', explanation: 'guidePtcExplanation', usage: 'guidePtcUsage' }],
    ['minimal', { name: 'presetMinimalName', intro: 'guideMinimalIntro', explanation: 'guideMinimalExplanation', usage: 'guideMinimalUsage' }],
    ['cordis', { name: 'presetCordisName', intro: 'guideCordisIntro', explanation: 'guideCordisExplanation', usage: 'guideCordisUsage' }],
]);
/**
 * Look up help only for known, shipped presets.
 * @param id - preset identifier from the roster.
 * @param trust - roster source; custom presets own their capability claims.
 * @returns the shipped guide, or undefined for unknown and custom presets.
 */
export function presetGuide(id, trust) {
    return trust === 'system' ? guides.get(id) : undefined;
}
/** Keep keyboard focus inside a preset reader while Tab moves through its controls.
 * @param event Keyboard event from the active reader.
 */
export function trapPresetReaderTab(event) {
    if (event.key !== 'Tab')
        return;
    const targets = Array.from(event.currentTarget.querySelectorAll('button:not([disabled]):not([tabindex="-1"]), [tabindex="0"]')).filter(element => !element.closest('[hidden]'));
    const first = targets[0];
    const last = targets[targets.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    }
    else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
    }
}
/** Curated usage dictionaries contain only level-three example sections. */
function GuideUsage({ text, t }) {
    const labels = {
        code: { copyLabel: t('guideCopy'), copiedLabel: t('guideCopied'), toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') } },
        footnotes: t('guideFootnotes'),
    };
    return text.split(/(?=^### )/m).map((section) => {
        const headingEnd = section.indexOf('\n');
        const title = section.slice(4, headingEnd);
        return (_jsxs("section", { className: css.guideExample, children: [_jsxs("div", { className: css.guideExampleHeader, children: [_jsx("h3", { children: title }), _jsxs(Tag, { tone: "neutral", className: css.guideExampleTag, children: [_jsx(IconListPenOutlineRegular, { size: 12 }), t('guideExampleTask')] })] }), _jsx(MarkdownText, { text: section.slice(headingEnd + 1), labels: labels })] }, title));
    });
}
/**
 * Open read-only help without changing the selected preset.
 * @param props - localized guide, initial page, and close callback.
 * @returns the modal reader with independent scroll positions for each page.
 */
export function PresetGuideDialog({ guide, initialPage, t, onClose }) {
    const [page, setPage] = useState(initialPage);
    const guideId = useId();
    const content = useRef(null);
    useLayoutEffect(() => {
        content.current?.querySelector('[role="tab"][aria-selected="true"]')?.focus();
    }, []);
    // This reader sits above Settings. Keep keyboard navigation in the reader,
    // and let Escape dismiss only this layer before returning to its trigger.
    const onKeyDown = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
        }
        else
            trapPresetReaderTab(event);
    };
    return (_jsx(Modal, { open: true, headless: true, onClose: onClose, title: t(guide.name), className: css.guideDialog, children: _jsxs("div", { ref: content, className: css.guideLayout, role: "presentation", onKeyDownCapture: onKeyDown, children: [_jsxs("div", { className: css.guideHeader, children: [_jsxs("div", { className: css.guideTitleRow, children: [_jsx("h2", { className: css.guideTitle, children: t(guide.name) }), _jsx(Button, { variant: "ghost", className: css.guideClose, "aria-label": t('close'), onClick: onClose, children: _jsx(IconCloseOutlineRegular, { size: 18 }) })] }), _jsx("p", { className: css.guideIntro, children: t(guide.intro) })] }), _jsx(SegmentedTabs, { className: css.guideTabs, label: t('guideSections'), value: page, onChange: setPage, items: [
                        { value: 'explanation', label: t('modeExplanation'), id: `${guideId}-explanation-tab`, panelId: `${guideId}-explanation-panel` },
                        { value: 'usage', label: t('howToUse'), id: `${guideId}-usage-tab`, panelId: `${guideId}-usage-panel` },
                    ] }), ['explanation', 'usage'].map(section => (_jsx("div", { id: `${guideId}-${section}-panel`, role: "tabpanel", "aria-labelledby": `${guideId}-${section}-tab`, className: css.guidePanel, "data-guide-page": section, hidden: page !== section, tabIndex: 0, children: section === 'usage'
                        ? _jsx(GuideUsage, { text: t(guide.usage), t: t })
                        : (_jsx(MarkdownText, { text: t(guide.explanation), labels: {
                                code: { copyLabel: t('guideCopy'), copiedLabel: t('guideCopied'), toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') } },
                                footnotes: t('guideFootnotes'),
                            } })) }, section)))] }) }));
}
//# sourceMappingURL=PresetGuideDialog.js.map