import { jsx as _jsx } from "react/jsx-runtime";
/** Load xterm only after a terminal body is mounted. */
import { lazy, Suspense } from 'react';
const LoadedTerminalBody = lazy(async () => ({ default: (await import("./terminal.js")).TerminalBody }));
/**
 * Suspend while the package-local terminal chunk arrives.
 * @param props - Terminal body props supplied by the sidebar slot.
 * @returns the deferred terminal renderer.
 */
export function LazyTerminalBody(props) {
    return _jsx(Suspense, { fallback: null, children: _jsx(LoadedTerminalBody, { ...props }) });
}
//# sourceMappingURL=LazyTerminalBody.js.map