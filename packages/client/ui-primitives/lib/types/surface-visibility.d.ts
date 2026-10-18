/** Retained embedded surfaces can withdraw interaction without unmounting stateful content. */
import { type ReactNode } from 'react';
/** Keep descendants mounted while declaring whether their menus and modal layers can interact. */
export declare function SurfaceVisibilityProvider({ visible, children }: {
    visible: boolean;
    children: ReactNode;
}): import("react").JSX.Element;
/** Read effective retained-surface visibility; ordinary standalone UI defaults to visible. */
export declare function useSurfaceVisibility(): boolean;
//# sourceMappingURL=surface-visibility.d.ts.map