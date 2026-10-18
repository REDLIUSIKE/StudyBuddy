/** Keeps Electron's private Platform credentials bound to the active account provider. */
import type { Context } from '@deepseek-ai/cordis';
import type { PlatformSession } from '@deepseek-ai/dsh-deepseek-account';
/**
 * Publish account sessions for each provider lifetime, clearing them on removal or stream termination.
 * @param ctx - Host context owning the account dependency subscription.
 * @param publish - Synchronous private IPC delivery; never forwards credentials to the renderer.
 */
export declare function installPlatformSessionPublisher(ctx: Context, publish: (session: PlatformSession | null) => void): void;
//# sourceMappingURL=platform-session.d.ts.map