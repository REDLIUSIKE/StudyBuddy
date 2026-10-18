import type { SourceSnapshot } from './source-controller.ts';
import type { AccountFace } from './face.ts';
import type { AccountLocaleKey } from './locales.ts';
export declare function SourceEditor({ state, actions, t, onClose }: {
    state: SourceSnapshot;
    actions: AccountFace['source'];
    t: (key: AccountLocaleKey) => string;
    onClose: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=SourceEditor.d.ts.map