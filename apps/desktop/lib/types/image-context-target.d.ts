/** Resolve only decoded images displayed by the application Chat, its image tab, or its shared lightbox. */
import type { DesktopImageTarget } from '@deepseek-ai/dsh-client-ui-tool';
/** Accepted displayed-image URL families. Filesystem paths are never IPC inputs. */
export declare function validImageSource(src: unknown): src is string;
/** @returns the originating Chat even when its enlarged image is portalled to document.body. */
export declare function imageContextTarget(target: EventTarget | null, document: Document): Omit<DesktopImageTarget, 'x' | 'y'> | undefined;
//# sourceMappingURL=image-context-target.d.ts.map