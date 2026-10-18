/**
 * Shared profile boot for every `dsh` surface: resolve the profile, stack its
 * patch layers (bundle layers in `dsh.profile.bundles` order, the profile's
 * own `cordis.patch.yml`, `--patch` overlays, the telemetry switch), mount the
 * tree over the profile's empty root config, and wire fail-loud plus bounded shutdown.
 *
 * App flags are not the launcher's business: the invocation's inner arguments
 * are provided to the tree through `ctx.cmdlineArgs`, where any injected app
 * plugin may read the same immutable snapshot.
 * @module @deepseek-ai/dsh/profile-boot
 */
import { type Context } from '@deepseek-ai/cordis';
import { type ProfileContext, type Profile } from '@deepseek-ai/dsh-app-boot';
import { type LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import { type ProcessShutdown } from './process-shutdown.ts';
/**
 * The home-level user patch layer (`$DSH_HOME/cordis.patch.yml`), applied
 * over every profile's own layer. Resolved per call, not at module load:
 * `$DSH_HOME` may be set by the test or launcher after import.
 * @returns the absolute patch-file path.
 */
export declare function homePatchPath(): string;
/** Absolute path of this dsh installation's package.json (both anchors: src/ and lib/ sit one level under apps/cli). */
export declare const INSTALL_ANCHOR: string;
/** Root config filename inside a profile directory. */
export declare const PROFILE_ROOT_FILENAME = "cordis.yml";
/**
 * Initialize a missing profile from one shipped template. This copies only
 * the template's bundle list; local state from the
 * same-named shipped profile is not read, and no inheritance metadata is
 * persisted. Shipped profile names are reserved, and the target directory is
 * claimed exclusively so existing or concurrent state is never reused.
 * @param name - the new profile name.
 * @param fromDefaultProfile - shipped profile template to copy.
 * @param home - Harness home containing the profile directory.
 * @throws when the template is unknown, the target name is shipped, or the target directory exists.
 */
export declare function initializeProfileFromDefault(name: string, fromDefaultProfile: string, home?: string): void;
/**
 * Load a resolved profile for `name` and (re)write the empty root config. The
 * root is always rewritten: the whole composition is patch layers, and the
 * vendored Loader's tree write-back (a plugin self-disposing persists the
 * current tree) can bake composed rows into this file — which would duplicate
 * every bundle insert on the next boot. The file exists on disk only because
 * the Loader needs a real include root to anchor `baseUrl` at the profile
 * directory (the config dump anchors on the same file, so both compose over
 * the identical base).
 * @param name - the profile name.
 * @param userLayer - `false` skips parsing `cordis.patch.yml` (the default dump).
 * @param fromDefaultProfile - shipped template used once to initialize a missing profile.
 * @returns the loaded profile.
 * @throws when explicit initialization names an unknown template or an existing profile.
 */
export declare function prepareProfile(name: string, userLayer?: boolean, fromDefaultProfile?: string): Profile;
/** An application-owned profile and its independent installation fallback. */
export interface ResolvedProfileRuntime {
    /** Profile already loaded from the application's own directory. */
    profile: Profile;
    /** Absolute package.json path of the application's dsh installation. */
    installAnchor: string;
}
/** Options for {@link runProfile}. */
export interface RunProfileOptions {
    /** This run's frozen environment snapshot, provided before any entry mounts. */
    environment: LaunchEnvironmentSnapshot;
    /** The profile name to boot. */
    profile: string;
    /** Loaded application profile; bypasses named profile initialization when supplied. */
    resolvedProfile?: ResolvedProfileRuntime | undefined;
    /** Shipped template used once to initialize a missing profile. */
    fromDefaultProfile?: string | undefined;
    /** `--patch` overlay paths, in argv order. */
    patchFiles: readonly string[];
    /** The invocation's inner arguments, handed to the tree through `ctx.cmdlineArgs`. */
    args: readonly string[];
    /** Application-owned package runtime, scoped to plugin package operations. */
    packageManager?: ProfileContext['packageManager'];
    /** Application safety observers installed before any profile entry can resume an Agent. */
    prepareContext?(ctx: Context): void | Promise<void>;
}
/**
 * Boot one profile invocation end to end and leave process lifetime to the
 * mounted plugins (or to a one-shot runner the composition mounts).
 * @param options - environment snapshot, profile name, overlays, and the booted app's own arguments.
 * @returns the settled root context and the shutdown controller.
 * @throws after disposing startup resources; cleanup failures retain the original error.
 */
export declare function runProfile(options: RunProfileOptions): Promise<{
    ctx: Context;
    shutdown: ProcessShutdown;
}>;
//# sourceMappingURL=profile-boot.d.ts.map