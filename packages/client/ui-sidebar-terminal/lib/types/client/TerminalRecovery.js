import { jsx as _jsx } from "react/jsx-runtime";
/** A Session header lifetime restores retained Host terminals without saving sidebar layout. */
import { useEffect, useState } from 'react';
/**
 * Restore terminals when a Session is displayed, with a retry action on lookup failure.
 * @param props - Session header lifetime, restoration callback and localized copy.
 * @returns nothing on success, or an unobtrusive retry control.
 */
export function TerminalRecovery({ restore, t }) {
    const [error, setError] = useState();
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
        let active = true;
        void restore().then(() => { if (active)
            setError(undefined); }, (reason) => {
            if (active)
                setError(reason instanceof Error ? reason.message : String(reason));
        });
        return () => { active = false; };
    }, [restore, attempt]);
    return error === undefined ? null : _jsx("button", { type: "button", title: t('recoveryFailed', { message: error }), onClick: () => { setError(undefined); setAttempt(value => value + 1); }, children: t('retryRecovery') });
}
//# sourceMappingURL=TerminalRecovery.js.map