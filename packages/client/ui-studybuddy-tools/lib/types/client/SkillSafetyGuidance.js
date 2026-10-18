import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import css from './SkillSafetyGuidance.module.css';
/** Read-only opening guidance; never change the composer or prepare resources. */
export function SkillSafetyGuidance({ sessionId, useSessions, inputActions, t }) {
    const preset = useSessions(state => sessionId === undefined ? undefined : state.byId[sessionId]?.projectionValues?.agentPreset);
    if (preset !== 'skill-safety' || !inputActions)
        return null;
    return _jsxs("section", { className: css.guide, "aria-label": t('safetyHeading'), children: [_jsx("h2", { children: t('safetyHeading') }), _jsx("p", { children: t('safetyGuide') })] });
}
//# sourceMappingURL=SkillSafetyGuidance.js.map