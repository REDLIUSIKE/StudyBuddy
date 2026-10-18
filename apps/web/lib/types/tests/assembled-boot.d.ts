import { type AssembledRemote, type AssembledRemoteOptions } from './assembled-remote.ts';
interface AssembledBootOptions {
    /** Package ids omitted from this mounted composition. */
    readonly exclude?: readonly string[];
    /** Remote answers owned by this assembled case. */
    readonly remote?: AssembledRemoteOptions;
}
/**
 * Register the per-test jsdom setup and teardown the assembled boot needs:
 * English pinned before boot so role/text locators stay deterministic across
 * localized component migrations (the newEnglishPage e2e convention), the
 * observers, font events, and frame callbacks jsdom lacks, and a full reset of the document,
 * the boot globals, and the injected plugin styles afterwards.
 */
export declare function installAssembledBootEnv(): void;
/**
 * Mount the assembled application on an isolated RemoteMock transport; the teardown
 * registered by installAssembledBootEnv disposes it.
 * @param options - composition changes applied to this mount.
 * @returns the test-owned RemoteMock world.
 */
export declare function mountAssembledApp(options?: AssembledBootOptions): AssembledRemote;
/**
 * Create a fixture Session through the sidebar and wait for its own composer to mount.
 * @param remote - fixture transport returned by mountAssembledApp.
 * @returns composer inside the Session named by this creation's reply.
 */
export declare function createAssembledSessionComposer(remote: AssembledRemote): Promise<HTMLElement>;
/**
 * Match a CSS-module class by its logical name.
 * Module class names carry a per-build hash in one of two schemes —
 * ui-primitives emits `_<name>_<hash>` (name bounded by underscores),
 * feature bundles emit `<hash>_<name>` (name at the end) — and a longer name
 * containing this one must not match (`line` must not hit `lineNumber`).
 * @param el - element whose class list is inspected.
 * @param name - logical (unhashed) module class name.
 * @returns whether the element carries that module class.
 */
export declare function hasClass(el: Element, name: string): boolean;
/**
 * Whether this run rewrites its golden instead of comparing against it, set by
 * the snapshot gate's `DSH_SNAPSHOT` mode (`record` re-runs the scenarios from
 * scratch, `refresh` re-derives the expected text from the existing ones).
 */
export declare const REFRESHING_GOLDEN: boolean;
export {};
//# sourceMappingURL=assembled-boot.d.ts.map