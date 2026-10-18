import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { FileTypeIcon, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives';
import css from './TextPreview.module.css';
/**
 * The title as the chip and a floating panel's header show it.
 * @param props - the tab information hook.
 * @returns the type's 16px sheet followed by the tab's title text.
 */
export function TextTitle({ useTabInfo }) {
    const { tab } = useTabInfo();
    return (_jsxs(_Fragment, { children: [_jsx(FileTypeIcon, { kind: classifyFileType(tab.title), size: 16, className: css.titleIcon }), tab.title] }));
}
//# sourceMappingURL=TextTitle.js.map