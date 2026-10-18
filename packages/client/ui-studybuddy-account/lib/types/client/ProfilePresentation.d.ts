/** Native guest presentation retained across tabs; foreground overlays always win. */
import type { EmbeddedTheme } from '@studybuddy/contracts';
import type { ProfileController } from './profile-controller.ts';
export declare class ProfilePresentation {
    #private;
    private readonly controller;
    constructor(controller: ProfileController);
    attach: (container: HTMLElement) => (() => void);
    private syncLease;
    private createGuest;
    theme: () => EmbeddedTheme;
    private queue;
    private place;
    private removeGuest;
    dispose(): void;
}
//# sourceMappingURL=ProfilePresentation.d.ts.map