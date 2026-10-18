/**
 * Deliverables plugin, browser half: registers the changed-files card and
 * delivery cards into the chat view's turn-tail list, the `changes-review`
 * right-Sidebar tab type that reviews one turn's changed files one comparison
 * at a time, and provides the `chatFileMentions` service that links
 * inline-code mentions of produced or delivered files in the closing prose.
 * All policy lives here — the supported mutation calls, mention matching, row
 * cap, and copy — so composing this plugin out of cordis.yml removes every
 * surface; the owning view renders an empty list and inert prose at zero cost.
 */
import "./file-actions.js";
import { changesReviewAddress } from "../changes.js";
import { ChangesDiffStore } from "./changes-diff.js";
import { ChangesSummaryStore } from "./changes-summary.js";
import { PresentedOpenController } from "./present-open.js";
import { PresentRow } from "./PresentRow.js";
import { DeliverablesTail } from "./Deliverables.js";
import { ReviewTab } from "./ReviewTab.js";
import { CHANGES_REVIEW_ID, changesReviewDefinition } from "./review-definition.js";
import { createReviewStore } from "./review-store.js";
import { en, NS, zh } from "./locales.js";
import { deliverablesDefinition, presentedForClosing, producedFileMentions, selectProducedFiles, } from "./turn-deliverables.js";
/** Required services for the tail-slot and tab-type registrations and their dictionaries. */
export const inject = ['slots', 'locale', 'uiConversation', 'remote', 'remote.session', 'sidebarRightTabs', 'sidebarRight', 'configForms'];
/**
 * Client plugin body: register the dictionaries, the turn-tail entry, and the comparison tab type.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    const opener = new PresentedOpenController();
    const summaries = new ChangesSummaryStore();
    const diffs = new ChangesDiffStore();
    ctx.effect(() => () => Promise.all([opener.dispose(), summaries.dispose(), diffs.dispose()]));
    ctx.on('connection/reset', () => {
        opener.resetHost();
        summaries.reset();
        diffs.reset();
    });
    ctx.uiConversation.events.register(deliverablesDefinition);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-deliverables: dictionaries');
    ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        id: '@deepseek-ai/dsh-client-ui-deliverables',
        locale: NS,
        children: { 'deliverables.file.actions': { kind: 'list', scope: 'session' } },
        inject: () => ({
            hooks: { changesDiff: diffs.state, presentedOpen: opener.state, presentedHost: opener.host, changesSummary: summaries.state,
                showCodeDiff: ctx.configForms.developerTools.enabled },
            loadChangesDiff: (sessionId, seq, index) => diffs.load(sessionId, seq, index),
            reloadPresentedHost: () => opener.loadHost(),
            loadChangesSummary: (sessionId, seq) => summaries.load(sessionId, seq),
            openPresented: (sessionId, seq, index, action, application) => opener.open(sessionId, seq, index, action, application),
            openChanged: (sessionId, seq, index, action, application) => opener.openChanged(sessionId, seq, index, action, application),
            openChangesReview: (coordinates, index) => {
                ctx.sidebarRight.openResource(changesReviewAddress(coordinates), { params: { index } });
            },
        }),
    }, DeliverablesTail));
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'present', locale: NS }, PresentRow));
    const t = ctx.locale.bind(NS);
    ctx.effect(() => ctx.sidebarRightTabs.register(changesReviewDefinition(t)), 'ui-deliverables: changes-review type');
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: CHANGES_REVIEW_ID, locale: NS, store: createReviewStore(),
        children: { 'deliverables.review.file.actions': { kind: 'list', scope: 'session' } },
        inject: () => ({
            hooks: { changesSummary: summaries.state, changesDiff: diffs.state, presentedOpen: opener.state, presentedHost: opener.host },
            loadChangesSummary: (sessionId, seq) => summaries.load(sessionId, seq),
            loadChangesDiff: (sessionId, seq, index) => diffs.load(sessionId, seq, index),
            reloadPresentedHost: () => opener.loadHost(),
            openChanged: (sessionId, seq, index, action, application) => opener.openChanged(sessionId, seq, index, action, application),
        }),
    }, ReviewTab)), 'ui-deliverables: changes-review body');
    // The prose side of the same vocabulary: the chat view reaches this face
    // via ctx.get, so its absence — this plugin composed out — is the off state.
    const mentions = {
        forClosing(owner) {
            const paths = selectProducedFiles(owner);
            const presented = presentedForClosing(owner);
            if (paths === null && presented.length === 0)
                return undefined;
            return producedFileMentions([...new Set([...paths ?? [], ...presented.map(file => file.path)])], owner.openFile, path => t('presented.previewButton', { name: path }), owner.turn.data.get('deliverables')?.produced.filter(operation => operation.seq <= owner.seq));
        },
    };
    ctx.provide('chatFileMentions', mentions);
}
//# sourceMappingURL=index.js.map