import type { SourceSnapshot } from './source-controller.ts';
import type { AccountFace } from './face.ts';
import type { AccountLocaleKey } from './locales.ts';
/** Render only owned cached facts; model calls and balance refreshes require a click. */
export declare function SourceDiagnostics({ source, state, actions, t }: {
    source: SourceSnapshot['sources'][number];
    state: SourceSnapshot;
    actions: AccountFace['source'];
    t: (key: AccountLocaleKey) => string;
}): import("react").JSX.Element;
//# sourceMappingURL=SourceDiagnostics.d.ts.map