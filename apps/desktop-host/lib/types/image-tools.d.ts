import type { Context } from '@deepseek-ai/cordis';
import { SessionSeq } from '@deepseek-ai/dsh-session';
export interface NativeImageModel {
    provider: string;
    model: string;
}
export interface NativeImageToolOptions {
    /** Current canonical/published image_in projection; never ambient providers. */
    readonly models: () => readonly NativeImageModel[];
    /** Native source admission, including account, expiry and exact membership. */
    readonly allowed: (provider: string, model: string) => boolean;
}
declare module '@deepseek-ai/dsh-session-projection/types' {
    interface SessionProjectionStateMap {
        /** Current user/tool message sequences; references stay in the existing Session messages. */
        studybuddyImageNodes: SessionSeq[];
    }
}
/** Owns the tool schemas and Host intake hook, without changing the calling model. */
export declare class NativeImageTools {
    private readonly options;
    private readonly claimedReferences;
    constructor(ctx: Context, options: NativeImageToolOptions);
    private choices;
    private actor;
    private install;
    private analyze;
}
//# sourceMappingURL=image-tools.d.ts.map