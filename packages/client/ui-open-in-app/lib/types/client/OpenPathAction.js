import { jsx as _jsx } from "react/jsx-runtime";
/** File association adapter for the shared file/directory opening control. */
import { useEffect } from 'react';
import { useFileApplications } from "./file-applications.js";
import { OpenTargetButton } from "./OpenTargetButton.js";
/**
 * Resolve file associations and adapt operations without embedding platform behavior in the control.
 * @param props - verified file path, desktop query, native operations, and display variant.
 * @returns the shared opening control, or null without a desktop.
 */
export function FileOpenTarget(props) {
    const desktop = props.useOpenInAppDesktop(value => value);
    const association = useFileApplications(props.absolutePath, props.applications, desktop === true);
    useEffect(() => {
        if (desktop === null)
            void props.loadDesktop();
    }, [desktop, props.loadDesktop]);
    if (desktop !== true)
        return null;
    const { apps } = association;
    return (_jsx(OpenTargetButton, { kind: "file", applications: apps, defaultId: apps.find(app => app.default)?.id, loading: association.loading, failed: association.failed, prominent: props.empty === true, t: props.t, refresh: association.refresh, execute: operation => props.openPath(props.absolutePath, operation.kind === 'reveal' ? 'reveal' : 'open', operation.kind === 'application' ? operation.id : undefined) }, props.absolutePath));
}
/**
 * Render the file adapter in the document header.
 * @param props - document owner inputs and injected opening capabilities.
 * @returns the shared split button.
 */
export function OpenPathAction(props) {
    return _jsx(FileOpenTarget, { ...props });
}
//# sourceMappingURL=OpenPathAction.js.map