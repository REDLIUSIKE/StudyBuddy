/** Account-scoped page controller shared with the research workbench. */
import { EmbeddedPageController } from '@deepseek-ai/dsh-client-ui-primitives';
import type { EmbeddedPageHost, EmbeddedPageSnapshot } from '@deepseek-ai/dsh-client-ui-primitives';
export type PageTarget = 'zhilian' | 'skills' | 'aigc' | 'research';
export type PageHost = EmbeddedPageHost<PageTarget>;
export type PageSnapshot = EmbeddedPageSnapshot;
/** Preserve the existing page API over the shared lifecycle owner. */
export declare class PageController extends EmbeddedPageController<PageTarget> {
}
//# sourceMappingURL=page-controller.d.ts.map