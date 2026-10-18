import { BrowserWindow } from 'electron';
import type { StudyBuddyAuthState } from './types.ts';
export declare class StudyBuddyAuthorizationWindow {
    #private;
    private readonly parent;
    private readonly dismissed;
    constructor(parent: () => BrowserWindow | undefined, dismissed: () => void);
    open(value: string): Promise<void>;
    focus(): void;
    synchronize(state: StudyBuddyAuthState): void;
    close(): void;
}
//# sourceMappingURL=authorization-window.d.ts.map