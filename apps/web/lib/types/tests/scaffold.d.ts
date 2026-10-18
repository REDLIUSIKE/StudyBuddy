import type { Page } from 'playwright';
import { Context } from '@deepseek-ai/cordis';
import { type LaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment';
import { type CaptureWorkspaceSnapshotOptions } from '@deepseek-ai/dsh-session-snapshot';
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot';
import type { RetryPolicyConfig } from '@deepseek-ai/dsh-llm';
import type { ReplayProviderConfig } from '@deepseek-ai/dsh-llm-replay';
import { SessionId, type SessionEvent } from '@deepseek-ai/dsh-session';
export declare const WELCOME_NOTICE_SETTINGS_NAMESPACE = "ui-settings-general";
/** The installed bundle carrying the scaffold's deployment defaults; the plugin manager lists it beside fixture bundles. */
export declare const SCAFFOLD_DEFAULTS_BUNDLE = "dsh-web-scaffold-defaults";
export declare const WELCOME_NOTICE_ACK_FIELD = "welcomeNoticeVersion";
export declare const WELCOME_NOTICE_VERSION = "2026-09-28.1";
export declare const WELCOME_NOTICE_COPY: {
    readonly zh: {
        readonly title: "预览版说明";
        readonly body: "DeepSeek Harness 目前的 0.2 版本仍处于预览阶段，还有许多地方需要持续改进和打磨，希望听取广大开发者和用户的反馈建议。现在，新的桌面端面向广泛用户，开发者相关的进阶功能可在配置中开启使用。预计 DeepSeek Harness 的产品功能以及插件 API 都会继续快速迭代、持续演化，并逐渐趋于稳定。\n\n我们期待与全球用户和开发者一起，在开源、可复用、可组合的基础设施之上，共同探索智能上限。欢迎大家用 DeepSeek Harness 将想法变成现实，与社区一起丰富插件生态。";
        readonly continueLabel: "继续";
    };
};
/** Snapshot mode for the lane, from $DSH_SNAPSHOT (same vocabulary as the other snapshot suites). */
export type WebSnapshotMode = 'replay' | 'record' | 'refresh';
/**
 * Resolve and validate the lane's snapshot mode.
 * @returns the active mode; unset/empty selects replay.
 */
export declare function webSnapshotMode(): WebSnapshotMode;
/**
 * Compare a session-driven Web scenario's complete workspace with its committed independent expected state.
 * @param scenarioDir - Absolute recorded-session scenario directory.
 * @param workspaceRoot - Absolute cwd used by the controlled session.
 * @param options - Root entries the scenario owns outside the expected state, such as a `.git` directory it initialized.
 */
export declare function assertFinalWorkspaceSnapshot(scenarioDir: string, workspaceRoot: string, options?: CaptureWorkspaceSnapshotOptions): Promise<void>;
/**
 * Resolve one requested fixture role to its highest committed generation.
 * @param path - any generation path for the requested parent or child role.
 * @param allowAbsent - Keep an absent canonical path only for an override-only replay script.
 * @returns the highest canonical sibling generation, or the input for non-Session files.
 */
export declare function selectedSessionFixture(path: string, allowAbsent?: boolean): Promise<string>;
/**
 * Return the current-writer target without replacing the requested older fixture.
 * @param path - any canonical fixture generation for one role.
 * @param version - generation emitted by the current writer.
 * @returns the canonical sibling path for that role and generation.
 */
export declare function recordedSessionFixturePath(path: string, version: number): string;
/** A booted web scaffold: real composition, mode-selected model backend, temp world. */
export interface WebScaffold {
    /** The active snapshot mode this scaffold booted under. */
    mode: WebSnapshotMode;
    /** Browser-facing origin for the bound test server (the mount root under `publicMount`). */
    baseUrl: string;
    /** Process-token URL that establishes this scaffold's browser session. */
    authenticatedUrl: string;
    /** Settled root context (the in-process readiness barrier; headless event subscription is its sanctioned use). */
    ctx: Context;
    /** Temp project directory sessions run in (shell/fs tool cwd). */
    workspaceCwd: string;
    /** Temp persistence root (seeded sessions land here through the real API). */
    persistenceRoot: string;
    /** Isolated harness home the settings/credentials rows write ($DSH_HOME double). */
    harnessHome: string;
    /** Send a browser-equivalent Host request with this scaffold's authenticated cookie. */
    hostFetch(path: string, init?: RequestInit): Promise<Response>;
    /** Await a settled turn end: in-process turn/end, then the agent's idle flip (which follows the persistence flush). */
    whenTurnSettled(timeoutMs?: number): Promise<SessionId>;
    /**
     * Tear everything down; asserts the replay fixture was fully consumed first
     * (replay/refresh), unless booted with replayProvidersOnly (whose fixture
     * is validated call-free at boot).
     */
    close(): Promise<void>;
}
/** Options for {@link launchWebScaffold}. */
export interface LaunchOptions {
    /** Override the developer-tools preference; omitted uses the shipped default. */
    developerTools?: boolean;
    /** Enable the real Open In rows with deterministic launch-environment facts. */
    openInAppEnvironment?: LaunchEnvironmentSnapshot;
    /** Compare the replayed root Session; `read-only` also forbids refresh writes to a borrowed fixture. */
    compareReplaySession?: boolean | 'read-only';
    /**
     * Optional product overlay applied after the shipped Web surface and before
     * the scaffold's hermetic test patches, matching the launcher's `--patch`
     * ordering.
     */
    extraOverlayPath?: string | readonly string[];
    /**
     * Additional package manifests whose dependency closures supply experimental
     * profile layers named by {@link extraOverlayPath}.
     */
    extraInstallAnchors?: string[];
    /**
     * Manage the scaffold profile the way the launcher does: a `profileContext`
     * over the profile directory, whose manifest lists the shipped web bundles
     * and each package directory here as an installed dependency (`file:` in the
     * manifest, a symlink under the profile's `node_modules`); `enabled` also
     * lists a bundle in `dsh.profile.bundles`. The plugin manager mounts on such
     * a profile, and the root Include is mounted from the profile's own layers.
     * The base bundle's `hmr` row turns on with the profile context, so
     * configuration changes apply live; `hmr: false` disables that row through
     * an overlay, leaving changes for the next start.
     */
    profile?: {
        hmr?: boolean;
        /** Launcher-owned invocation and environment for profile package operations. */
        packageManager?: ProfileContext['packageManager'];
        packages: {
            dir: string;
            enabled?: boolean;
        }[];
        /** Additional selected names, including bundles unavailable after an upgrade. */
        bundles?: readonly string[];
    };
    /**
     * Replay fixture (session.jsonl) served by the inserted dsh-llm-replay row
     * in replay/refresh modes; ignored in record mode (the real adapter
     * answers). Omit for scenarios issuing no model calls — a stray stream then
     * fails loud with NO_ADAPTER (both direct adapters are disabled and no replay row
     * mounts). With {@link replayProvidersOnly}, the fixture must record no
     * model calls (its header alone mounts the catalog).
     */
    replayFixture?: string;
    /** Explicit replay routes for scenarios exercising provider-dependent behavior; replay/refresh only. */
    replayProviders?: ReplayProviderConfig[];
    /**
     * Mount the replay provider catalog (the model directory the UI shows)
     * without consuming any recorded script: for scenarios that never call a
     * model but need the real provider/model labels rendered. Requires
     * {@link replayFixture} whose log records no model calls, and rejects
     * {@link replayOverride} and {@link replayChildFixtures}; the teardown
     * consumption check is skipped for this mode. `replayFixture` without this
     * flag keeps the consumption check.
     */
    replayProvidersOnly?: boolean;
    /**
     * Recorded child logs assigned in child creation order. Each child owns its
     * own positional replay cursor across initial and continuation turns.
     */
    replayChildFixtures?: string[];
    /**
     * Optional replay.override.json sidecar (whole-script replacement or
     * `{ patches }` augmentation) for throw/hang scenarios not expressible as
     * recorded chunks; replay/refresh only.
     */
    replayOverride?: string;
    /**
     * Retry policy registered on every replay provider route, for failure-
     * injection scenarios that must exhaust recovery quickly instead of walking
     * the shared normal default's five backed-off retries; replay/refresh only.
     */
    replayRetryPolicy?: RetryPolicyConfig;
    /** Per-chunk replay pacing (ms) so the browser observes genuinely incremental SSE; replay/refresh only. */
    paceMs?: number;
    /** Synthetic model capacity for UI scenarios whose seeded history must remain uncompacted. */
    replayContextWindow?: number;
    /**
     * Tool presentation mode patched onto the shipped `tools` row (`code`
     * collapses the wire to run_code + the SDK prompt section). Omit for the
     * yml default. The PTC runtime row is always in the tree, so no extra
     * insertion is needed.
     */
    toolsMode?: 'native' | 'ptc';
    /**
     * Keep the shipped DeepSeek adapter mounted while masking the process
     * environment's DEEPSEEK_API_KEY for this scaffold lifetime. This is the
     * keyless first-run configuration lane; the default disables the adapter.
     */
    deepSeekMissingCredential?: boolean;
    /** Leave the current welcome notice pending; ordinary scenarios pre-acknowledge it before browser boot. */
    welcomeNoticePending?: boolean;
    /** Leave first-use Workspace initialization eligible; ordinary scenarios start after the default was removed. */
    firstUse?: boolean;
    /**
     * Patch the shipped DeepSeek search row to a deterministic endpoint and
     * credential reference. Browser search scenarios keep the real provider and
     * credentials seam while avoiding external search traffic and ambient keys.
     */
    deepSeekSearch?: {
        /** Anthropic-compatible base URL; the provider appends `/messages`. */
        baseURL: string;
        /** Credential reference resolved by the shipped search provider. */
        apiKeyEnv: string;
    };
    /** Preset selection default and additional declarative definitions for this scenario. */
    agentPresets?: {
        default: string;
        definitions?: import('@deepseek-ai/dsh-agent-preset-registry').PresetDefinition[];
    };
    /**
     * Patch the telemetry exporter URL while preserving the shipped enabled
     * setting. A scenario-owned loopback collector contains all fixture uploads.
     */
    telemetryUrl?: string;
    /** Mode when telemetryUrl is supplied; defaults to FEEDBACK_ONLY without enabling a disabled row. */
    telemetryMode?: 'FEEDBACK_ONLY';
    /** SDK batch cadence for a scenario-owned collector; omitted to retain the SDK default. */
    telemetryScheduledDelayMillis?: number;
    /**
     * Browse through a trusted non-loopback hostname that the browser resolves
     * to loopback (for example `*.localhost`). The test server stays bound to
     * 127.0.0.1; a non-resolving authority fails before Host trust is exercised.
     */
    remoteAuthority?: string;
    /**
     * Serve the same listener through the private plain-HTTP prefix-stripping
     * proxy in `./prefix-proxy.ts`, which owns the mount, upgrade, and cookie
     * behavior. The proxy authority joins `trustedHosts` because the direct
     * composition grants no trust. The listen socket is unaffected.
     */
    publicMount?: {
        /** Canonical mount prefix (default `tools/dsh/`, normalized to lead and end in `/`). */
        prefix?: string;
    };
    /** Reuse an existing harness home so a second Host can verify user settings across origins. */
    harnessHome?: string;
}
/**
 * Boot the real web composition under the current snapshot mode.
 * @param options - replay fixture selection and pacing.
 * @returns the running scaffold.
 */
export declare function launchWebScaffold(options?: LaunchOptions): Promise<WebScaffold>;
/**
 * Normalize Web-only volatile strings while preserving JSON structure and row framing.
 * @param log - raw Session JSONL.
 * @param workspaceCwd - optional scaffold parent used before a live Session selects its cwd.
 * @returns compact JSONL with run-local strings tokenized.
 */
export declare function normalizeWebSessionVolatiles(log: string, workspaceCwd?: string): string;
/**
 * Record-mode fixture write-back: harvest the live session, scrub the
 * system-prompt text to {{system}} and header tool schemas to {{tools}},
 * tokenize the run-local cwd, redact opaque identities with typed
 * relationship-preserving tokens, and write the fixture.
 * A manifest-retained historical generation makes the write-back a no-op.
 * @param scaffold - the record-mode scaffold.
 * @param sessionId - the driven session.
 * @param fixturePath - the committed session.jsonl target.
 */
export declare function recordFixture(scaffold: WebScaffold, sessionId: SessionId, fixturePath: string): Promise<void>;
/**
 * The user prompts recorded in a fixture, in order — the single source tying
 * spec drive steps to recorded reality so script and fixture cannot drift.
 * @param fixtureText - raw session.jsonl contents.
 * @returns the recorded user prompt texts.
 */
export declare function fixtureUserPrompts(fixtureText: string): string[];
/** Deterministic UUID used when a seed fixture's typed identity token is materialized. */
export declare function fixtureIdentity(kind: 'message' | 'approval' | 'workflow' | 'command' | 'rpc' | 'retry' | 'id', ordinal: number): string;
/**
 * Realize a recorded seed fixture against one scaffold: substitute the
 * `{{sessionId}}`/`{{cwd}}`/`{{harnessHome}}` placeholders and rewrite the
 * recorded cwd to the scaffold's workspace. Idempotent, so a caller may realize early (e.g. to
 * price content exactly as the host will fold it) and still pass the result
 * through {@link seedSession}.
 * @param scaffold - the booted scaffold whose workspace the seed targets.
 * @param fixtureText - the committed seed fixture text.
 * @param id - the session id the seed is realized for.
 * @returns the realized fixture text.
 */
export declare function realizeSeedFixture(scaffold: WebScaffold, fixtureText: string, id: string): string;
/**
 * Parse a committed web seed fixture through the replay reader.
 * Embedded streams retain their recorded timing; V0/V1 chunk streams receive positive relative intervals.
 * @param fixtureText - session JSONL fixture contents.
 * @returns the current header line, parsed header, and logical events.
 */
export declare function parseSeedFixture(fixtureText: string): {
    headerLine: string;
    header: Record<string, unknown>;
    events: SessionEvent[];
};
/**
 * Render logical events as an envelope-free web seed fixture.
 * @param headerLine - original session header line.
 * @param events - logical session events in order.
 * @returns projected session JSONL.
 */
export declare function renderSeedFixture(headerLine: string, events: readonly ({
    readonly seq: number;
    readonly time: number;
} & object)[]): string;
/**
 * Seed a recorded session fixture into the scaffold's persistence root
 * through the real Session and JSONL APIs.
 * @param scaffold - the target scaffold.
 * @param fixtureText - raw recorded session.jsonl contents.
 * @param id - the seeded session id.
 * @param agentPreset - preset recorded by scenarios that assert resumed composition.
 * @param options - deterministic metadata overrides for ordering-sensitive scenarios.
 * @returns the seeded id.
 */
export declare function seedSession(scaffold: WebScaffold, fixtureText: string, id: string, agentPreset?: string, options?: {
    readonly createdAt?: number;
}): Promise<SessionId>;
/**
 * Read one stored session's physical event log through a throwaway read
 * handle. The physical log carries no synthetic closers: a resumed session
 * shows the closers the loop appended durably, and a never-resumed
 * interrupted log stays interrupted.
 * @param scaffold - the booted scaffold whose persistence holds the session.
 * @param id - the stored session to read.
 * @returns the stored events.
 */
export declare function readPersistedEvents(scaffold: WebScaffold, id: SessionId): Promise<readonly SessionEvent[]>;
/**
 * Capture the region's aria snapshot at a settled milestone: poll until two
 * consecutive normalized captures are equal — a single-shot capture races the
 * last React commits. A foreground shell command is a job while it runs, and
 * its removal reaches the browser one coalesced roster frame after the tool
 * result, so by default the capture first waits for the session header's
 * running-job control to leave; a scenario whose milestone is a running job
 * keeps it with `runningJobs: 'keep'`.
 * @param page - the page under test.
 * @param selector - the region locator selector.
 * @param workspaceCwd - normalization input.
 * @param options - `normalizeAge` collapses relative-time buckets to `{{age}}`
 *   for a region whose rows are dated from live wall-clock state;
 *   `replacements` tokenizes scenario-owned values before generic normalization;
 *   `runningJobs` is `'settle'` (default: wait for no running-job control) or `'keep'`.
 * @returns the stable normalized snapshot.
 */
export declare function captureStableAria(page: Page, selector: string, workspaceCwd: string, options?: {
    normalizeAge?: boolean;
    replacements?: readonly (readonly [value: string, token: string])[];
    runningJobs?: 'settle' | 'keep';
}): Promise<string>;
/**
 * Capture stable aria with every eligible Turn process and secondary group expanded,
 * then restore the controls that were closed before the capture.
 * @param page - the page under test.
 * @param selector - the region locator selector.
 * @param workspaceCwd - normalization input.
 * @param options - optional user-visible state to establish before capture.
 * @returns the stable normalized expanded snapshot.
 */
export declare function captureExpandedTurnProcessAria(page: Page, selector: string, workspaceCwd: string, options?: {
    scrollToBottom?: boolean;
}): Promise<string>;
/**
 * Compare a normalized golden, or rewrite it under refresh. Refresh is the
 * ONLY writer: a missing golden in replay mode fails with the healing command
 * instead of silently self-bootstrapping.
 * @param goldenPath - the committed ui.expected.md path.
 * @param actual - the stable normalized snapshot.
 * @param mode - the active snapshot mode.
 */
export declare function compareOrRefreshGolden(goldenPath: string, actual: string, mode: WebSnapshotMode): Promise<void>;
/**
 * Fixture-inventory guard: the scenario directory holds exactly the expected
 * files and every committed JSONL is a header-scrubbed, typed-redaction fixed point.
 * @param dir - the scenario snapshot directory.
 * @param expected - the exact expected file inventory.
 */
export declare function assertFixtureInventory(dir: string, expected: string[]): Promise<void>;
/**
 * Console tripwires: reconnect/gap-repair self-healing or a pageerror must
 * fail the scenario, not mask a dead wire behind eventual consistency.
 */
export interface WebConsoleTripwire {
    /** Console warnings matching reconnect/gap-repair/discontinuity copy. */
    warnings: string[];
    /** Uncaught page errors. */
    pageErrors: string[];
}
/**
 * Collect the {@link WebConsoleTripwire} of one page.
 * @param page - the page under test.
 * @returns live warning/pageerror collectors to assert empty at scenario end.
 */
export declare function watchConsole(page: Page): WebConsoleTripwire;
/**
 * Remove only connection-loss warnings emitted after an intentional reload.
 * Earlier warnings and all gap-repair/discontinuity warnings remain fatal.
 * @param tripwire - the live console-warning collector.
 * @param warningStart - warning count captured immediately before reloading.
 */
export declare function acknowledgeReloadConnectionLoss(tripwire: WebConsoleTripwire, warningStart: number): void;
//# sourceMappingURL=scaffold.d.ts.map