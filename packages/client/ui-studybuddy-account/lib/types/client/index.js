import z from '@deepseek-ai/schemastery';
import { StudyBuddyAccountController } from "./account-controller.js";
import { SourceController } from "./source-controller.js";
import { UsageController } from "./usage-controller.js";
import { RechargeController } from "./recharge-controller.js";
import { ProfileController } from "./profile-controller.js";
import { ProfilePresentation } from "./ProfilePresentation.js";
import { accountHost, businessApi } from "./business-api.js";
import { sameScope } from "./observable.js";
import { createMyAiViewStore } from "./view-store.js";
import { MyAiPanel, AccountPanelIcon } from "./MyAiPanel.js";
import { WalletSlot } from "./WalletSlot.js";
import { ModelsSettings } from "./ModelsSettings.js";
import { zh, en } from "./locales.js";
import { preloadPages } from '@deepseek-ai/dsh-client-ui-primitives';
const NS = 'studybuddy.account';
const PANEL_ID = 'studybuddy.my-ai';
/** Required framework seats, navigation, locale and theme services. */
export const inject = ['slots', 'locale', 'layout', 'theme'];
/** Validated balance refresh cadence in milliseconds. */
export const Config = z.object({ balanceRefreshIntervalMs: z.natural().min(1000).default(5000) });
/** Own the panel and shared wallet.
 * @param ctx Client plugin context.
 * @param config Validated visible-window refresh cadence. */
