/** Shared filename-to-grammar selection and lazy line highlighter for source views. */
import { useCallback, useSyncExternalStore } from 'react';
import { grammarLoadCount, highlightLines, subscribeGrammarLoaded, } from "./markdown/highlight.js";
// The single extension table is owned by `@deepseek-ai/dsh-util-code-language`,
// shared with the Host read card; re-export it so Client callers keep importing
// the language selector and the preview registry's suffix list from this package.
export { CODE_HIGHLIGHT_EXTENSIONS, languageForPath } from '@deepseek-ai/dsh-util-code-language';
/**
 * Bind the shared lazy highlighter to one language and refresh after its grammar loads.
 * @param language - grammar hint selected from the source filename.
 * @returns a stable fragment highlighter; unknown and loading grammars return `undefined` for plain-text fallback.
 */
export function useCodeHighlighter(language) {
    const loaded = useSyncExternalStore(subscribeGrammarLoaded, grammarLoadCount, grammarLoadCount);
    return useCallback(code => highlightLines(code, language), [language, loaded]);
}
//# sourceMappingURL=code-highlighting.js.map