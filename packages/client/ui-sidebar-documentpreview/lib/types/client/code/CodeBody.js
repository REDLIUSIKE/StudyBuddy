import { jsx as _jsx } from "react/jsx-runtime";
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives';
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path';
import css from './CodeBody.module.css';
/** @param props - accumulated document contents and framework props. @returns one stable CodeBlock, or no body for byte contents. */
export function CodeBody({ resourceAddress, content, wrap, scrollportRef, t }) {
    if (content.kind !== 'text')
        return null;
    const file = parseFileAddress(resourceAddress);
    if (file === undefined)
        throw new Error(`ui-sidebar-documentpreview: not a file address "${resourceAddress}"`);
    const language = languageForPath(file.path);
    return (_jsx("div", { className: css.renderer, "data-code-preview": true, "data-wrap": wrap, children: _jsx(CodeBlock, { className: css.code, contentRef: scrollportRef, code: content.text, lang: language, streaming: !content.eof, wrap: wrap, lineNumbers: true, copyLabel: t('copy'), copiedLabel: t('copied'), toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') } }) }));
}
//# sourceMappingURL=CodeBody.js.map