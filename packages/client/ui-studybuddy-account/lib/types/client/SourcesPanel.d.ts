import type { SourceSnapshot } from './source-controller.ts';
import type { AccountFace } from './face.ts';
import type { AccountLocaleKey } from './locales.ts';
/**
 * Render personal sources with the shared native provider display.
 * @param props - exact source facts and callbacks owned by the current account.
 * @returns independent Key rows and the existing source management entry points.
 */
export declare function SourcesPanel({ state, actions, t, openEditor }: {
    state: SourceSnapshot;
    actions: AccountFace['source'];
    t: (key: AccountLocaleKey) => string;
    openEditor: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=SourcesPanel.d.ts.map