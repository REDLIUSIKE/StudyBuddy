/**
 * jsdom slot test runtime: a real small runtime — Cordis `Context`, the
 * renderer-owned `SlotRegistry`, the `ui-session` adapter, and the UI renderer — assembled around
 * test-owned session/workspace doubles and a fail-loud file-upload stub, so feature specs exercise
 * declaration, registration, scope, store, inject, rendering, updates, and
 * disposal without hand-building the machinery per suite.
 *
 * Not part of the product plugin graph (no `dsh.client`); feature packages
 * depend on it in devDependencies only. It copies no SlotCore/renderer/store
 * machinery — everything mounts the production implementations.
 * @module @deepseek-ai/dsh-client-test-runtime
 */
import { Context } from '@deepseek-ai/cordis';
import type { Fiber, Plugin } from '@deepseek-ai/cordis';
import type { RenderResult } from '@testing-library/react';
import type { queries } from '@testing-library/dom';
import type { BoundFunctions } from '@testing-library/dom';
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client';
import type { ChildrenDecl, ComposedProps, HostObservable, OwnerOf, RenderOpts, SlotComponent, SlotMap, SlotRenderer, SlotFactoryMap, SnapshotSelectorHook, StoredFactory, StoreInstanceLike } from '@deepseek-ai/dsh-client-ui-slots';
import { TestRemote } from './remote.ts';
import { TestSessions } from './sessions.ts';
import { TestWorkspaces } from './workspaces.ts';
import type { Stabilizer } from './fixtures.ts';
export type { UseSession } from '@deepseek-ai/dsh-client-ui-session/client';
export { domSnapshotSerializer, registerDomSnapshotSerializer } from './snapshot.ts';
export { FixtureSession, TestSessions } from './sessions.ts';
export { stubConfigForm } from './config-form.ts';
export type { StubConfigForm } from './config-form.ts';
export { TestWorkspaces } from './workspaces.ts';
export { RemoteError, TestRemote } from './remote.ts';
export { chatSnapshot, conversationSnapshot, sessionSnapshot, workspaceSnapshot, } from './fixtures.ts';
export type { FixtureSnapshot, SessionBehaviorOverrides, SessionFixture, SessionFixtureSnapshot, Stabilizer, } from './fixtures.ts';
export { makeTranslate } from './translate.ts';
export { usePinnedBrowserLanguages } from './locale-env.ts';
/**
 * Bind an observable source to the production renderer's selector hook.
 * @param source - Observable snapshot source.
 * @returns Typed React selector hook.
 */
export declare function bindSnapshotSelector<T>(source: HostObservable<T>): SnapshotSelectorHook<T>;
/**
 * Create the production slot renderer used by client feature tests.
 * @returns Slot renderer instance.
 */
export declare function createSlotRenderer(): SlotRenderer;
/** Per-view render options; the caller owns the explicitly supplied Session reference. */
export interface SlotTestRenderOptions extends RenderOpts {
    readonly session?: SessionReference | undefined;
}
/**
 * One rendered slot's local view, from {@link SlotTestRuntime.renderSlot}:
 * the renderer's own `[data-slot]` outlet anchor is the snapshot root
 * (`expect(view.container).toMatchSnapshot()` captures exactly this slot's
 * output), Testing Library queries are bound inside it, and `update`
 * re-renders with new owner props.
 */
export interface SlotView<K extends keyof SlotMap & string> {
    /** The renderer's `<div data-slot="<key>">` anchor around the slot's rendered output. */
    readonly container: HTMLElement;
    /** Testing Library queries scoped to {@link SlotView.container}. */
    readonly view: BoundFunctions<typeof queries>;
    /**
     * Replace the owner props and flush the re-render (the render-site update:
     * in production the owner recomputes the share and React re-renders).
     * @param owner - the next owner props share.
     * @param opts - replacement render options and borrowed reference; omission keeps this view's options.
     */
    update(owner: OwnerOf<K>, opts?: SlotTestRenderOptions): void;
}
/**
 * Mounted feature plugin handle: the live fiber plus an act-wrapped,
 * idempotent dispose (unload cascade: entries, declared child slots, store
 * instances, and provided services all fall together).
 */
export interface FeatureHandle {
    /** The plugin's live Cordis fiber (state assertions, escape hatch). */
    readonly fiber: Fiber;
    /**
     * Dispose the plugin fiber inside React act; repeated calls no-op.
     * @returns completion of the unload cascade.
     */
    dispose(): Promise<void>;
}
/** Mutable fail-loud file-upload stub installed by {@link SlotTestRuntime}. */
export interface TestFileUpload {
    /** Test-supplied upload behavior; the default rejects every call. */
    upload: (sessionId: SessionId, ...args: unknown[]) => Promise<unknown>;
}
/**
 * The test-owned 'root' occupant: declares the child slots a suite needs
 * through the REAL `slots.register`, with a caller-supplied minimal frame —
 * the runtime never guesses a feature's page structure.
 */
export declare class TestRoot {
    private readonly slots;
    private readonly stabilize;
    private disposeEntry;
    /**
     * @param slots - the runtime SlotRegistry.
     * @param stabilize - the owning runtime's act wrapper.
     */
    constructor(slots: SlotRegistry, stabilize: Stabilizer);
    /**
     * Register the root frame, declaring (and thereby claiming) the child
     * slots. One declaration per runtime — a second call fails loud in the
     * core ('root' is a single slot).
     * @param children - child-slot declaration table (declaration + render authorization + runtime spec).
     * @param frame - minimal frame component; its props derive from the declared keys (composed-props contract).
     * @returns completion of the act-wrapped registration.
     */
    declare<const D extends ChildrenDecl>(children: D, frame: SlotComponent<ComposedProps<'root', never, keyof NoInfer<D> & keyof SlotMap & string, undefined, object>>): Promise<void>;
    /** Remove the root registration and collapse its declarations (runtime dispose path). */
    release(): void;
}
/**
 * The assembled test runtime. Obtain via {@link SlotTestRuntime.create};
 * dispose with {@link SlotTestRuntime.dispose} (afterEach). Public mutators
 * are act-wrapped throughout — tests never handle SlotCore microtask
 * batching or React act themselves.
 */
