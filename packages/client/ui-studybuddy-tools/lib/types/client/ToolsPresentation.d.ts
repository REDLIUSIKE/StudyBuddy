import { readEmbeddedSurfaceTheme } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ToolCenterController } from './tool-center-controller.ts';
/** One attach lifetime; foreground overlays hide the native surface, never cancel installs. */
export declare class ToolsPresentation {
    #private;
    private readonly controller;
    constructor(controller: ToolCenterController);
    attach: (container: HTMLElement) => (() => void);
    theme: typeof readEmbeddedSurfaceTheme;
    dispose(): void;
}
//# sourceMappingURL=ToolsPresentation.d.ts.map