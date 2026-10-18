import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { AccountSnapshot } from './AccountSection.tsx';
import type { DesktopOnboardingProps, DesktopOnboardingState } from './onboarding-contract.ts';
/** Observable sources and actions supplied by the account plugin's apply closure. */
export interface DesktopOnboardingInjected extends Omit<DesktopOnboardingProps, 'state' | 'account' | 't' | 'exiting' | 'locale'> {
    hooks: {
        onboarding: HostObservable<DesktopOnboardingState>;
        account: HostObservable<AccountSnapshot>;
    };
}
/**
 * Read shared state through framework hooks; sessions do not control activation.
 * @param props - shell overlay bindings and account-owned actions.
 * @returns the unfinished flow, retained briefly after successful completion unless motion is reduced.
 */
export declare function DesktopOnboardingEntry({ useOnboarding, useAccount, ...props }: PropsRuntime<'shell.overlay'> & PropsLocale<'settings.account'> & InjectFace<DesktopOnboardingInjected>): import("react").JSX.Element | null;
//# sourceMappingURL=DesktopOnboardingEntry.d.ts.map