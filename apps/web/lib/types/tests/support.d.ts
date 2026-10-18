import type { Browser, Locator, Page } from 'playwright';
import { type MockInstance } from 'vitest';
/** The built page under test; `pnpm run test:web` rebuilds it before running. */
export declare const DIST_INDEX: string;
export declare const REPO_ROOT: string;
/**
 * The built copy of a workspace package, as the dsh installation resolves it.
 * The Host plugins a scaffold profile loads run from built packages through
 * Node's own loader; a scaffold call that must share their module state
 * (app-boot keeps the root Include it mounted per context) has to run that
 * same copy, not the source a bare import gets through the tsconfig paths,
 * and not the test runner's own inlined copy of the built file either.
 * `require` of an ES module goes through Node's loader and shares its
 * module map with the plugins' imports; it needs a graph without top-level
 * await, which the built Host packages keep.
 * @param name - the workspace package name.
 * @returns the package's built module namespace, for the caller to type as the package's own.
 */
export declare function requireBuilt(name: string): unknown;
/**
 * Browser language a page must advertise to boot into the product's Chinese
 * surface: with no stored preference the client derives its initial locale
 * from the browser, and Playwright's default browser asks for English.
 */
export declare const ZH_BROWSER_LOCALE = "zh-CN";
/** Same-day anchor for seeded event times and the Asia/Shanghai browser clock. */
export declare const WEB_FIXTURE_TIME: number;
/**
 * Budget for a plugin-manager switch to republish its state after a click: the
 * click starts a Host profile write, and the store's follow-up `load()` re-reads
 * its inventory before the switch shows the new value. That chain measured
 * 0.5-0.8 s on an idle host and 2.0-4.8 s across 32 samples in a 16-worker lane,
 * so Vitest's 1-second `expect.poll` default expires first.
 */
export declare const PLUGIN_TOGGLE_SETTLE_MS = 10000;
/**
 * Pin the Host clock to the shared fixture day for one scenario suite.
 *
 * A rendered message clock gains a `clock.md` / `clock.ymd` date prefix as soon
 * as the message's local day differs from the renderer's, so a scenario whose
 * message times are stamped by the Host wall clock — a live composer send, or a
 * seed anchored from `Date.now()` — renders a different aria line once the run
 * spans `Asia/Shanghai` midnight. Reading the fixture day on both clocks makes
 * that calendar fact part of the scenario rather than of the run.
 *
 * The pinned clock advances with real elapsed time, so turn deadlines, session
 * ordering, and durations keep running.
 * @returns the installed `Date.now` spy, restored by the caller in teardown.
 */
export declare function pinHostClock(): MockInstance<typeof Date.now>;
/**
 * Pin a scenario page's clock to the shared fixture day, advancing with real
 * time. Pair it with {@link pinHostClock} for a scenario that stamps its own
 * message times, and with `seedSession`'s `createdAt` for a seeded one.
 *
 * The frozen instant is re-applied from the anchor on an interval rather than
 * left at one value, because product logic reads two `Date.now()` values to
 * decide a minimum display hold or a deadline window; a permanently frozen
 * clock stops supplying elapsed time, so a title that owes its golden settled
 * text keeps rendering its previous one. Both clocks therefore advance at the
 * real rate and stay within one step of each other.
 * @param page - page whose clock is pinned.
 * @returns the disposer that stops re-pinning; call it in teardown.
 */
export declare function pinBrowserClock(page: Page): Promise<() => void>;
/**
 * Open the standard browser-test page advertising English before client boot.
 * This keeps role locators and goldens deterministic while leaving the Host
 * settings document free to override the provisional browser-derived locale;
 * scenarios asserting the Chinese surface advertise
 * {@link ZH_BROWSER_LOCALE} instead. The context uses Asia/Shanghai to preserve
 * the recorded Web user-source timezone independently of the host timezone.
 * @param browser - Playwright browser owning the page.
 * @param height - Viewport height; width is fixed to the lane baseline.
 * @returns the initialized page.
 */
export declare function newEnglishPage(browser: Browser, height?: number): Promise<Page>;
/**
 * Scroll a locator whose rendered element can be replaced during layout.
 * @param target - locator resolved again when its previous element detached.
 */
export declare function scrollIntoView(target: Locator): Promise<void>;
/**
 * Expand every eligible Turn process and secondary group so a Tool-focused
 * scenario can exercise the original row contract beneath product-default
 * compact Chat presentation.
 * @param page - page containing the Chat view.
 */
export declare function expandTurnProcesses(page: Page): Promise<void>;
/**
 * Expand the settled Turn process and secondary group containing a hidden descendant.
 * @param page - page containing the Chat view.
 * @param target - descendant whose outer process disclosures should open.
 */
