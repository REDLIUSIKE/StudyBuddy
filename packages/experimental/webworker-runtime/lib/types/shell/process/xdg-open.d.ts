import type { VirtualExecutable } from './virtual-executables.ts';
/** Page-side display of one text file. */
export type TextViewer = (path: string, text: string) => void;
/**
 * Install the page viewer `xdg-open` reports to; the worker host calls this once its tunnel exists.
 * @param next - Viewer that forwards to the page.
 */
export declare function setTextViewer(next: TextViewer): void;
/** Virtual executable replacing the desktop opener with the page's text viewer. */
export declare const XDG_OPEN_EXECUTABLE: VirtualExecutable;
//# sourceMappingURL=xdg-open.d.ts.map