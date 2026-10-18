import type { InputState, InsertTextRequest } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { VideoReference } from './video-controller.ts';
export interface VideoDraftPort {
    state: {
        getSnapshot(): Pick<InputState, 'draft' | 'draftRev'>;
    };
    insert(request: InsertTextRequest): boolean;
}
/** Retry acknowledgement without inserting the same reference into a draft twice. */
export declare class VideoReferenceImporter {
    private readonly applied;
    insert(input: VideoDraftPort, reference: VideoReference): boolean;
    clear(): void;
}
//# sourceMappingURL=video-reference.d.ts.map