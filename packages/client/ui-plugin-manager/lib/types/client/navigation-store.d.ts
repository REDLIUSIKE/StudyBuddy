/** Plugin page selection shared by the page and cross-plugin navigation. */
import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-store';
/** The main or additional plugin list, or one bundle, official item, or bundle row. */
type View = {
    readonly kind: 'list';
} | {
    readonly kind: 'more';
} | {
    readonly kind: 'package';
    readonly name: string;
    readonly from?: 'more';
} | {
    readonly kind: 'item';
    readonly id: string;
} | {
    readonly kind: 'row';
    readonly name: string;
    readonly rowId: string;
    readonly from?: 'more';
};
type NavigationState = {
    view: View;
};
type NavigationActions = {
    setView: (draft: NavigationState, view: View) => void;
};
/**
 * Create plugin page selection before the first page render.
 * @returns the registration-owned navigation store handle.
 */
export declare function createNavigationStore(): EngineStoreHandle<NavigationState, NavigationActions>;
export {};
//# sourceMappingURL=navigation-store.d.ts.map