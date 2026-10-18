/** Copy owned by the generated-image result below a completed reply. */
export declare const MEDIA_NS = "studybuddy-media";
export declare const en: {
    readonly 'image.alt': "Generated image";
    readonly 'image.actionFailed': "Unable to add this image. Try again when the chat is ready.";
    readonly 'image.open': "View generated image";
    readonly 'image.download': "Download image";
    readonly 'image.failed': "Image preview unavailable";
    readonly 'image.retry': "Retry";
    readonly 'image.close': "Close image";
    readonly 'tool.image': "Generate image";
    readonly 'tool.video': "Generate video";
    readonly 'tool.status': "Generation progress";
    readonly 'tool.media': "Media generation";
    readonly 'task.queued': "Waiting to generate";
    readonly 'task.in_progress': "Generating";
    readonly 'task.completed': "Completed";
    readonly 'task.failed': "Generation failed";
    readonly 'task.unknown': "Result unconfirmed; check the original request";
    readonly 'task.incomplete': "Generation incomplete; check the original request";
    readonly 'task.processing': "Processing";
    readonly 'task.queryFailed': "Unable to check the result. Reopen this conversation later.";
    readonly 'image.loadFailed': "Unable to load the image. Reopen this conversation.";
    readonly 'video.loadFailed': "Unable to load the video. Reopen this conversation.";
    readonly 'video.download': "Download video";
    readonly 'project.open': "Open project";
    readonly 'project.opening': "Opening…";
    readonly 'project.unavailable': "Project unavailable. Reattach it in this conversation.";
};
export type MediaKey = keyof typeof en;
export declare const zh: Record<MediaKey, string>;
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Saved generated-image previews and actions. */
        'studybuddy-media': MediaKey;
    }
}
//# sourceMappingURL=locale.d.ts.map