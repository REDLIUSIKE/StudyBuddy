import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState, } from 'react';
import clsx from 'clsx';
import { Button, IconCheckOutlineRegular, IconChevronDownOutlineRegular, IconChevronLeftOutlineRegular, IconChevronRightOutlineRegular, IconChevronUpOutlineRegular, IconCloseOutlineRegular, IconEditOutlineRegular, MarkdownText, } from '@deepseek-ai/dsh-client-ui-primitives';
import { planReviewOf } from "./contract/slots.js";
import { PlanReviewPanel } from "./PlanReviewPanel.js";
import css from './QuestionComposer.module.css';
/** A removed card can remain mounted until the composer seat updates. */
const REMOVED_CARD = {
    state: 'open', waitState: 'counting', countdown: undefined, channel: 'none', closed: true,
};
/**
 * Split the conventional recommendation suffix without changing the answer value.
 * @param label - Original option label returned if selected.
 * @returns Display label plus recommendation state.
 */
export function parseRecommendedLabel(label) {
    const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
    return suffix.test(label)
        ? { label: label.replace(suffix, ''), recommended: true }
        : { label, recommended: false };
}
/** Only a marked first choice is an implicit draft; the user still submits it. */
function recommendedFirstOption(question) {
    const label = question.options?.[0]?.label;
    return label !== undefined && parseRecommendedLabel(label).recommended ? label : undefined;
}
/** Accept persisted progress only when it still describes this question batch. */
function isQuestionDraftProgress(value, questionCount) {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        return false;
    const progress = value;
    if (typeof progress.index !== 'number' || !Number.isInteger(progress.index)
        || progress.index < 0 || progress.index >= questionCount
        || !Array.isArray(progress.drafts) || progress.drafts.length !== questionCount
        || (progress.wait !== undefined && progress.wait !== 'editing' && progress.wait !== 'waiting'))
        return false;
    return progress.drafts.every((item) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item))
            return false;
        const draft = item;
        return Array.isArray(draft.selected) && draft.selected.every((label) => typeof label === 'string')
            && typeof draft.custom === 'string' && typeof draft.skipped === 'boolean';
    });
}
/** Return whether a text-field key event belongs to an active IME composition. */
function isComposing(event) {
    // keyCode 229 is the legacy IME-composition signal engines emit without isComposing.
    return event.nativeEvent.isComposing || Reflect.get(event.nativeEvent, 'keyCode') === 229;
}
/**
 * Auto-growing free-text answer: a textarea, so a long answer soft-wraps and
 * Shift+Enter breaks a line, over a hidden mirror that owns the height.
 *
 * The mirror renders the draft plus a trailing newline in normal flow and so
 * sizes the grid row (counting rows by '\n' cannot see soft wraps); the
 * textarea shares that one cell and stretches to it, and `rows={1}` keeps the
 * control's own intrinsic height out of the row sizing so the mirror alone
 * decides. Past the mirror's cap the textarea scrolls itself — it is the only
 * scrollport in the stack, there being no second glyph layer to keep aligned.
 * Mirror and textarea MUST share font, line-height, padding and wrapping rules
 * or the two heights diverge.
 *
 * @param props - visual variant, draft text, and the field's event handlers.
 * @returns The mirrored auto-growing field.
 */
function AnswerField(props) {
    return (_jsxs("div", { className: clsx(css.field, props.variant === 'inline' ? css.customInline : css.customBlock), children: [_jsx("div", { "aria-hidden": true, className: css.fieldMirror, children: `${props.value}\n` }), _jsx("textarea", { autoFocus: props.autoFocus, className: css.fieldInput, value: props.value, disabled: props.disabled, rows: 1, placeholder: props.placeholder, onFocus: props.onFocus, onChange: props.onChange, onKeyDown: props.onKeyDown })] }));
}
/**
 * Composer takeover router. Generic-question drafts live in this entry's
 * Session-scoped Slot store, keyed by the pending carrier, so a strict Session
 * entry remount restores the same request without exposing it to another one.
 *
 * One takeover, two presentations: a request that declares a presentation intent this
 * package renders uses that presentation (a plan review is one decision over one
 * plan, not a question set), and every other request takes the generic flow.
 * The routing lives here, at the one entry that owns the composer seat, so
 * neither presentation can claim a request the other is already rendering.
 *
 * @param props - the selector-matched pending question carrier plus the framework standard kit.
 * @returns The question flow, or the intent's own surface, for this request.
 */
