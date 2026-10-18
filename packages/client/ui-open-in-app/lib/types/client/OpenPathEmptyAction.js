import { jsx as _jsx } from "react/jsx-runtime";
import { FileOpenTarget } from "./OpenPathAction.js";
/**
 * Render the shared file opening menu with a larger labeled main button.
 * @param props - unpreviewable file and injected opening capabilities.
 * @returns the shared file opening action.
 */
export function OpenPathEmptyAction(props) {
    return _jsx(FileOpenTarget, { ...props, empty: true });
}
//# sourceMappingURL=OpenPathEmptyAction.js.map