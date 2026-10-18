import { preloadPages, observeEmbeddedSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { brandString } from '@deepseek-ai/dsh-brand';
import { AigcViews } from "./aigc-views.js";
import { AigcConversations, AigcConversation, AigcQuestion, AigcWelcome } from "./native-conversation.js";
import { PageController } from "./page-controller.js";
import { PagePresentation } from "./PagePresentation.js";
import { PagePanel, SkillsPanelIcon, AigcPanelIcon } from "./PagePanel.js";
import { zh, en } from "./locales.js";
export { PageController } from "./page-controller.js";
export { PagePresentation } from "./PagePresentation.js";
export const inject = ['slots', 'locale', 'layout', 'theme', 'sessions', 'conversation'];
/** Cordis owns entry, account, and presentation lifetimes; the remote page owns its business flow. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register('studybuddy.pages', { zh, en }), 'studybuddy page dictionaries');
    const t = ctx.locale.bind('studybuddy.pages'), host = Reflect.get(window, 'studybuddy');
    const aigcViews = new AigcViews(id => ctx.sessions.retain(brandString(id), { source: 'aigcView' }));
    const applyingReferences = new Set();
    ctx.effect(() => aigcViews.subscribe(() => {
        for (const intent of aigcViews.getSnapshot().references) {
            const view = aigcViews.getSnapshot().views.find(row => row.sessionId === intent.sessionId);
            if (!view || applyingReferences.has(intent.id))
                continue;
            applyingReferences.add(intent.id);
            void view.reference.ready.then(binding => {
                if (!aigcViews.getSnapshot().views.some(row => row.reference === view.reference) || !aigcViews.getSnapshot().references.some(row => row.id === intent.id))
                    return;
                const input = ctx.conversation.input.for(binding.ctx), state = input.state.getSnapshot();
                if (binding.ctx.bail(binding.ctx, 'slash/input-insert-text', { text: intent.text, span: { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev } }) !== true)
                    input.notify('error', t('referenceFailed'));
                else if (aigcViews.getSnapshot().views.some(row => row.reference === view.reference && row.selected) && ctx.layout.panelInfo.getSnapshot().activePanelId === 'studybuddy.aigc')
                    input.focus();
            }).catch(() => { }).finally(() => { aigcViews.acknowledgeReference(intent.id); applyingReferences.delete(intent.id); });
        }
    }));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'studybuddy.aigc.sessions', locale: 'studybuddy.pages',
        children: { 'studybuddy.aigc.conversation': { kind: 'single', scope: 'session' }, 'studybuddy.aigc.question': { kind: 'single', scope: 'session' } }, inject: () => ({ hooks: { aigcViews } }) }, AigcConversations));
    ctx.slots.inject('studybuddy.aigc.conversation', () => ctx.slots.register({ name: 'studybuddy.aigc.conversation', children: { 'studybuddy.aigc.welcome': { kind: 'single', scope: 'session' } } }, AigcConversation));
    ctx.slots.inject('studybuddy.aigc.welcome', () => ctx.slots.register({ name: 'studybuddy.aigc.welcome', locale: 'studybuddy.pages',
        inject: () => ({ focusInput: id => { const binding = ctx.sessions.binding(id); if (binding)
                ctx.conversation.input.for(binding.ctx).focus(); } }) }, AigcWelcome));
    ctx.slots.inject('studybuddy.aigc.question', () => ctx.slots.register({ name: 'studybuddy.aigc.question', locale: 'studybuddy.pages',
        inject: () => ({ readyInteraction: id => host?.aigc?.interactionReady?.(id) ?? Promise.reject(Error('AIGC_QUESTION_SURFACE_UNAVAILABLE')),
            dismissInteraction: id => host?.aigc?.interactionReady?.(id, false) ?? Promise.reject(Error('AIGC_QUESTION_SURFACE_UNAVAILABLE')) }) }, AigcQuestion));
    ctx.effect(() => host?.aigc?.subscribeAction?.(value => { aigcViews.accept(value); }) ?? (() => { }));
    const entries = ['zhilian', 'skills', 'aigc'].map((target) => {
        const local = host?.aigc;
        const surface = target === 'aigc' ? local && { ...local, acquire: () => local.acquire() } : host?.community;
        const id = ('studybuddy.' + target), controller = new PageController(target, surface);
        const presentation = new PagePresentation(controller, () => t(target));
        const face = {
            hooks: { page: controller }, target, desktop: !!surface, retry: controller.retry,
            attach: target !== 'aigc' ? presentation.attach : element => {
                const observe = observeEmbeddedSurface(element, projection => { aigcViews.setFrame(element.isConnected ? projection.bounds : null); }), detach = presentation.attach(element);
                return () => { observe(); detach(); aigcViews.setFrame(null); };
            },
        };
        if (target === 'zhilian') {
            ctx.slots.inject('studybuddy.my-ai.leaderboard', () => ctx.slots.register({ name: 'studybuddy.my-ai.leaderboard', locale: 'studybuddy.pages', inject: () => face }, PagePanel));
        }
        else {
            ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: 'studybuddy.pages', inject: () => face }, PagePanel));
            ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
                name: 'sidebar.panellist', id, order: target === 'skills' ? 40 : 50,
                label: () => t(target), locale: 'studybuddy.pages',
            }, target === 'skills' ? SkillsPanelIcon : AigcPanelIcon));
        }
        return { id, controller, presentation };
    });
    let disposed = false;
    const syncTheme = () => {
        if (!disposed)
            for (const entry of entries) {
                void entry.controller.setTheme({ ...entry.presentation.theme(), mode: ctx.theme.getTheme().active.colorScheme });
            }
    };
    ctx.on('theme/change', syncTheme);
    ctx.effect(() => {
        let revision = 0, stopPreload;
        const adopt = (state) => {
            if (disposed)
                return;
            const scope = state.phase === 'authenticated' ? state.scope ?? null : null;
            const previous = entries[0]?.controller.getSnapshot().scope;
            const changed = previous?.accountId !== scope?.accountId || previous?.generation !== scope?.generation;
            for (const entry of entries) {
                entry.controller.setScope(scope);
                if (entry.controller.target === 'aigc')
                    aigcViews.setScope(scope, entry.controller.getSnapshot().lease?.lease ?? null);
                if (ctx.layout.panelInfo.getSnapshot().activePanelId === entry.id)
                    void entry.controller.acquire();
            }
            if (changed) {
                stopPreload?.();
                stopPreload = undefined;
                if (scope)
                    stopPreload = preloadPages(entries.filter(entry => entry.controller.target === 'aigc' ? !!host?.aigc : !!host?.community).map(entry => ({
                        id: entry.controller.target, priority: entry.controller.target === 'skills' ? 5 : entry.controller.target === 'zhilian' ? 30 : 50,
                        prepare: entry.presentation.prepare,
                    })));
            }
        };
        const off = host?.subscribe((state) => { ++revision; adopt(state); }), initial = revision;
        void host?.status().then((state) => { if (revision === initial)
            adopt(state); })
            .catch(() => { if (revision === initial)
            adopt({ phase: 'error' }); });
        const stopNavigation = host?.community?.subscribeNavigation?.((notice) => {
            if (disposed || !notice || typeof notice !== 'object' || !('scope' in notice) || !('target' in notice))
                return;
            const notified = notice.scope;
            if (!notified || typeof notified !== 'object' || !('accountId' in notified) || typeof notified.accountId !== 'string' || !('generation' in notified) || typeof notified.generation !== 'number')
                return;
            const scope = entries[0]?.controller.getSnapshot().scope;
            if (!scope || scope.accountId !== notified.accountId || scope.generation !== notified.generation)
                return;
            const target = typeof notice.target === 'string' && ['tools', 'zhilian', 'skills'].includes(notice.target) ? notice.target : null;
            if (target === 'zhilian')
                ctx.get('studybuddyMyAi')?.open('leaderboard');
            else if (target)
                ctx.layout.selectPanel(('studybuddy.' + target));
        });
        const stopCreative = host?.subscribeNavigation?.(notice => {
            if (disposed || !notice || typeof notice !== 'object' || !('target' in notice) || notice.target !== 'aigc' || !('scope' in notice) || !('capabilityAction' in notice) || typeof notice.capabilityAction !== 'string')
                return;
            const entry = entries.find(row => row.controller.target === 'aigc'), scope = entry?.controller.getSnapshot().scope;
            if (!scope || JSON.stringify(scope) !== JSON.stringify(notice.scope) || !entry)
                return;
            ctx.layout.selectPanel(entry.id);
            void entry.controller.acquire().then(() => host.capabilities?.completeOpen(notice.capabilityAction)).catch(() => entry.controller.reportFailure('AIGC_PROJECT_OPEN_FAILED'));
        });
        const stops = entries.map((entry) => {
            let themed = null;
            let previousScope = null, recoveryScope = null;
            let stopRecovery, recovering = false;
            const stop = entry.controller.subscribe(() => {
                const snapshot = entry.controller.getSnapshot(), lease = snapshot.lease?.lease ?? null, previousLease = themed;
                if (entry.controller.target === 'aigc')
                    aigcViews.setScope(snapshot.scope, lease);
                const retainedScope = previousScope?.accountId === snapshot.scope?.accountId && previousScope?.generation === snapshot.scope?.generation;
                previousScope = snapshot.scope;
                if (recoveryScope && (recoveryScope.accountId !== snapshot.scope?.accountId || recoveryScope.generation !== snapshot.scope?.generation)) {
                    stopRecovery?.();
                    stopRecovery = undefined;
                    recoveryScope = null;
                }
                if (lease !== themed) {
                    themed = lease;
                    syncTheme();
                }
                if (entry.controller.target === 'skills' && previousLease && !lease && retainedScope && snapshot.scope && snapshot.errorCode === 'AUTH_REQUIRED' && !recovering) {
                    stopRecovery?.();
                    recoveryScope = snapshot.scope;
                    stopRecovery = preloadPages([{ id: 'skills-recovery', priority: 5, prepare: async () => {
                                recovering = true;
                                try {
                                    await entry.presentation.prepare();
                                }
                                finally {
                                    recovering = false;
                                }
                            } }]);
                }
            });
            return () => { stopRecovery?.(); stop(); };
        });
        return () => { stopCreative?.(); stopPreload?.(); off?.(); stopNavigation?.(); for (const stop of stops)
            stop(); };
    }, 'studybuddy page account lifecycle');
    ctx.effect(() => () => {
        disposed = true;
        aigcViews.dispose();
        for (const entry of entries) {
            entry.presentation.dispose();
            entry.controller.dispose();
        }
    }, 'studybuddy page disposal');
}
//# sourceMappingURL=index.js.map