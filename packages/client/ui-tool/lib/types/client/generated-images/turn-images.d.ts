import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ConversationNodeDefinition } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { type MediaTaskModel } from '../tool/models/media-generation-model.ts';
interface RecordedImage {
    readonly seq: number;
    readonly task: MediaTaskModel;
}
interface ImagesTurnData {
    readonly images: readonly RecordedImage[];
}
interface ImagesState extends ImagesTurnData {
    readonly turn: number;
    readonly calls: ReadonlySet<string>;
}
declare module '@deepseek-ai/dsh-client-ui-conversation/client' {
    interface ConversationTurnDataMap {
        /** Keyless image tasks returned by supported tools in this Turn. */
        'studybuddy-images': ImagesTurnData;
    }
}
/** Accumulate only supported, successful image results using the existing Turn identity. */
export declare const imagesDefinition: ConversationNodeDefinition<ImagesState>;
/** Select completed images absent from the closing prose, retaining exact Session authorization.
 * @param owner - completed Turn and closing-reply sequence.
 * @param sessionId - viewed Session, never taken from model prose.
 * @param base - application origin used only to recognize an existing owned Markdown preview.
 * @returns unique images for the reply's visible result area.
 */
export declare function imagesForClosing(owner: TurnTailOwnerProps, sessionId: string, base: string): readonly MediaTaskModel[];
export {};
//# sourceMappingURL=turn-images.d.ts.map