/** Existing image URLs open in a dedicated right-Sidebar resource tab, never an external browser. */
import type { DesktopImageTarget } from '../../image-actions-protocol.ts';
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
export declare const IMAGE_TAB_ID = "studybuddy-conversation-image";
export interface ImageAddress {
    readonly sessionId: string;
    readonly src: string;
    readonly name: string;
}
export declare function imageAddress(target: Pick<DesktopImageTarget, 'sessionId' | 'src' | 'name'>): string;
export declare function parseImageAddress(address: string): ImageAddress | undefined;
export declare function imageDefinition(title: () => string): SidebarRightTabDefinition;
//# sourceMappingURL=definition.d.ts.map