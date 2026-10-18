/** Builtin streamed video renderer on the standard document extension point. */
import type { Context } from '@deepseek-ai/cordis';
import type { DocumentPreviewDefinition } from '../document/registry.ts';
export declare const VIDEO_BODY_ID = "@deepseek-ai/dsh-client-ui-sidebar-documentpreview/video";
/** Describe playable video suffixes; the browser reports unsupported encodings without text fallback. */
export declare function videoBodyDefinition(title: () => string): DocumentPreviewDefinition;
/** Register the video dictionary, selector and body with their owning plugin lifetime. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map