export declare function expandOwningTurnProcess(page: Page, target: Locator): Promise<void>;
/** Fail loud on a stale checkout instead of testing yesterday's bundle. */
export declare function requireDist(): void;
/** OS-assigned free port, released before use (the spawned `dsh web` needs a concrete --port). */
export declare function probeFreePort(): Promise<number>;
/**
 * Drive the hero's workspace picker through the composed directory dialog
 * until the live composer unlocks. A fresh world has no Workspace, so the boot
 * lands in the Workspace-trigger view state (startup auto-selection has nothing to
 * select); every scenario that types into the composer must connect one
 * first. With nothing to list, activating the composer surface raises the dialog directly —
 * adding a workspace is the picker's only entry. The directory is staged here
 * and adopted through the path editor, which is idempotent across the repeated
 * connects a scenario may make; creating a folder from inside the dialog (the
 * product's other half of the same route) is covered by
 * workspace-management.e2e.ts. The default name 'workspace' keeps the session
 * header cwd at <root>/workspace, the materialization proof several scenarios
 * assert.
 * @param page - the page under test.
 * @param root - host directory the workspace folder is staged in (the scaffold's `workspaceCwd`).
 * @param name - folder name staged and adopted as the workspace.
 */
export declare function connectFreshWorkspace(page: Page, root: string, name?: string): Promise<void>;
/**
 * {@link connectFreshWorkspace} over a page that advertises
 * {@link ZH_BROWSER_LOCALE}: the English helper's anchors assume the locale
 * most other scenarios boot, so a scenario that deliberately keeps zh needs
 * the localized picker copy.
 * @param page - the browser page under test.
 * @param root - workspace parent directory.
 * @param name - directory created under `root` and connected.
 * @param modelAvailable - require an editable composer when the selected model is available.
 */
export declare function connectFreshWorkspaceZh(page: Page, root: string, name?: string, modelAvailable?: boolean): Promise<void>;
/**
 * Replace the composer draft through per-key gestures. `fill()` issues
 * select-all and insertText inside one task; directly after a trigger-menu or
 * chip interaction Lexical's internal selection has not yet absorbed the DOM
 * selection, and the batched edit lands on a null selection and is silently
 * dropped, leaving the previous draft in place. Real keystrokes leave room for
 * `selectionchange` between keys, which is also what a user's typing does.
 *
 * Waits for the surface to be editable first. While the input machine is
 * adjudicating or submitting a send — and in every locked state (removed
 * session, no workspace, an owner block) — the composer renders read-only
 * with `contenteditable="false"` on the same element. `fill()` throws
 * immediately on that element, and `isEnabled()` reports `true` for a
 * `<div>` regardless of the attribute — so a gesture directly after a
 * submit must gate on the attribute, not on enablement. A running turn by
 * itself keeps the composer editable (that is what queueing types into).
 * @param page - the page under test.
 * @param input - the `[data-composer-input]` surface locator.
 * @param text - the replacement draft; `''` clears the draft. Must not
 * contain a newline: typed Enter submits the composer.
 */
export declare function writeComposerDraft(page: Page, input: ReturnType<Page['locator']>, text: string): Promise<void>;
/** Failure evidence goes to the gitignored .artifacts/ (repo convention). */
export declare function saveFailureShot(page: Page, name: string): Promise<void>;
/**
 * Assert a visible tooltip paints above the element a user would read through
 * it, at the bubble's center and bottom edge. The bubble ignores pointer events
 * by design, so the measurement enables them for its own duration; each probe
 * reports the bubble or the covering element, so a failure names its cover.
 * @param tooltip - locator for the visible `[role="tooltip"]` bubble.
 */
export declare function expectTooltipOnTop(tooltip: Locator): Promise<void>;
/**
 * The conversation engine's Context key format, restated here rather than
 * imported: these specs live in the Host compiler aggregate, which must not
 * reach the Client plane. The engine's own copy is
 * `conversationContextKey` in ui-conversation; a drift between them makes
 * the key miss its rendered node, so the assertion fails loudly.
 * @param kind - Definition kind.
 * @param id - Definition-local business identity.
 * @returns the engine-owned Context key.
 */
export declare function conversationContextKey(kind: string, id: string): string;
/** Open Settings through the Web gear or Desktop account menu.
 * @param page - browser page with the mounted sidebar.
 * @param locale - current UI language.
 */
export declare function openSettings(page: Page, locale: 'en' | 'zh'): Promise<void>;
//# sourceMappingURL=support.d.ts.map