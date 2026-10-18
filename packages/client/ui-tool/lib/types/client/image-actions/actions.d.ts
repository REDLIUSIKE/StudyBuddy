/** Keyless UI intents; adding an image prepares an ordinary composer draft and never submits it. */
import type { DesktopImageAction } from '../../image-actions-protocol.ts';
export interface ImageActionPorts {
    current(): boolean;
    open(address: string): void;
    fetch(url: string): Promise<Response>;
    add(file: File): boolean;
}
export declare function runImageAction(action: DesktopImageAction, ports: ImageActionPorts): Promise<'opened' | 'added' | 'failed' | 'stale'>;
//# sourceMappingURL=actions.d.ts.map