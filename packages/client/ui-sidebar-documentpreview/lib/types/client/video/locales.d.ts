/** Video preview labels shared by the renderer and selector. */
export declare const zh: {
    title: string;
    preview: string;
    loading: string;
    failed: string;
};
export type VideoPreviewKey = keyof typeof zh;
export declare const en: {
    title: string;
    preview: string;
    loading: string;
    failed: string;
};
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        sidebarVideo: VideoPreviewKey;
    }
}
//# sourceMappingURL=locales.d.ts.map