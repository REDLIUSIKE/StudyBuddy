import type { Context } from '@deepseek-ai/cordis';
import type { PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { ToolCallViewProps } from '../../contract/slots.ts';
import { CONVERSATION_NS } from '../../locale.ts';
import { MEDIA_NS } from '../../generated-images/locale.ts';
export declare function CreativeProjectRow(props: ToolCallViewProps & PropsLocale<typeof CONVERSATION_NS> & {
    projectT: TranslateNS<typeof MEDIA_NS>;
}): import("react").JSX.Element;
export declare const creativeProjectToolview: {
    name: string;
    inject: string[];
    apply(ctx: Context): void;
};
//# sourceMappingURL=creative-project-row.d.ts.map