export function QuestionComposer(props) {
    const question = props.matched;
    const review = useMemo(() => planReviewOf(question.questions), [question]);
    return review === undefined
        ? (_jsx(QuestionFlow, { pending: question, t: props.t, useStore: props.useStore, useQuestionCard: props.useQuestionCard, actions: props.actions }, question.key))
        : _jsx(PlanReviewPanel, { pending: question, review: review, t: props.t, renderSlot: props.renderSlot }, question.key);
}
function QuestionFlow({ pending, t, useStore, useQuestionCard, actions }) {
    const questions = pending.questions;
    // A read-only card built from a settled call's transcript: the same panel
    // over the recorded answers, with nothing left to submit.
    const review = pending.review;
    const markdownLabels = useMemo(() => ({
        code: { copyLabel: t('copy'), copiedLabel: t('copied'), toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') } },
        footnotes: t('markdown.footnotes'),
    }), [t]);
    const initialDrafts = useMemo(() => {
        // Recorded answers echo the question ids rather than their order.
        const recorded = new Map((review ?? []).map(answer => [answer.id, answer]));
        return questions.map((item) => {
            const answer = recorded.get(item.id);
            const custom = answer?.custom ?? '';
            const recommended = review === undefined ? recommendedFirstOption(item) : undefined;
            return {
                selected: answer === undefined && recommended !== undefined ? [recommended] : [...answer?.selected ?? []],
                custom,
                // A recorded answer with no selection and no custom text was skipped.
                skipped: answer !== undefined && answer.selected.length === 0 && custom === '',
            };
        });
    }, [questions, review]);
    const stored = useStore(state => state.progressByRequest[pending.key]);
    const validStored = isQuestionDraftProgress(stored, questions.length) ? stored : undefined;
    // A review card renders the record itself, so a draft its live card left
    // behind can never surface as an answer; only the page position is restored.
    const storedProgress = review === undefined ? validStored : undefined;
    const index = validStored?.index ?? 0;
    const drafts = storedProgress?.drafts ?? initialDrafts;
    const restoredWait = storedProgress?.wait
        ?? (storedProgress?.drafts.some((item, itemIndex) => item.selected.length !== initialDrafts[itemIndex]?.selected.length
            || item.selected.some((label, labelIndex) => label !== initialDrafts[itemIndex]?.selected[labelIndex])
            || item.custom !== '' || item.skipped) === true
            ? 'editing' : undefined);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);
    const card = useQuestionCard(pending.key, snapshot => snapshot ?? REMOVED_CARD);
    const canSubmit = card.channel !== 'none';
    // The answer surface freezes while a submission is in flight, and for good on
    // a review card: its call has already settled.
    const locked = busy !== null || review !== undefined;
    // A waterfall submission is only "sent": the gateway drops an outcome that
    // arrives after another Client settled the event, without telling anyone.
    // The draft therefore survives until the projection closes the card, and a
    // card that flips to continued while a submission is in flight re-arms the
    // controls so the same draft can go through the Remote path.
    const sentVia = useRef(null);
    useEffect(() => {
        if (sentVia.current !== 'waterfall' || card.state !== 'continued')
            return;
        sentVia.current = null;
        setBusy(null);
        setError({ key: 'error.resubmit' });
    }, [card.state]);
    useEffect(() => {
        if (card.closed)
            actions.clear(pending.key);
    }, [actions, card.closed, pending.key]);
    useEffect(() => {
        actions.prune(pending.liveKeys());
    }, [actions, pending]);
    const waitDisposition = useRef(restoredWait);
    useEffect(() => {
        if (waitDisposition.current === 'waiting')
            pending.takeTime();
        if (waitDisposition.current === 'editing')
            pending.engage();
    }, [pending]);
    // The countdown belongs to the carrier, not to this component: the user can
    // close the panel and reopen it from the tool call row, and a timer that died
    // with the mount would leave the tool call waiting past its deadline.
    const countdown = card.countdown;
    // Collapsed to the header strip so the conversation above stays readable
    // while the user decides; answer drafts live in the Session store above.
    const [minimized, setMinimized] = useState(false);
    // The free-form textarea autofocuses on first presentation; re-expanding a
    // collapsed question must not steal focus from the expand toggle back into
    // the input, so focus is granted once per question index.
    const focusedQuestions = useRef(new Set());
    const answerSurface = useRef(null);
    // Every navigation write stays in bounds and drafts mirrors questions 1:1.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const question = questions[index];
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const draft = drafts[index];
    const hasOptions = (question.options?.length ?? 0) > 0;
    const replaceProgress = (nextIndex, nextDrafts) => {
        actions.replace(pending.key, {
            index: nextIndex,
            drafts: nextDrafts,
            ...(waitDisposition.current === undefined ? {} : { wait: waitDisposition.current }),
        });
    };
    const takeTime = () => {
        waitDisposition.current = 'waiting';
        pending.takeTime();
        replaceProgress(index, drafts);
    };
    const engage = () => {
        if (waitDisposition.current !== undefined)
            return;
        waitDisposition.current = 'editing';
        pending.engage();
    };
    const focusAnswerSurface = (event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
            pending.holdFocus();
    };
    const blurAnswerSurface = (event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
            pending.releaseFocus();
    };
    useEffect(() => {
        const release = () => { pending.releaseFocus(); };
        const refocus = () => {
            if (waitDisposition.current === 'editing') {
                pending.engage();
                return;
            }
            if (answerSurface.current?.contains(document.activeElement) === true)
                pending.holdFocus();
        };
        const visibilityChanged = () => { if (document.hidden)
            release();
        else
            refocus(); };
        window.addEventListener('blur', release);
        window.addEventListener('focus', refocus);
        document.addEventListener('visibilitychange', visibilityChanged);
        return () => {
            release();
            window.removeEventListener('blur', release);
            window.removeEventListener('focus', refocus);
            document.removeEventListener('visibilitychange', visibilityChanged);
        };
    }, [pending]);
    const dismissFlow = () => {
        // A tool-call-keyed panel only leaves the seat; nothing is sent and nothing
        // is persisted, and the tool call row brings it back.
        if (pending.dismissal === 'hide') {
            void pending.dismiss();
            return;
        }
        if (!canSubmit) {
            setError({ key: 'error.unavailable' });
            return;
        }
        setBusy('cancel');
        setError(null);
        sentVia.current = 'waterfall';
        void pending.dismiss()
            .catch((cause) => {
            sentVia.current = null;
            setBusy(null);
            setError({ text: cause instanceof Error ? cause.message : String(cause) });
        });
    };
    const updateDraft = (update, nextIndex = index) => {
        engage();
        const nextDrafts = drafts.map((item, itemIndex) => itemIndex === index ? update(item) : item);
        replaceProgress(nextIndex, nextDrafts);
        setError(null);
    };
    const choose = (label) => {
        updateDraft((current) => {
            if (question.multiSelect === true) {
                const selected = current.selected.includes(label)
                    ? current.selected.filter(item => item !== label)
                    : [...current.selected, label];
                return { ...current, selected, skipped: false };
            }
            return { selected: [label], custom: '', skipped: false };
        }, question.multiSelect !== true && index < questions.length - 1 ? index + 1 : index);
    };
    const answered = (item) => item.selected.length > 0 || item.custom.trim() !== '';
    const completed = (item) => answered(item) || item.skipped;
    const submitDrafts = (values) => {
        const missing = values.findIndex(item => !completed(item));
        if (missing >= 0) {
            replaceProgress(missing, values);
            setError({ key: 'error.incomplete' });
            return;
        }
        if (!canSubmit) {
            setError({ key: 'error.unavailable' });
            return;
        }
        const answer = {
            answers: questions.map((item, itemIndex) => {
                const value = values[itemIndex];
                if (value.skipped)
                    return { id: item.id, selected: [] };
                const custom = value.custom.trim();
                return {
                    id: item.id,
                    selected: custom === '' || item.multiSelect === true ? value.selected : [],
                    ...(custom === '' ? {} : { custom }),
                };
            }),
        };
        setBusy('answer');
        setError(null);
        // The external-store render can lag the carrier as a timed call continues.
        // Read the channel used by answer() in this same event turn.
        const channel = pending.snapshot().channel;
        sentVia.current = channel === 'waterfall' ? 'waterfall' : null;
        void pending.answer(answer)
            .then(() => {
            if (channel !== 'rpc')
                return;
            sentVia.current = null;
            setBusy(null);
            setError(null);
            void pending.dismiss().catch(() => { setError({ key: 'status.sent' }); });
        })
            .catch((cause) => {
            sentVia.current = null;
            setBusy(null);
            setError({ text: cause instanceof Error ? cause.message : String(cause) });
        });
    };
    const continueFlow = () => {
        if (!answered(draft)) {
            setError({ key: 'error.unanswered' });
            return;
        }
        if (index < questions.length - 1) {
            replaceProgress(index + 1, drafts);
            setError(null);
            return;
        }
        submitDrafts(drafts);
    };
    // Shared by the inline custom field and the optionless one: a multi-select
    // draft retains checked labels, while a single-select custom answer replaces
    // its selection. Enter continues the flow, Shift+Enter breaks a line.
    const draftCustom = (event) => {
        const value = event.target.value;
        updateDraft(current => ({
            ...current,
            selected: question.multiSelect === true ? current.selected : [],
            custom: value,
            skipped: false,
        }));
    };
    const continueFromCustom = (event) => {
        if (event.key !== 'Enter' || event.shiftKey || isComposing(event))
            return;
        event.preventDefault();
        continueFlow();
    };
    const skipQuestion = () => {
        engage();
        const nextDrafts = drafts.map((item, itemIndex) => itemIndex === index
            ? { selected: [], custom: '', skipped: true }
            : item);
        replaceProgress(index < questions.length - 1 ? index + 1 : index, nextDrafts);
        setError(null);
        if (index < questions.length - 1) {
            return;
        }
        submitDrafts(nextDrafts);
    };
    return (_jsx("div", { className: css.frame, "data-question-key": pending.key, children: _jsxs("section", { className: clsx(css.card, minimized && css.cardMinimized), "aria-labelledby": `question-${pending.key}-${String(index)}`, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { className: css.headingBlock, children: [question.header !== undefined && _jsx("div", { className: css.eyebrow, children: question.header }), _jsx("h2", { className: css.title, id: `question-${pending.key}-${String(index)}`, children: question.question })] }), _jsxs("div", { className: css.headerActions, children: [countdown !== undefined && card.waitState !== 'waiting' && card.waitState !== 'editing' && card.waitState !== 'continued' && (_jsx("span", { className: css.waitStatus, children: t(countdown.running ? 'wait.countdown' : 'wait.paused', {
                                        seconds: Math.ceil(countdown.remainingMs / 1000),
                                    }) })), countdown !== undefined && card.waitState !== 'waiting' && card.waitState !== 'editing' && card.waitState !== 'continued' && (_jsx(Button, { variant: "outline", className: css.waitButton, onClick: takeTime, children: t('wait.takeTime') })), card.state === 'continued' && _jsx("span", { className: css.waitStatus, children: t('wait.continued') }), countdown !== undefined && (card.waitState === 'waiting' || card.waitState === 'editing') && (_jsx("span", { className: css.waitStatus, children: t('wait.held') })), review !== undefined && _jsx("span", { className: css.waitStatus, children: t('review.status') }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t(minimized ? 'nav.maximize' : 'nav.minimize'), title: t(minimized ? 'nav.maximize' : 'nav.minimize'), "aria-expanded": !minimized, disabled: busy !== null, onClick: () => { setMinimized(current => !current); }, children: minimized ? _jsx(IconChevronUpOutlineRegular, {}) : _jsx(IconChevronDownOutlineRegular, {}) }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t(pending.dismissal === 'hide' ? 'nav.close' : 'nav.cancel'), title: t(pending.dismissal === 'hide' ? 'nav.close' : 'nav.cancel'), disabled: busy !== null, onClick: dismissFlow, children: _jsx(IconCloseOutlineRegular, {}) })] })] }), !minimized && (_jsxs(_Fragment, { children: [_jsxs("div", { ref: answerSurface, className: css.body, "data-question-scroll": true, onFocusCapture: focusAnswerSurface, onBlurCapture: blurAnswerSurface, children: [question.detail !== undefined && (_jsx("div", { className: css.detail, children: _jsx(MarkdownText, { text: question.detail, labels: markdownLabels }) })), _jsxs("div", { className: css.options, role: question.multiSelect === true ? 'group' : 'radiogroup', children: [(question.options ?? []).map((option, optionIndex) => {
                                            const selected = draft.selected.includes(option.label);
                                            const display = parseRecommendedLabel(option.label);
                                            return (_jsxs("button", { type: "button", className: clsx(css.option, selected && question.multiSelect !== true && css.optionSelected), role: question.multiSelect === true ? 'checkbox' : 'radio', "aria-checked": selected, "aria-label": display.label, disabled: locked, onClick: () => { choose(option.label); }, onKeyDown: (event) => {
                                                    if (event.key !== 'Enter')
                                                        return;
                                                    event.preventDefault();
                                                    submitDrafts(drafts);
                                                }, children: [question.multiSelect === true
                                                        ? (_jsx("span", { className: clsx(css.checkbox, selected && css.checkboxChecked), "aria-hidden": "true", children: selected && _jsx(IconCheckOutlineRegular, { size: 12 }) }))
                                                        : _jsx("span", { className: css.number, children: optionIndex + 1 }), _jsx("span", { className: css.optionCopy, children: _jsxs("span", { className: css.optionLine, children: [_jsx("span", { className: css.optionLabel, children: display.label }), display.recommended && (_jsx("span", { className: css.badge, children: t('option.recommended') })), option.description !== undefined && (_jsx("span", { className: css.description, children: option.description }))] }) })] }, `${option.label}-${String(optionIndex)}`));
                                        }), review !== undefined && draft.skipped && (_jsx("p", { className: css.reviewNote, children: t('review.skipped') })), (review === undefined || draft.custom !== '') && (hasOptions
                                            ? (_jsxs("div", { className: clsx(css.customRow, draft.custom !== '' && css.customRowActive), children: [question.multiSelect === true
                                                        ? (_jsx("span", { className: clsx(css.checkbox, draft.custom !== '' && css.checkboxChecked), "aria-hidden": "true", children: draft.custom !== '' && _jsx(IconCheckOutlineRegular, { size: 12 }) }))
                                                        : (_jsx("span", { className: css.number, "aria-hidden": "true", children: _jsx(IconEditOutlineRegular, { size: 12 }) })), _jsx(AnswerField, { variant: "inline", value: draft.custom, disabled: locked, placeholder: t('custom.placeholder'), onChange: draftCustom, onKeyDown: continueFromCustom })] }))
                                            : (_jsx(AnswerField
                                            // A missing countdown does not imply an indefinite request:
                                            // a timed request can still be awaiting its claim's first frame.
                                            , { 
                                                // A missing countdown does not imply an indefinite request:
                                                // a timed request can still be awaiting its claim's first frame.
                                                autoFocus: canSubmit && countdown === undefined && !locked && !focusedQuestions.current.has(index), variant: "block", value: draft.custom, disabled: locked, placeholder: t('custom.placeholder'), onFocus: () => { focusedQuestions.current.add(index); }, onChange: draftCustom, onKeyDown: continueFromCustom })))] })] }), _jsxs("footer", { className: css.footer, children: [_jsxs("div", { className: css.pager, children: [_jsx("button", { type: "button", className: css.iconButton, "aria-label": t('nav.prev'), disabled: index === 0 || busy !== null, onClick: () => { replaceProgress(index - 1, drafts); setError(null); }, children: _jsx(IconChevronLeftOutlineRegular, {}) }), _jsxs("span", { className: css.progress, children: [index + 1, " / ", questions.length] }), _jsx("button", { type: "button", className: css.iconButton, "aria-label": t('nav.next'), disabled: index === questions.length - 1 || busy !== null, onClick: () => { replaceProgress(index + 1, drafts); setError(null); }, children: _jsx(IconChevronRightOutlineRegular, {}) })] }), _jsx("div", { className: css.feedback, role: "status", children: error === null ? null : 'key' in error ? t(error.key) : error.text }), review === undefined && (_jsxs("div", { className: css.footerActions, children: [_jsx(Button, { variant: "outline", disabled: busy !== null, onClick: skipQuestion, children: t('action.skip') }), _jsx(Button, { variant: "primary", disabled: busy !== null || !answered(draft) || (index === questions.length - 1 && !canSubmit), onClick: continueFlow, children: busy === 'answer'
                                                ? t('submitting')
                                                : index === questions.length - 1 ? t('submit') : t('action.next') })] }))] })] }))] }) }));
}
//# sourceMappingURL=QuestionComposer.js.map