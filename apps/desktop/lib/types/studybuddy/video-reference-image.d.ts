export interface VideoImageRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface VideoViewerSnapshot {
    projectId: string;
    time: number;
    rect: VideoImageRect;
}
export interface VideoPixelImage {
    isEmpty(): boolean;
    getSize(): {
        width: number;
        height: number;
    };
    crop(rect: VideoImageRect): VideoPixelImage;
    toPNG(): Uint8Array;
}
type Crop = {
    x: number;
    y: number;
    w: number;
    h: number;
};
export type VideoReferenceImagePlan = {
    kind: 'frame';
    url: string;
} | {
    kind: 'viewer';
    snapshot: VideoViewerSnapshot;
    crop?: Crop;
};
/** Accept original Studio image references only within the current project and editor. */
export declare function videoReferenceImagePlan(reference: unknown, projectId: string, editorOrigin: string, viewer?: unknown): VideoReferenceImagePlan | null;
interface ImagePorts {
    current(): boolean;
    snapshot(): Promise<unknown>;
    capture(rect: VideoImageRect): Promise<VideoPixelImage>;
    decode(bytes: Uint8Array): VideoPixelImage;
    fetch(url: string): Promise<Response>;
}
/** Normalize to bounded PNG and discard any capture completed after its viewer changed. */
export declare function materializeVideoReferenceImage(plan: VideoReferenceImagePlan, ports: ImagePorts): Promise<Uint8Array>;
export {};
//# sourceMappingURL=video-reference-image.d.ts.map