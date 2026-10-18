import type { Context } from '@deepseek-ai/cordis';
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import { MEDIA_NS } from '../../generated-images/locale.ts';
import type { ToolCallViewProps } from '../../contract/slots.ts';
/** Rendering does not place binary image/video content in the reasoning model's request. */
export declare function MediaGenerationRow(props: ToolCallViewProps & PropsLocale<typeof MEDIA_NS>): import("react").JSX.Element;
export declare const mediaGenerationToolview: {
    name: string;
    inject: string[];
    apply(ctx: Context): void;
};
//# sourceMappingURL=media-generation-row.d.ts.map