export declare class SlotTestRuntime {
    /** The runtime's Cordis root for owner APIs and explicit test-only services. */
    readonly ctx: Context;
    /** The production SlotRegistry mounted on {@link SlotTestRuntime.ctx}. */
    readonly slots: SlotRegistry;
    /** The test-owned 'root' occupant. */
    readonly root: TestRoot;
    /** Fixture catalog, explicit references, scoped contexts, and behavior faces. */
    readonly sessions: TestSessions;
    /** One Remote double shared by every feature mounted in this runtime. */
    readonly remote: TestRemote;
    /** Workspaces double (list observable, recorded intent actions). */
    readonly workspaces: TestWorkspaces;
    /** Test-owned panel selection used by the framework's usePanelInfo hook. */
    readonly panelInfo: import("@deepseek-ai/dsh-client-store").SnapshotStore<PanelInfo>;
    /** Mutable file-upload stub; replace `upload` in suites that exercise the capability. */
    readonly fileUpload: TestFileUpload;
    private readonly stabilizer;
    private host;
    private readonly views;
    private readonly handles;
    private disposed;
    /** Auto-frame state ({@link SlotTestRuntime.declare} / {@link SlotTestRuntime.renderSlot}). */
    private readonly ownerCell;
    private readonly autoDeclared;
    private autoRootView;
    private readonly disposeWorkspaceSource;
    private readonly disposePanelInfoSource;
    private constructor();
    /**
     * Assemble a runtime: real Context, mounted SlotRegistry, installed
     * renderer, and the session/workspace doubles provided as services.
     * @returns the ready runtime.
     */
    static create(): Promise<SlotTestRuntime>;
    /**
     * Mount a feature plugin on a real fiber. Required services are prechecked
     * so a missing provider fails loud instead of suspending the fiber forever
     * (deliberate load-order suspension tests use `ctx.plugin` directly).
     * @param plugin - plugin value (function, class, or `{ inject, apply }` object).
     * @returns handle owning the fiber's explicit disposal.
     */
    mount(plugin: Plugin): Promise<FeatureHandle>;
    /** Release the default Workspace hook before mounting its production owner. */
    releaseWorkspaceSource(): void;
    /** Release the default panel hook before mounting the production Layout owner. */
    releasePanelInfoSource(): void;
    /**
     * Render the root slot tree through the ctx-level entry (the shell's own
     * entry point): `ctx.slots.renderSlot('root', {})` under Testing Library.
     * @returns the Testing Library view.
     */
    renderRoot(): RenderResult;
    /**
     * Declare child slots under an auto-generated root frame — the single-slot
     * mounting path for local DOM snapshots. Each key later supplied through
     * {@link SlotTestRuntime.renderSlot} renders inside the renderer's own
     * `<div data-slot="<key>">` outlet anchor (the snapshot root — the frame
     * adds no wrapper of its own). Mutually exclusive with
     * {@link TestRoot.declare} ('root' is a single slot); one call per runtime.
     * @param children - child-slot declaration table (same contract as TestRoot.declare).
     * @returns completion of the act-wrapped registration.
     */
    declare(children: ChildrenDecl): Promise<void>;
    /**
     * Render one declared slot with its owner props and return the local view.
     * The whole root tree mounts through the production assembly path
     * (renderer, scope providers, store axis); only this key's output lands in
     * the returned container. Call again with another key to view a sibling
     * slot of the same tree.
     * @param key - a key declared through {@link SlotTestRuntime.declare}.
     * @param owner - owner props share for the render site.
     * @param opts - explicit entry selection and borrowed Session reference; retained by view updates.
     * @returns the slot-local view (snapshot container, scoped queries, owner updates).
     */
    renderSlot<K extends keyof SlotMap & string>(key: K, owner: OwnerOf<K>, opts?: SlotTestRenderOptions): SlotView<K>;
    /**
     * Resolve the store instance the renderer would hand a slot's component
     * (identity assertions, action-driven writes). Requires a prior
     * {@link SlotTestRuntime.renderRoot} — the host face exists only inside the
     * installed renderer, exactly as in production.
     * @param key - slot key whose first entry declares the store.
     * @param session - retained Session reference for session-scope slots; omit for root scope.
     * @returns the live store instance.
     */
    storeOf(key: keyof SlotMap & string, session?: SessionReference): StoreInstanceLike;
    /**
     * Read one registered Factory definition for direct contract assertions.
     * @param name - registered Factory name.
     * @returns the live Factory definition.
     */
    factoryOf(name: keyof SlotFactoryMap & string): StoredFactory;
    /**
     * Flush pending ledger/store notifications inside act — for mutations made
     * outside the runtime's own methods (e.g. a direct `slots.register`).
     * @returns completion of the act pass.
     */
    flush(): Promise<void>;
    /**
     * Tear down: unmount React trees first, then dispose feature fibers, the
     * root registration and standard sources, minted session scopes, and persisted test state.
     * Idempotent.
     * @returns completion of the teardown.
     */
    dispose(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map