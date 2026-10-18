/**
 * Browser resource ownership for the experimental providers. Resources belong
 * to an exact live Agent activation and never transfer to a resumed Session.
 * @module
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
/** One provider-owned browser or connection and its quiescent cleanup. */
export interface OwnedSessionResource<T> {
    /** Provider-private handle exposed to operations. */
    value: T;
    /** Stop admission, interrupt pending operations, and await resource shutdown. */
    close: () => Promise<void>;
}
/** Resource creation and attachment ownership selected by one provider. */
export interface SessionResourceOptions<T> {
    /** Provider name included in lifecycle diagnostics. */
    label: string;
    /** Reserve one existing browser for at most one live Session. */
    exclusive: boolean;
    /**
     * Acquire one resource; reject only after rolling back partial acquisition.
     * @param agent - exact live owner of this acquisition.
     * @param signal - aborts when that owner or the provider is disposed.
     * @returns the acquired resource and its cleanup.
     */
    open: (agent: Agent, signal: AbortSignal) => Promise<OwnedSessionResource<T>>;
}
/**
 * Lazily acquires one resource per live Session and serializes its operations.
 * Provider disposal closes connections before awaiting operations, allowing
 * transport closure to interrupt work whose upstream API has no abort support.
 */
export declare class SessionResources<T> {
    private readonly ctx;
    private readonly options;
    private readonly entries;
    private readonly ownerCleanups;
    private readonly disposedOwners;
    private disposing;
    /**
     * @param ctx - provider context with the live Agent registry.
     * @param options - provider-owned acquisition and attachment policy.
     */
    constructor(ctx: Context, options: SessionResourceOptions<T>);
    /**
     * Check admission without reserving or acquiring a browser.
     * @param agent - exact live Agent that would own the resource.
     * @returns whether this owner can use or acquire the configured browser.
     */
    available(agent: Agent): boolean;
    /**
     * Obtain the current activation's resource, acquiring it once when absent.
     * @param agent - exact live owner, never merely a durable Session id.
     * @param signal - optional cancellation of this wait; acquisition remains Session-owned.
     * @returns the provider's resource after acquisition and ownership checks.
     */
    get(agent: Agent, signal?: AbortSignal): Promise<T>;
    /**
     * Run after earlier operations on this Session settle; other Sessions proceed independently.
     * Cancellation stops this caller's acquisition wait without canceling Session-owned initialization.
     * It reaches an active provider operation and prevents queued work from starting.
     * @param agent - exact live resource owner.
     * @param signal - cancellation for this operation.
     * @param operation - provider call, which must retain ownership until its work settles.
     * @returns the operation result or its acquisition, cancellation, or execution failure.
     */
    run<R>(agent: Agent, signal: AbortSignal, operation: (resource: T, signal: AbortSignal) => Promise<R>): Promise<R>;
    /**
     * Stop new acquisitions and await every acquired resource and owned operation.
     * A failed close retains its entry and rejects disposal, preserving exclusive ownership.
     * @returns the shared quiescent disposal promise.
     */
    dispose(): Promise<void>;
    private entry;
    private closeEntry;
}
//# sourceMappingURL=index.d.ts.map