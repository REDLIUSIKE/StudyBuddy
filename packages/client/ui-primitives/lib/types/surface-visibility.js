import { jsx as _jsx } from "react/jsx-runtime";
/** Retained embedded surfaces can withdraw interaction without unmounting stateful content. */
import { createContext, useContext } from 'react';
const SurfaceVisibility = createContext(true);
/** Keep descendants mounted while declaring whether their menus and modal layers can interact. */
export function SurfaceVisibilityProvider({ visible, children }) {
    const parent = useContext(SurfaceVisibility);
    return _jsx(SurfaceVisibility.Provider, { value: parent && visible, children: children });
}
/** Read effective retained-surface visibility; ordinary standalone UI defaults to visible. */
export function useSurfaceVisibility() { return useContext(SurfaceVisibility); }
//# sourceMappingURL=surface-visibility.js.map