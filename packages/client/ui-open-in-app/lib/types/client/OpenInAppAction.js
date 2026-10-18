import { jsx as _jsx } from "react/jsx-runtime";
import { APP_LABEL_KEY } from "./applications.js";
import { OpenTargetButton } from "./OpenTargetButton.js";
/**
 * Adapt the installed directory catalog to the shared opening control.
 * @param props - displayed directory, installed catalog, and launch operations.
 * @returns the shared control, or null without an eligible application.
 */
export function OpenInAppAction(props) {
    const { absolutePath, useOpenInAppApps, useOpenInAppChoice, t } = props;
    const available = useOpenInAppApps(apps => apps);
    const choice = useOpenInAppChoice(id => id);
    const operation = props.useOpenInAppLaunch(value => value);
    const shortcut = props.useShortcuts(rows => rows.find(row => row.id === 'workspace.openLocal'));
    const apps = (available ?? []).flatMap((id) => {
        const key = APP_LABEL_KEY[id];
        return key === undefined ? [] : [{ id, name: t(key), icon: props.iconUrl(id) }];
    });
    const preferred = apps.find(app => app.id === choice) ?? apps[0];
    if (preferred === undefined)
        return null;
    return (_jsx(OpenTargetButton, { kind: "directory", applications: apps, defaultId: preferred.id, failed: false, t: t, busy: operation.phase === 'busy', shortcut: shortcut, execute: async (operation) => {
            const id = operation.kind === 'application' ? operation.id : preferred.id;
            try {
                await props.launch(id, absolutePath);
            }
            catch (_error) {
                // Native launch failure is announced by the shared control.
                return 'openError';
            }
            if (operation.kind === 'application')
                props.choose(id);
            return null;
        } }, absolutePath));
}
//# sourceMappingURL=OpenInAppAction.js.map