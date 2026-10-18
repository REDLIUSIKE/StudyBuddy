/** Desktop Office skills and bundled authoring dependencies. */
import type { Context } from '@deepseek-ai/cordis';
/** Loader identity for the application-owned Office composition. */
export declare const name = "desktop-office";
/** Application-selected bundled payload and installation directories. */
export interface Config {
    /** Bundled payload directory. Missing sibling `office-skills` resources fail Host startup. */
    readonly source: string;
    /** Harness-home directory where workspace dependencies are installed. */
    readonly root: string;
    /** Prepared or ASAR-contained application dependency directory. */
    readonly runtimeDir: string;
}
/**
 * Enable offline Office authoring and structural checks in the Desktop profile.
 * @param ctx - Profile scope; child plugins declare their own service requirements.
 * @param config - Bundled payload source and Harness-home installation root.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=office.d.ts.map