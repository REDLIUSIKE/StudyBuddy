/** Entering research gives its editors and native chat the full available width. */
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots';
/** Observe transitions rather than geometry, so a manual expansion remains possible. */
export declare function observeResearchActivation(source: HostObservable<PanelInfo>, onEnter: () => void): () => void;
//# sourceMappingURL=research-navigation.d.ts.map