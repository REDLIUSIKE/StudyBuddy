/** Retained embedded surfaces can withdraw interaction without unmounting stateful content. */
import { createContext, useContext, type ReactNode } from 'react'
const SurfaceVisibility = createContext(true)
/** Keep descendants mounted while declaring whether their menus and modal layers can interact. */
export function SurfaceVisibilityProvider({ visible, children }: { visible: boolean; children: ReactNode }) {
  const parent = useContext(SurfaceVisibility)
  return <SurfaceVisibility.Provider value={parent && visible}>{children}</SurfaceVisibility.Provider>
}
/** Read effective retained-surface visibility; ordinary standalone UI defaults to visible. */
export function useSurfaceVisibility(): boolean { return useContext(SurfaceVisibility) }
