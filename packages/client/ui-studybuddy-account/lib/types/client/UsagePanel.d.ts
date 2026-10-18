import type { UsageSnapshot } from './usage-controller.ts';
import type { AccountFace } from './face.ts';
import type { AccountLocaleKey } from './locales.ts';
export declare function UsagePanel({ state, actions, kind, setKind, t }: {
    state: UsageSnapshot;
    actions: AccountFace['usage'];
    kind: 'platform' | 'user_api';
    setKind(kind: 'platform' | 'user_api'): void;
    t(key: AccountLocaleKey): string;
}): import("react").JSX.Element;
//# sourceMappingURL=UsagePanel.d.ts.map