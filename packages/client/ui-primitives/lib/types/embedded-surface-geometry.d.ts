/** DOM-only geometry for owned native surfaces; CSS coordinates are not device pixels. */
export interface SurfaceProjection {
    bounds: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    visible: boolean;
}
/** Cover mode retains DOM-layered pages under menus; native surfaces keep the concealment default. */
export declare function projectEmbeddedSurface(container: HTMLElement | null, menus?: 'hide' | 'cover'): SurfaceProjection;
/** Observe the container and foreground DOM; dispose disconnects all observers/listeners. */
export declare function observeEmbeddedSurface(container: HTMLElement, listener: (value: SurfaceProjection) => void): () => void;
/** Capture the existing finite, sanitized theme variables without business state. */
export declare function readEmbeddedSurfaceTheme(): {
    mode: 'dark' | 'light';
    variables: Record<string, string>;
};
//# sourceMappingURL=embedded-surface-geometry.d.ts.map