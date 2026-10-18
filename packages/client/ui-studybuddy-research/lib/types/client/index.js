import { brandString } from '@deepseek-ai/dsh-brand';
import { EmbeddedPagePresentation, observeEmbeddedSurface, preloadPages } from '@deepseek-ai/dsh-client-ui-primitives';
import { formatFileMention } from '@deepseek-ai/dsh-file-reference/grammar';
import { ResearchPageController } from "./research-controller.js";
import { ResearchPanel, ResearchPanelIcon } from "./ResearchPanel.js";
import { ResearchConversations, NativeConversation } from "./native-conversation.js";
import { zh, en } from "./locales.js";
import { observeResearchActivation } from "./research-navigation.js";
export const inject = ['slots', 'locale', 'layout', 'theme', 'sessions', 'conversation'];
/** @param ctx - Original browser plugin context. */
export function apply(ctx) {
    ctx.effect(() => observeResearchActivation(ctx.layout.panelInfo, () => { ctx.layout.collapseSidebar(); }));
    ctx.effect(() => ctx.locale.register('studybuddy.research', { zh, en }));
    const t = ctx.locale.bind('studybuddy.research'), host = Reflect.get(window, 'studybuddy'), surface = host?.research;
    const controller = new ResearchPageController(surface && { ...surface, acquire: () => surface.acquire() }, id => ctx.sessions.retain(brandString(id), { source: 'researchView' }));
    const presentation = new EmbeddedPagePresentation(controller.page, () => t('title'));
    let geometry = { bounds: null, visible: false };
    const geometryListeners = new Set();
    const geometrySource = { getSnapshot: () => geometry, subscribe: listener => { geometryListeners.add(listener); return () => { geometryListeners.delete(listener); }; } };
    const setGeometry = (next) => {
        if (JSON.stringify(geometry) === JSON.stringify(next))
            return;
        geometry = next;
        for (const listener of geometryListeners) {
            try {
                listener();
            }
            catch {
                console.error('Research geometry observer failed');
            }
        }
    };
    const panel = { hooks: { page: controller.page }, desktop: !!surface, attachGuest: presentation.attach, retry: controller.page.retry,
        attachNative: element => {
            const stop = observeEmbeddedSurface(element, projection => {
                // Native menus hide only the web guest; the native form stays mounted and visible.
                setGeometry({ bounds: projection.bounds, visible: element.isConnected && !!projection.bounds && projection.bounds.width > 0 && projection.bounds.height > 0 });
            });
            return () => { stop(); setGeometry({ bounds: null, visible: false }); };
        } };
    const applyIntent = async (intentId) => {
        const view = controller.getSnapshot().views.find(row => row.intents.some(intent => intent.id === intentId)), intent = view?.intents.find(item => item.id === intentId);
        if (!view || !intent || !surface)
            return;
        try {
            const binding = await view.reference.ready;
            if (!controller.getSnapshot().views.some(row => row.reference === view.reference && row.intents.some(item => item.id === intentId)))
                return;
            const input = ctx.conversation.input.for(binding.ctx);
            const result = ctx.conversation.input.requestDraftInitialization(binding, { prompt: intent.text, clearPreviousDraft: false });
            if (result !== 'applied') {
                input.notify('info', t('draftPreserved'));
                return;
            }
            for (const path of intent.references) {
                const state = input.state.getSnapshot(), token = formatFileMention({ path, kind: 'file' }, false);
                if (token === undefined || !input.insertReference({ source: 'reference', ref: token, label: path.split('/').at(-1), appearance: 'file', clipboardText: token }, { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev })) {
                    input.notify('error', t('referenceFailed'));
                    return;
                }
            }
            await surface.acknowledgeIntent(intentId);
            controller.acknowledgeIntent(intentId);
            if (controller.getSnapshot().views.some(row => row.reference === view.reference && row.selected) && ctx.layout.panelInfo.getSnapshot().activePanelId === 'studybuddy.research')
                input.focus();
        }
        catch {
            if (controller.getSnapshot().views.some(row => row.reference === view.reference))
                controller.page.reportFailure('RESEARCH_SESSION_OPEN_FAILED');
        }
    };
    const overlay = { hooks: { views: controller, geometry: geometrySource, page: controller.page }, applyIntent };
    const id = 'studybuddy.research';
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: id, locale: 'studybuddy.research', inject: () => panel }, ResearchPanel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id, order: 55, label: () => t('title'), locale: 'studybuddy.research' }, ResearchPanelIcon));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'studybuddy.research.sessions', locale: 'studybuddy.research',
        children: { 'studybuddy.research.conversation': { kind: 'single', scope: 'session' } }, inject: () => overlay }, ResearchConversations));
    ctx.slots.inject('studybuddy.research.conversation', () => ctx.slots.register({ name: 'studybuddy.research.conversation' }, NativeConversation));
    ctx.effect(() => {
        let revision = 0, stopPreload;
        const adopt = (state) => {
            const scope = state.phase === 'authenticated' ? state.scope ?? null : null, previous = controller.page.getSnapshot().scope;
            const changed = previous?.accountId !== scope?.accountId || previous?.generation !== scope?.generation;
            controller.setScope(scope);
            if (ctx.layout.panelInfo.getSnapshot().activePanelId === id)
                void controller.page.acquire();
            if (changed) {
                stopPreload?.();
                stopPreload = scope && surface ? preloadPages([{ id: 'research', priority: 60, prepare: presentation.prepare }]) : undefined;
            }
        };
        const stop = host?.subscribe(state => { ++revision; adopt(state); }), initial = revision;
        void host?.status().then(state => { if (initial === revision)
            adopt(state); }).catch(() => { if (initial === revision)
            adopt({ phase: 'error' }); });
        const action = surface?.subscribeAction(value => {
            if (!controller.accept(value) || !value || typeof value !== 'object' || !('action' in value) || !value.action || typeof value.action !== 'object')
                return;
            const request = value.action, data = 'data' in value && value.data && typeof value.data === 'object' ? value.data : undefined;
            if (request.kind === 'draft' && data && 'preparedIntentId' in data && typeof data.preparedIntentId === 'string') {
                void applyIntent(data.preparedIntentId);
                return;
            }
            const view = controller.getSnapshot().views.find(row => data && 'sessionId' in data ? row.sessionId === data.sessionId : row.selected);
            if (!view)
                return;
            void view.reference.ready.then(binding => {
                if (!controller.getSnapshot().views.some(row => row.reference === view.reference))
                    return;
                const input = ctx.conversation.input.for(binding.ctx);
                if (request.kind === 'show-models') {
                    if (ctx.layout.panelInfo.getSnapshot().activePanelId !== 'studybuddy.research')
                        return;
                    input.focus();
                    if (!ctx.get('commandUi')?.openPopup('model', { sessionId: binding.session.sessionId }))
                        input.notify('info', t('modelHint'));
                    return;
                }
                const paths = request.kind === 'reference' ? [request.path] : [];
                for (const path of paths)
                    if (typeof path === 'string') {
                        const state = input.state.getSnapshot(), token = formatFileMention({ path, kind: 'file' }, false);
                        if (token === undefined) {
                            input.notify('error', t('referenceFailed'));
                            continue;
                        }
                        if (!input.insertReference({ source: 'reference', ref: token, label: path.split('/').at(-1), appearance: 'file', clipboardText: token }, { start: state.draft.length, end: state.draft.length, draftRev: state.draftRev }))
                            input.notify('error', t('referenceFailed'));
                    }
            }).catch(() => { controller.page.reportFailure('RESEARCH_SESSION_OPEN_FAILED'); });
        });
        return () => { stopPreload?.(); stop?.(); action?.(); };
    });
    ctx.on('theme/change', () => { void controller.page.setTheme({ ...presentation.theme(), mode: ctx.theme.getTheme().active.colorScheme }); });
    ctx.effect(() => () => { presentation.dispose(); controller.dispose(); geometryListeners.clear(); });
}
//# sourceMappingURL=index.js.map