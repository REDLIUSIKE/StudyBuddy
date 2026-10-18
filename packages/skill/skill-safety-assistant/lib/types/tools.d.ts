/** Four native operations, without a generic path, shell, downloader URL or approval argument. */
import type { Context } from '@deepseek-ai/cordis';
import './index.ts';
/**
 * Register feature operations in the dedicated preset's native tool scope.
 * @param ctx - Preset-owned tool and safety services; never ordinary global chat configuration.
 */
export declare function registerSkillSafetyTools(ctx: Context): void;
/** Activate the dedicated preset's tool contribution. @param ctx - Scoped preset owner. */
export declare function apply(ctx: Context): void;
export declare const inject: string[];
//# sourceMappingURL=tools.d.ts.map