import { jsx as _jsx } from "react/jsx-runtime";
/** Account choice inside the model credential onboarding step. */
import { useEffect } from 'react';
import { SignInDialog } from "./SignInDialog.js";
/** @param props - onboarding completion, account state and actions. @returns account dialog while signed out. */
export function AccountOnboarding({ complete, useApiKey, useAccount, useTheme, setOnboarding, showLogin, start, cancel, t }) {
    const account = useAccount(value => value);
    const colorScheme = useTheme(snapshot => snapshot.active.colorScheme);
    useEffect(() => { setOnboarding(true); return () => { setOnboarding(false); }; }, [setOnboarding]);
    useEffect(() => { if (account.view?.status === 'credential-stored')
        complete(); }, [account.view?.status, complete]);
    if (!account.view || account.view.status === 'credential-stored')
        return null;
    return _jsx(SignInDialog, { account: account, colorScheme: colorScheme, start: start, cancel: cancel, t: t, close: () => { showLogin(false); complete(); }, useApiKey: () => { showLogin(false); useApiKey(); } });
}
//# sourceMappingURL=AccountOnboarding.js.map