import type { WelcomeApi } from '../welcome-api.ts';
/**
 * Render the standalone welcome flow using shell-owned operations and localized copy.
 * Clearing the account attempt returns the sign-in status page to the initial choices.
 * @param props.api - isolated preload API; no account credentials reach the renderer.
 * @returns welcome pages with fixed bottom actions.
 */
export declare function Welcome({ api }: {
    api: WelcomeApi;
}): import("react").JSX.Element;
//# sourceMappingURL=WelcomePage.d.ts.map