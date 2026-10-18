/** Retained document presentation with the existing local AIGC stylesheet. */
import { EmbeddedPagePresentation } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PageController, PageTarget } from './page-controller.ts'
import aigcSurface from './aigc-surface.css?inline'
/** Keep account fences, geometry and document readiness under one shared owner. */
export class PagePresentation extends EmbeddedPagePresentation<PageTarget> {
  constructor(controller: PageController, label: () => string) { super(controller, label, controller.target === 'aigc' ? aigcSurface : undefined) }
}