export function apply(ctx, config) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'studybuddy-account: dictionaries');
    const t = ctx.locale.bind(NS), host = accountHost(), api = businessApi(host);
    if (!host?.business)
        return;
    const account = new StudyBuddyAccountController(api), source = new SourceController(api), usage = new UsageController(api), recharge = new RechargeController(api, account.refreshSummary), profile = new ProfileController(host?.embedded);
    const presentation = new ProfilePresentation(profile);
    const modelInsights = new ProfileController(host?.embedded, 'model_insights'), modelPresentation = new ProfilePresentation(modelInsights);
    const handle = createMyAiViewStore(), instance = handle.create(), store = { ...handle, create: () => instance };
    let disposed = false, themeFrame = null;
    const syncTheme = () => {
        if (themeFrame !== null)
            cancelAnimationFrame(themeFrame);
        themeFrame = requestAnimationFrame(() => { themeFrame = null; if (!disposed) {
            const theme = { ...presentation.theme(), mode: ctx.theme.getTheme().active.colorScheme };
            void profile.setTheme(theme);
            void modelInsights.setTheme(theme);
        } });
    };
    const activate = (tab) => {
        if (!account.getSnapshot().scope)
            return;
        if (tab === 'profile')
            void profile.acquire();
        else if (tab === 'sources')
            void source.prepare();
        else if (tab === 'models')
            void modelInsights.acquire();
    };
    const face = {
        hooks: { account, source, usage, recharge, profile, modelInsights }, source, usage, recharge,
        refreshSummary: account.refreshSummary, activate,
        openMyAi: (tab) => { instance.actions.selectTab(tab); ctx.layout.selectPanel(PANEL_ID); activate(tab); void account.refreshSummary(); },
        openRecharge: () => { instance.actions.setRechargeOpen(true); void recharge.load(); void account.refreshSummary(); },
        attachProfile: presentation.attach, retryProfile: profile.retry,
        attachModelInsights: modelPresentation.attach, retryModelInsights: modelInsights.retry,
    };
    ctx.provide('studybuddyMyAi', { open: face.openMyAi });
    ctx.effect(() => {
        let revision = 0, stopPreload, balanceTimer;
        const refreshVisible = () => { if (!disposed && !document.hidden)
            void account.refreshSummary(); };
        const stopBalance = () => { if (balanceTimer !== undefined) {
            window.clearInterval(balanceTimer);
            balanceTimer = undefined;
        } };
        const adopt = (state) => {
            if (disposed)
                return;
            const scope = state.phase === 'authenticated' ? state.scope ?? null : null, changed = !sameScope(account.getSnapshot().scope, scope);
            for (const controller of [account, source, usage, recharge, profile, modelInsights])
                controller.setScope(scope);
            if (changed) {
                stopBalance();
                stopPreload?.();
                stopPreload = undefined;
                instance.actions.resetForScope();
                if (scope) {
                    balanceTimer = window.setInterval(refreshVisible, config.balanceRefreshIntervalMs);
                    void account.refreshSummary();
                    if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID)
                        activate('profile');
                    stopPreload = preloadPages([
                        ...(host.embedded ? [{ id: 'profile', priority: 20, prepare: profile.acquire }] : []),
                        { id: 'sources', priority: 5, prepare: () => source.prepare() },
                        ...(host.embedded ? [{ id: 'model-insights', priority: 22, prepare: modelInsights.acquire }] : []),
                        { id: 'platform-usage', priority: 50, prepare: () => usage.loadPlatform() },
                        { id: 'native-usage', priority: 51, prepare: () => usage.loadOwn() },
                        { id: 'recharge', priority: 60, prepare: () => recharge.load() },
                    ]);
                }
            }
        };
        const stop = host?.subscribe(state => { ++revision; adopt(state); });
        window.addEventListener('focus', refreshVisible);
        document.addEventListener('visibilitychange', refreshVisible);
        const initial = revision;
        void host?.status().then(state => { if (initial === revision)
            adopt(state); }).catch(() => { if (initial === revision)
            adopt({ phase: 'error' }); });
        let themedLease = null;
        const profileStop = profile.subscribe(() => { const lease = profile.getSnapshot().lease?.lease ?? null; if (lease !== themedLease) {
            themedLease = lease;
            syncTheme();
        } });
        let themedModelLease = null;
        const modelStop = modelInsights.subscribe(() => { const lease = modelInsights.getSnapshot().lease?.lease ?? null; if (lease !== themedModelLease) {
            themedModelLease = lease;
            syncTheme();
        } });
        const stopPanel = ctx.layout.panelInfo.subscribe(() => { if (ctx.layout.panelInfo.getSnapshot().activePanelId === PANEL_ID) {
            activate(instance.getSnapshot().tab);
            void account.refreshSummary();
        } });
        const stopToolsNavigation = host?.subscribeNavigation?.(notice => { if (disposed || !sameScope(account.getSnapshot().scope, notice.scope))
            return; if (notice.target === 'sources') {
            void source.load();
            face.openMyAi('sources');
        }
        else if (notice.target === 'recharge')
            face.openRecharge(); });
        return () => { stopBalance(); window.removeEventListener('focus', refreshVisible); document.removeEventListener('visibilitychange', refreshVisible); stopPreload?.(); stop?.(); stopPanel(); profileStop(); modelStop(); stopToolsNavigation?.(); };
    }, 'studybuddy-account: account and navigation lifecycle');
    ctx.on('theme/change', syncTheme);
    ctx.effect(() => () => {
        disposed = true;
        if (themeFrame !== null)
            cancelAnimationFrame(themeFrame);
        presentation.dispose();
        modelPresentation.dispose();
        for (const controller of [account, source, usage, recharge, profile, modelInsights])
            controller.dispose();
        instance.actions.resetForScope();
    }, 'studybuddy-account: domain disposal');
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID, children: { 'studybuddy.my-ai.leaderboard': { kind: 'single', scope: 'root' } }, locale: NS, store, inject: () => face }, MyAiPanel));
    ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'models', order: 10, priority: -10, label: () => t('modelSettings'), locale: NS, store, inject: () => face }, ModelsSettings));
    ctx.slots.inject('shell.actions', () => ctx.slots.register({ name: 'shell.actions', id: 'studybuddy.wallet', order: 10, locale: NS, store, inject: () => face }, WalletSlot));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: () => t('panel'), locale: NS }, AccountPanelIcon));
}
//# sourceMappingURL=index.js.map