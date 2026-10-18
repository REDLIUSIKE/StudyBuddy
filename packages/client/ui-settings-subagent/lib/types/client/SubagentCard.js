import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** One settings card for Subagent delegation limits and model authorization. */
import { useId } from 'react';
import { SettingsForm } from '@deepseek-ai/dsh-client-ui-primitives';
import { formLabels } from "./locales.js";
import { SubagentLimitsFields } from "./SubagentLimitsFields.js";
import { SubagentModelSelectionFields } from "./SubagentModelSelectionFields.js";
import { subagentCardShell } from "./subagent-card-controller.js";
import css from './SubagentCard.module.css';
/**
 * Render the available Subagent settings with one configuration page and save footer.
 * @param props - Locale, both form snapshots, and their shared actions.
 * @returns The summary or the available settings form.
 */
export function SubagentCard(props) {
    const { t } = props;
    const limits = props.useSubagentLimitsCard(snapshot => snapshot);
    const models = props.useSubagentModelSelectionCard(snapshot => snapshot);
    const headingId = useId();
    if (props.view === 'summary')
        return t('subagentDescription');
    const state = subagentCardShell(limits, models);
    return (_jsxs(SettingsForm, { labels: formLabels(t), state: state, onSave: props.save, onDiscard: props.discard, children: [limits.available
                ? (_jsxs("section", { className: css.section, "aria-labelledby": `${headingId}-limits`, children: [_jsx("h3", { className: css.heading, id: `${headingId}-limits`, children: t('subagentLimitsTitle') }), _jsx(SubagentLimitsFields, { t: t, state: { ...limits, saving: state.saving }, edit: props.editLimit, resetField: props.resetLimit })] }))
                : null, models.available
                ? (_jsxs("section", { className: css.section, "aria-labelledby": `${headingId}-models`, children: [_jsx("h3", { className: css.heading, id: `${headingId}-models`, children: t('subagentModelSelectionTitle') }), _jsx(SubagentModelSelectionFields, { t: t, state: { ...models, saving: state.saving }, toggleEnabled: props.toggleEnabled, toggleModel: props.toggleModel, retryCatalog: props.retryCatalog })] }))
                : null] }));
}
//# sourceMappingURL=SubagentCard.js.map