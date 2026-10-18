import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/** Translation controls for one expanded reasoning body. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { ReasoningTranslation } from "./translation.js";
import css from './Translation.module.css';
/**
 * Render translated reasoning, retaining the complete original until a failed request is retried.
 * @param props - original reasoning, translation preferences, and cancellation-aware callback.
 * @returns compact Markdown and translation status with a retry action on failure.
 */
export function TranslationBody(props) {
    const { text, running, translate, t, renderFactorySlot } = props;
    const preferences = props.usePreferences(value => value);
    const locale = props.useTranslationLocale(value => value.active);
    const maxTextChars = props.useTranslationLimit(value => value);
    const targetLanguage = preferences.targetLanguage === 'auto' ? locale : preferences.targetLanguage;
    const [state, setState] = useState({ text, pending: false, failed: false });
    const [original, setOriginal] = useState(false);
    const translation = useRef();
    useEffect(() => {
        const controller = new ReasoningTranslation({ provider: preferences.provider, targetLanguage }, maxTextChars, translate, setState);
        translation.current = controller;
        return () => { controller.dispose(); translation.current = undefined; };
    }, [preferences.provider, targetLanguage, maxTextChars, translate]);
    useEffect(() => { translation.current?.update(text, running); }, [text, running, preferences.provider, targetLanguage, maxTextChars, translate]);
    const labels = useMemo(() => ({ code: { copyLabel: t('copy'), copiedLabel: t('copied'),
            toolbarLabels: { codeLabel: t('codeTitle'), wrapLabel: t('wrap'), unwrapLabel: t('unwrap') } }, footnotes: t('footnotes') }), [t]);
    const showOriginal = original || state.failed;
    const actionLabel = t(showOriginal ? 'translation' : 'original');
    return _jsxs("div", { "data-cot-translation": "true", "data-translation-state": state.failed ? 'failed' : state.pending ? 'pending' : 'ready', "data-translation-view": showOriginal ? 'original' : 'translated', children: [_jsxs("div", { className: css.toolbar, children: [_jsx(Button, { className: css.viewToggle, size: "sm", variant: "ghost", disabled: state.failed, onClick: () => { setOriginal(!showOriginal); }, children: actionLabel }), state.pending && _jsx("span", { role: "status", "aria-label": t('translating'), children: _jsx(IconLoadingOutlineRegular, { size: 14, className: css.spinner }) }), state.failed && _jsxs(_Fragment, { children: [_jsx("span", { className: css.failure, role: "status", children: t('failed') }), _jsx(Button, { size: "sm", variant: "ghost", onClick: () => { translation.current?.retry(); }, children: t('retry') })] })] }), renderFactorySlot('conversation.chat.reasoning.content', { text: showOriginal ? text : state.text, running, labels })] });
}
//# sourceMappingURL=TranslationBody.js.map