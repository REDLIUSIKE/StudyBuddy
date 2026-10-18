import { randomUUID } from '@deepseek-ai/dsh-util-crypto';
import { PromptController } from "./controller.js";
import { PromptEntry, PromptPanel } from "./PromptPanel.js";
import { createPromptViewStore } from "./view-store.js";
import { en, zh } from "./locales.js";
export { createPromptViewStore } from "./view-store.js";
export const inject = ['slots', 'locale', 'sidebarRightGlobal'];
const KEY = 'studybuddy.prompts';
/** A global utility contribution, never a main-panel route or model-visible instruction. */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(KEY, { zh, en }), 'prompt manager dictionaries');
    const host = Reflect.get(window, 'studybuddy');
    const controller = new PromptController(host?.prompts);
    const handle = createPromptViewStore(), instance = handle.create(), store = { ...handle, create: () => instance };
    let disposed = false, timer;
    const feedback = (kind) => {
        if (disposed)
            return;
        clearTimeout(timer);
        instance.actions.feedback(kind);
        timer = setTimeout(() => { instance.actions.feedback(null); }, 2400);
    };
    const face = {
        hooks: { prompts: controller, globalPanel: ctx.sidebarRightGlobal.source },
        toggle: () => {
            if (ctx.sidebarRightGlobal.source.getSnapshot() === KEY)
                ctx.sidebarRightGlobal.close();
            else {
                ctx.sidebarRightGlobal.open(KEY);
                void controller.loadMine().catch(() => { });
            }
        },
        close: () => { ctx.sidebarRightGlobal.close(); },
        add: () => { instance.actions.edit({ id: randomUUID(), title: '', body: '', expectedRevision: 0 }); },
        edit: row => {
            const saved = controller.getSnapshot().items.find(item => item.id === row.sourceId);
            if (saved)
                instance.actions.edit({ id: saved.id, title: saved.title, body: saved.body, expectedRevision: saved.revision });
        },
        copy: body => {
            const scope = controller.getSnapshot().scope;
            void Promise.resolve().then(() => navigator.clipboard.writeText(body)).then(() => {
                if (!disposed && scope !== null && scope === controller.getSnapshot().scope)
                    feedback('copied');
            }).catch(() => { if (!disposed && scope === controller.getSnapshot().scope)
                feedback('copyError'); });
        },
        save: async (draft) => { await controller.save(draft); instance.actions.edit(null); feedback('saved'); },
        publish: row => {
            const saved = controller.getSnapshot().items.find(item => item.id === row.sourceId);
            if (!saved)
                return;
            void controller.publish(saved).then(result => { instance.actions.published(result.id); feedback('published'); }).catch(() => { });
        },
        loadMine: () => { void controller.loadMine().catch(() => { }); },
        loadSquare: (query, page = 1) => { void controller.loadSquare(query, page).catch(() => { }); },
    };
    ctx.effect(() => {
        let revision = 0;
        const adopt = (state) => {
            if (disposed)
                return;
            const scope = state.phase === 'authenticated' && state.scope ? JSON.stringify([state.scope.accountId, state.scope.generation]) : null;
            if (controller.getSnapshot().scope !== scope) {
                clearTimeout(timer);
                controller.setScope(scope);
                instance.actions.reset();
                if (ctx.sidebarRightGlobal.source.getSnapshot() === KEY)
                    ctx.sidebarRightGlobal.close();
            }
        };
        const stop = host?.subscribe(state => { ++revision; adopt(state); });
        const initial = revision;
        void host?.status().then(state => { if (initial === revision)
            adopt(state); }).catch(() => { if (initial === revision)
            adopt({ phase: 'error' }); });
        return () => { stop?.(); disposed = true; clearTimeout(timer); controller.dispose(); instance.actions.reset(); if (ctx.sidebarRightGlobal.source.getSnapshot() === KEY)
            ctx.sidebarRightGlobal.close(); };
    }, 'prompt manager account lifecycle');
    ctx.slots.inject('sidebar.header.action', () => ctx.slots.register({ name: 'sidebar.header.action', id: KEY, locale: KEY, inject: () => face }, PromptEntry));
    ctx.slots.inject('shell.leading.action', () => ctx.slots.register({ name: 'shell.leading.action', id: KEY, locale: KEY, inject: () => face }, PromptEntry));
    ctx.slots.inject('rightbar.global', () => ctx.slots.register({ name: 'rightbar.global', key: KEY, locale: KEY, store, inject: () => face }, PromptPanel));
}
//# sourceMappingURL=index.js.map