import { ImageTab } from "./ImageTab.js";
import { imageDefinition, IMAGE_TAB_ID } from "./definition.js";
import { runImageAction } from "./actions.js";
import { MEDIA_NS } from "../generated-images/locale.js";
/** Register optional desktop actions and the established right-Sidebar tab extension. */
export function applyImageActions(ctx) {
    ctx.inject(['sidebarRightTabs', 'sidebarRight', 'locale', 'sessions', 'conversation'], scope => {
        const t = scope.locale.bind(MEDIA_NS);
        scope.effect(() => scope.sidebarRightTabs.register(imageDefinition(() => t('image.alt'))), 'ui-tool: image tab');
        scope.effect(() => scope.slots.inject('sidebar.right.pane.tab', () => scope.slots.register({ name: 'sidebar.right.pane.tab', key: IMAGE_TAB_ID, locale: MEDIA_NS }, ImageTab)), 'ui-tool: image tab body');
        const bridge = window.dshDesktop?.images;
        if (bridge === undefined)
            return;
        let epoch = 0;
        scope.on('connection/reset', () => { epoch++; });
        scope.effect(() => bridge.subscribe(action => {
            const id = scope.sessions.list.getSnapshot().ids.find(id => id === action.target.sessionId);
            const owner = id === undefined ? undefined : scope.sessions.scope(id);
            if (owner === undefined || id === undefined)
                return;
            const conversation = owner.get('conversation');
            if (conversation === undefined)
                return;
            const generation = epoch;
            const current = () => {
                const sameScope = scope.sessions.scope(id) === owner;
                const visible = Array.from(document.querySelectorAll('[data-chat-session]')).some(element => element.dataset.chatSession === id && element.getClientRects().length > 0);
                return generation === epoch && sameScope && visible;
            };
            void runImageAction(action, { current, open: address => { scope.sidebarRight.openResource(address); },
                fetch: url => fetch(url, { credentials: 'same-origin', signal: AbortSignal.timeout(15000) }), add: file => conversation.addImageToDraft(file),
            }).then(result => {
                if (result === 'failed' && current())
                    conversation.input.for(owner).notify('error', t('image.actionFailed'));
            });
        }), 'ui-tool: desktop image actions');
        scope.effect(() => () => { epoch++; }, 'ui-tool: pending image actions');
    });
}
//# sourceMappingURL=apply.js.map