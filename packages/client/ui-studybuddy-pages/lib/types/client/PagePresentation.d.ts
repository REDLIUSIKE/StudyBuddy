/** Retained document presentation with the existing local AIGC stylesheet. */
import { EmbeddedPagePresentation } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PageController, PageTarget } from './page-controller.ts';
/** Keep account fences, geometry and document readiness under one shared owner. */
export declare class PagePresentation extends EmbeddedPagePresentation<PageTarget> {
    constructor(controller: PageController, label: () => string);
}
//# sourceMappingURL=PagePresentation.d.ts.map