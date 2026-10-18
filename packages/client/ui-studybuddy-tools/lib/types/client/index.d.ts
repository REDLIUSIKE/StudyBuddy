import type { Context } from '@deepseek-ai/cordis';
import { ToolCenterController } from './tool-center-controller.ts';
import { type ToolLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'studybuddy.tools': ToolLocaleKey;
    }
}
export interface ToolFace {
    laboratory?: boolean;
    hooks: {
        tools: ToolCenterController;
    };
    desktop: boolean;
    attach(container: HTMLElement): () => void;
    retry(): Promise<void>;
}
export declare const inject: string[];
/** Register through the owning declarations; disposing awaits native presentation quiescence. */
export declare function apply(ctx: Context): void;
//# sourceMappingURL=index.d.ts.map