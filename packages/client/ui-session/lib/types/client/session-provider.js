import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
/**
 * Render the selected Session body or its empty branch.
 * @param binding - current Session scope binding.
 * @param props - standard Session area render props.
 * @returns the selected Session subtree.
 */
export function renderSessionArea(binding, { empty, children }) {
    if (binding.key === undefined)
        return _jsx(_Fragment, { children: empty?.() ?? null });
    return _jsx(_Fragment, { children: children });
}
//# sourceMappingURL=session-provider.js.map