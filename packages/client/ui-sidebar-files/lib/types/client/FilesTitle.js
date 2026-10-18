import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { FileTypeIcon } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './FilesBody.module.css';
/**
 * The title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the folder sheet followed by the tab's title text.
 */
export function FilesTitle({ useTabInfo }) {
    const { tab } = useTabInfo();
    return (_jsxs(_Fragment, { children: [_jsx(FileTypeIcon, { kind: "folder", size: 16, className: css.titleIcon }), tab.title] }));
}
//# sourceMappingURL=FilesTitle.js.map