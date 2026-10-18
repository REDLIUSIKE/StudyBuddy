import type { Context } from '@deepseek-ai/cordis';
import type { StudyBuddySearchPort } from './provider.ts';
export * from './provider.ts';
export declare const name = "web-search-studybuddy";
export declare const inject: string[];
declare module '@deepseek-ai/cordis' {
    interface Context {
        studybuddySearch: StudyBuddySearchPort;
    }
}
/** Register once through the product profile, with an effect-scoped disposer. */
export declare function apply(ctx: Context): void;
export * from './wire.ts';
//# sourceMappingURL=index.d.ts.map