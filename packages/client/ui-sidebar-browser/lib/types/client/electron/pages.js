import { ElectronWebViewImpl } from "./ElectronWebViewImpl.js";
import { ElectronWebviewPresentation } from "./ElectronWebviewPresentation.js";
/**
 * Assemble an idle Electron provider; guest creation waits for mounting and navigation.
 * @param options - checkpoint and source-tab callbacks.
 * @param bridge - desktop-only transport.
 * @param workspace - storage account resolver.
 * @returns separate navigation and presentation faces.
 */
export function createElectronPage(options, bridge, workspace) {
    const presentation = new ElectronWebviewPresentation({
        mounted: () => { frame.attach(); },
        unmounted: () => { frame.detach(); },
    });
    const frame = new ElectronWebViewImpl(options, bridge, workspace, presentation);
    return { frame, presentation };
}
//# sourceMappingURL=pages.js.map