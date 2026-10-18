import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Per-message feedback controls: the Like/Dislike pair inside the assistant
 * message's IconActions row, between copy and branch. Either rating opens the
 * Session's feedback dialog, whose submission records that judgment with its
 * category and text. Clicking the recorded rating retracts it. A recorded rating
 * shows the filled glyph so the signal survives a pointer leaving the row.
 * @module @deepseek-ai/dsh-client-ui-message-feedback/client/MessageFeedbackActions
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconDislikeFillRegular, IconDislikeOutlineRegular, IconLikeFillRegular, IconLikeOutlineRegular, Tooltip, } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './MessageFeedbackActions.module.css';
/**
 * One message's feedback controls.
 * @param props - the owner's message identity, the injected verbs, and the
 * shared feedback hook.
 * @returns the rating buttons with any failure notice beside them.
 */
export function MessageFeedbackActions({ messageId, ensure, current, retract, openDialog, useFeedback, t, }) {
    const item = useFeedback(view => view.items.get(messageId));
    const loadFailed = useFeedback(view => view.status === 'error');
    const rating = item?.rating;
    const [pending, setPending] = useState(false);
    // A rating or load failure surfaces beside the rating buttons.
    const [failure, setFailure] = useState(null);
    // The controls mount for every settled message in the transcript, so the
    // Session's feedback is read once on first hover/focus rather than on mount.
    const seeded = useRef(false);
    const seed = useCallback(() => {
        if (seeded.current)
            return;
        seeded.current = true;
        void ensure();
    }, [ensure]);
    const alive = useRef(true);
    useEffect(() => () => { alive.current = false; }, []);
    const errorCopy = useCallback((result) => {
        return result.error.code === 'version-conflict' ? t('error.conflict') : t('error.generic');
    }, [t]);
    // A recorded rating retracts on click; either unrecorded rating opens the
    // dialog and records only after submission. The decision waits for the
    // seeding read, so a click on a cold row still sees the stored judgment.
    const choose = useCallback((nextRating) => {
        setPending(true);
        setFailure(null);
        void ensure().then((loaded) => {
            if (!alive.current)
                return;
            if (!loaded.ok || current(messageId)?.rating !== nextRating) {
                setPending(false);
                openDialog(messageId, nextRating);
                return;
            }
            void retract(messageId, nextRating).then((result) => {
                if (!alive.current)
                    return;
                setPending(false);
                if (!result.ok)
                    setFailure(errorCopy(result));
            });
        });
    }, [current, ensure, errorCopy, messageId, openDialog, retract]);
    const onLike = useCallback(() => { choose('positive'); }, [choose]);
    const onDislike = useCallback(() => { choose('negative'); }, [choose]);
    const likeLabel = rating === 'positive' ? t('action.likeActive') : t('action.like');
    const dislikeLabel = rating === 'negative' ? t('action.dislikeActive') : t('action.dislike');
    return (_jsxs(_Fragment, { children: [_jsx(Tooltip, { label: likeLabel, side: "bottom", children: _jsx("button", { type: "button", className: css.action, "aria-label": likeLabel, "aria-pressed": rating === 'positive', "data-active": rating === 'positive' || undefined, disabled: pending, onFocus: seed, onPointerEnter: seed, onClick: onLike, children: rating === 'positive' ? _jsx(IconLikeFillRegular, {}) : _jsx(IconLikeOutlineRegular, {}) }) }), _jsx(Tooltip, { label: dislikeLabel, side: "bottom", children: _jsx("button", { type: "button", className: css.action, "aria-label": dislikeLabel, "aria-pressed": rating === 'negative', "data-active": rating === 'negative' || undefined, disabled: pending, onFocus: seed, onPointerEnter: seed, onClick: onDislike, children: rating === 'negative' ? _jsx(IconDislikeFillRegular, {}) : _jsx(IconDislikeOutlineRegular, {}) }) }), failure === null && loadFailed && (_jsx("span", { className: css.failure, role: "status", children: t('error.load') })), failure !== null && _jsx("span", { className: css.failure, role: "status", children: failure })] }));
}
//# sourceMappingURL=MessageFeedbackActions.js.map