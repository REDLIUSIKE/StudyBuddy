/** Video preview labels shared by the renderer and selector. */
export const zh = {
  title: '视频', preview: '视频预览：{name}', loading: '正在加载视频…', failed: '视频无法播放，请重试或在外部打开。',
} satisfies Record<string, string>
export type VideoPreviewKey = keyof typeof zh
export const en = {
  title: 'Video', preview: 'Video preview: {name}', loading: 'Loading video…', failed: 'This video could not be played. Retry or open it externally.',
} satisfies Record<VideoPreviewKey, string>
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { sidebarVideo: VideoPreviewKey }
}
