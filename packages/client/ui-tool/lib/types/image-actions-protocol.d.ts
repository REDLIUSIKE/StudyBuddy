/** Desktop image actions carry existing URLs and Session identities, never image pixels or credentials. */
export interface DesktopImageTarget {
    readonly sessionId: string;
    readonly src: string;
    readonly name: string;
    readonly x: number;
    readonly y: number;
}
export interface DesktopImageAction {
    readonly action: 'open' | 'attach';
    readonly target: DesktopImageTarget;
}
export interface DesktopImageBridge {
    subscribe(listener: (action: DesktopImageAction) => void): () => void;
}
//# sourceMappingURL=image-actions-protocol.d.ts.map