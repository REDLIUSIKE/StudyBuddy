/** StudyBuddy account-management contribution to the Harness slot composition. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type MyAiTab } from './view-store.ts';
import { type AccountLocaleKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        'studybuddy.account': AccountLocaleKey;
    }
    interface SlotMap {
        'studybuddy.my-ai.leaderboard': {
            kind: 'single';
            scope: 'root';
            owner: Record<never, never>;
        };
    }
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        studybuddyMyAi: {
            open(tab: MyAiTab): void;
        };
    }
}
/** Required framework seats, navigation, locale and theme services. */
export declare const inject: string[];
/** Cadence for authoritative account reads while the client is visible. */
export interface Config {
    balanceRefreshIntervalMs: number;
}
/** Validated balance refresh cadence in milliseconds. */
export declare const Config: z<Config>;
/** Own the panel and shared wallet.
 * @param ctx Client plugin context.
 * @param config Validated visible-window refresh cadence. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map