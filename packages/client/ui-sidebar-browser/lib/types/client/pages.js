import { IframeImpl } from "./browser/IframeImpl.js";
import { IframePresentation } from "./view/IframePresentation.js";
/**
 * Assemble an idle iframe provider and its DOM presentation.
 * @param options - saved navigation and callbacks.
 * @returns the Web page's navigation and presentation objects.
 */
export function createIframePage(options) {
    const presentation = new IframePresentation({
        loaded: (revision) => { frame.handleLoaded(revision); },
        failed: (revision) => { frame.handleLoadFailed(revision); },
        remounted: () => { frame.reload(); },
    });
    const frame = new IframeImpl(options, presentation);
    return { frame, presentation };
}
//# sourceMappingURL=pages.js.map