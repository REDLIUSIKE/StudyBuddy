/** Model menu labels retain the original provider/model tuple for every choice. */
import type { ModelProviderGroup } from '@deepseek-ai/dsh-api-remotes/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
interface DisplayModel {
    provider: string;
    id: string;
    /** Search includes both the saved source name and the official model name. */
    name: string;
    label: string;
    model: ModelProviderGroup['models'][number];
}
interface DisplayGroup {
    id: string;
    name: string;
    models: DisplayModel[];
}
/** Build menu groups without changing the Host catalog or selection authority.
 * @param groups - Original available providers and their exact model entries.
 * @param t - Model namespace translator for fixed section headings.
 * @returns Platform groups followed by one personal section using saved source names. */
export declare function displayModelGroups(groups: readonly ModelProviderGroup[], t: TranslateNS<'model'>): DisplayGroup[];
export {};
//# sourceMappingURL=display-model-groups.d.ts.map