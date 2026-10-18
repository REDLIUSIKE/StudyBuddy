/** React-free stable snapshots, shared by every registration owned by this plugin. */
import type { OwnedScope } from '@studybuddy/contracts';
export declare const sameScope: (a: OwnedScope | null, b: OwnedScope | null) => boolean;
export declare const errorCode: (error: unknown) => string;
export declare class ObservableState<T> {
    #private;
    protected snapshot: T;
    constructor(snapshot: T);
    getSnapshot: () => T;
    subscribe: (listener: () => void) => (() => void);
    protected publish(snapshot: T): void;
    dispose(): void;
}
//# sourceMappingURL=observable.d.ts.map