import { brandString } from '@deepseek-ai/dsh-brand';
import { createWaterfallRequest, PendingQuestion } from "./contract/slots.js";
import { createQuestionDraftStore } from "./draft-store.js";
import { QuestionComposer } from "./QuestionComposer.js";
import { questionReplyDefinition } from "./question-reply.js";
import { QuestionReplyView } from "./QuestionReplyView.js";
import { en, zh } from "./locales.js";
/** Dictionary namespace owned by this plugin. */
const NS = 'question';
/** Required services: Agent scopes, Remote Events, Session UI, Slot registry, conversation nodes, and copy. */
export const inject = ['sessions', 'remote', 'remote.userQuestions', 'uiSession', 'slots', 'locale', 'uiConversation'];
/**
 * Cards published to the Session pending-interaction registry, keyed by
 * `PendingQuestion.key`. A tool-call-keyed card is shared by the forwarded
 * waterfall and the Session projection.
 *
 * A card outlives its seat. Closing the panel only unpublishes it, which keeps
 * the request answerable from its tool call row, so this registry — not the
 * pending-interaction registry — decides when a request is over.
 */
class QuestionCards {
    publish;
    #cards = new Map();
    constructor(publish) {
        this.publish = publish;
    }
    byCallId(sessionId, callId) {
        return this.#cards.get(PendingQuestion.keyOf(sessionId, callId));
    }
    /** Observable state for one card while the registry owns it. */
    source(key) {
        return this.#cards.get(key)?.pending;
    }
    values() {
        return [...this.#cards.values()];
    }
    /** Keys of every card registered for one Session. */
    keysFor(sessionId) {
        return this.values().filter(card => card.pending.sessionId === sessionId).map(card => card.pending.key);
    }
    /**
     * Return the card of a tool call, creating and publishing it when absent.
     * A request without a call id always gets a fresh card.
     */
    ensure(sessionId, questions, callId) {
        if (callId !== undefined) {
            const existing = this.byCallId(sessionId, callId);
            if (existing !== undefined)
                return existing;
        }
        return this.#create(new PendingQuestion(sessionId, questions, callId, () => this.keysFor(sessionId)));
    }
    /** Publish one carrier into the composer seat and register the card that owns it. */
    #create(pending) {
        const requests = new Set();
        const delegate = async () => {
            pending.delegate();
            await Promise.all(requests);
        };
        // Republishing is how a revealed card reaches the seat: the registry keeps
        // the last entry of equal precedence, and it rejects a duplicate key.
        let unpublish = this.publish(pending, delegate);
        const card = {
            pending,
            hide: () => {
                unpublish?.();
                unpublish = undefined;
            },
            reveal: () => {
                unpublish?.();
                unpublish = this.publish(pending, delegate);
            },
            remove: () => {
                /* v8 ignore next -- a card leaves the registry once; no caller holds a card the registry already replaced. */
                if (this.#cards.get(pending.key) !== card)
                    return;
                this.#cards.delete(pending.key);
                pending.close();
                unpublish?.();
                unpublish = undefined;
            },
            trackRequest: (completion) => {
                requests.add(completion);
                return () => { requests.delete(completion); };
            },
            hasRequest: () => requests.size > 0,
        };
        // A review card has no request left to park: closing it drops the card, and
        // the tool call row builds another one from the same transcript record.
        pending.attachSeat({ hide: pending.review === undefined ? card.hide : card.remove });
        this.#cards.set(pending.key, card);
        return card;
    }
    /**
     * Show the panel of one answerable tool call.
     * @param sessionId - Session the tool call belongs to.
     * @param callId - `ask_user_question` call whose panel to show, as its
     * transcript row spells it.
     * @returns whether a card for that call is still answerable.
     */
    reveal(sessionId, callId) {
        const card = this.byCallId(sessionId, callId);
        if (card === undefined)
            return false;
        card.reveal();
        return true;
    }
    /**
     * Show one settled tool call's recorded answers as a read-only card. A call
     * that somehow still holds a card is shown as it stands, so a live request is
     * never replaced by a stale copy of itself.
     * @param sessionId - Session the tool call belongs to.
     * @param callId - `ask_user_question` call whose record to show, as its
     * transcript row spells it.
     * @param record - the call's questions and recorded answers.
     * @returns true; a record always produces a card.
     */
    review(sessionId, callId, record) {
        const card = this.byCallId(sessionId, callId) ?? this.#create(new PendingQuestion(sessionId, record.questions, brandString(callId), () => this.keysFor(sessionId), record.answers));
        card.reveal();
        return true;
    }
    /**
     * Hand every live waterfall back at plugin teardown. The pending-interaction
     * registry only drains what it currently holds, and a hidden card is not in
     * it, so its Host request would wait for its own abort instead.
     */
    dispose() {
        for (const card of this.values()) {
            card.pending.delegate();
            card.remove();
        }
    }
}
/** Present one forwarded request through its card until the waterfall settles. */
async function answerQuestion(ctx, owner, request, next, cards) {
    const sessionId = ctx.sessions.scopeOf(owner);
    if (sessionId === undefined)
        return next();
    const callId = request.wait?.callId;
    const card = cards.ensure(sessionId, request.questions, callId);
    const claimLifetime = new AbortController();
    const claimSignal = request.signal === undefined ? claimLifetime.signal
        : AbortSignal.any([claimLifetime.signal, request.signal]);
    let claim;
    let claimEnded;
    let delegateRequest;
    const releaseClaim = request.wait?.timed === true && callId !== undefined
        ? ctx.effect(() => {
            claim = ctx.remote.userQuestions.attachWait(sessionId, callId, claimSignal);
            return async () => {
                delegateRequest?.();
                claimLifetime.abort();
                claim?.dispose();
                if (claimEnded !== undefined)
                    await Promise.allSettled([claimEnded]);
            };
        }, 'ui-user-questions: foreground claim')
        : undefined;
    const completed = Promise.withResolvers();
    const finishRequest = card.trackRequest(completed.promise);
    try {
        const iterator = claim?.[Symbol.asyncIterator]();
        const opening = iterator === undefined ? undefined : await iterator.next();
        if (opening?.done === true)
            return await next();
        const waterfall = createWaterfallRequest(opening === undefined ? undefined : Date.now() + opening.value.remainingMs, claimSignal, (channel) => { card.pending.detachWaterfall(channel); });
        // Cancellation may win between the first claim frame and this continuation.
        // The request has already settled, so its channel must never reach the card.
        if (claimSignal.aborted)
            return await waterfall.result;
        delegateRequest = () => { waterfall.channel.delegate(); };
        card.pending.attachWaterfall(waterfall.channel);
        if (iterator !== undefined) {
            claimEnded = (async () => {
                await iterator.next();
                throw new Error('the foreground question wait ended');
            })();
        }
        try {
            return await (claimEnded === undefined ? waterfall.result : Promise.race([waterfall.result, claimEnded]));
        }
        catch (error) {
            if (waterfall.isDelegation(error)) {
                await releaseClaim?.();
                return await next();
            }
            throw error;
        }
    }
    finally {
        if (releaseClaim === undefined)
            claimLifetime.abort();
        else if (claimEnded === undefined)
            await releaseClaim();
        else {
            // The Host closes the claim after accepting the waterfall outcome.
            // A local return precedes transmission and cannot release that claim.
            void Promise.allSettled([claimEnded]).then(() => { void releaseClaim(); });
        }
        // A blocking request without a call id is not in the projection; its card ends with its waterfall.
        if (callId === undefined)
            card.remove();
        completed.resolve();
        finishRequest();
    }
}
/**
 * Mirror answerable calls onto cards. A submitted reply in the durable Inbox
 * removes the editable card until the reply is admitted or discarded.
 */
function publishContinuedQuestions(ctx, cards) {
    const sessions = ctx.sessions;
    const stopProjections = new Map();
    const unwrap = (result) => {
        if (!result.ok)
            throw new Error(result.error.message);
        return result.value;
    };
    const rpcFor = (sessionId, callId) => ({
        answer: async (answer) => unwrap(await ctx.remote.userQuestions.answer(sessionId, callId, answer)),
    });
    const reconcile = () => {
        const snapshot = sessions.list.getSnapshot();
        const bound = new Map(Object.values(snapshot.byId).flatMap((summary) => {
            const binding = sessions.binding(summary.id);
            return binding === undefined ? [] : [[summary.id, binding]];
        }));
        for (const [sessionId, stop] of stopProjections) {
            if (bound.has(sessionId))
                continue;
            stop();
            stopProjections.delete(sessionId);
        }
        for (const [sessionId, binding] of bound) {
            if (stopProjections.has(sessionId))
                continue;
            const stopQuestions = binding.session.projections.faceOf('userQuestions').subscribe(reconcile);
            const stopInbox = binding.session.projections.faceOf('inbox').subscribe(reconcile);
            stopProjections.set(sessionId, () => { stopQuestions(); stopInbox(); });
        }
        const rows = new Map();
        for (const [sessionId, binding] of bound) {
            const projected = binding.session.projections.faceOf('userQuestions').getSnapshot();
            const inbox = binding.session.projections.faceOf('inbox').getSnapshot();
            const queued = new Set();
            for (const message of [...(inbox?.['next-step'] ?? []), ...(inbox?.['next-turn'] ?? [])]) {
                if (typeof message !== 'object' || message === null || Array.isArray(message))
                    continue;
                const source = message.source;
                if (typeof source !== 'object' || source === null || Array.isArray(source))
                    continue;
                if (source.kind === 'user-question-reply' && typeof source.callId === 'string')
                    queued.add(source.callId);
            }
            for (const row of projected?.active ?? []) {
                if (row.state === 'continued' && queued.has(row.callId))
                    continue;
                rows.set(PendingQuestion.keyOf(sessionId, row.callId), { sessionId, row });
            }
        }
        for (const { sessionId, row } of rows.values()) {
            if (row.state === 'continued') {
                const card = cards.ensure(sessionId, row.questions, row.callId);
                card.pending.attachRpc(rpcFor(sessionId, row.callId));
                card.pending.setState('continued');
                continue;
            }
            cards.byCallId(sessionId, row.callId)?.pending.setState('open');
        }
        for (const card of cards.values()) {
            // A review card's call already settled, so the projection no longer lists it as answerable.
            if (card.pending.callId === undefined
                || card.pending.review !== undefined
                || rows.has(card.pending.key)
                || card.hasRequest()
                || card.pending.hasWaterfall())
                continue;
            card.remove();
        }
    };
    reconcile();
    const stopList = sessions.list.subscribe(reconcile);
    return () => {
        stopList();
        for (const stop of stopProjections.values())
            stop();
        stopProjections.clear();
    };
}
/**
 * Client plugin body: register the `question` dictionaries, the question
 * composer into the composer chain, and the late-reply conversation node.
 * Zero business face — data and verbs live on the matched carrier; t rides
 * the standard locale seat.
 * @param ctx - client root context.
 */
export function apply(ctx) {
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-user-questions: dictionaries');
    const questionDraftStore = createQuestionDraftStore();
    const registerPendingInteraction = ctx.uiSession.registerPendingInteraction(pending => pending.kind === 'plan-review' ? 2 : 1);
    const cards = new QuestionCards(registerPendingInteraction);
    ctx.effect(() => () => { cards.dispose(); }, 'ui-user-questions: cards');
    const disposePanels = ctx.reflect.provide('userQuestionPanels', {
        reveal: (sessionId, callId) => cards.reveal(sessionId, callId),
        review: (sessionId, callId, record) => cards.review(sessionId, callId, record),
    });
    ctx.effect(() => disposePanels, 'ui-user-questions: answer panels');
    ctx.effect(() => publishContinuedQuestions(ctx, cards), 'ui-user-questions: continued questions');
    ctx.slots.inject('conversation.composer', () => ctx.slots.register({
        name: 'conversation.composer',
        select: ({ pendingInteraction }) => pendingInteraction instanceof PendingQuestion ? pendingInteraction : null,
        locale: NS,
        store: questionDraftStore,
        inject: () => ({ keyedHooks: { questionCard: (key) => cards.source(key) } }),
        children: { 'conversation.plan-review.actions': { kind: 'list', scope: 'session' } },
    }, QuestionComposer));
    ctx.uiConversation.events.register(questionReplyDefinition);
    ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
        name: 'conversation.chat.node',
        key: 'question-reply',
        locale: NS,
    }, QuestionReplyView));
    ctx.remote.$on('user-questions/request', function (request, next) {
        return answerQuestion(ctx, this, request, next, cards);
    });
}
//# sourceMappingURL=index.js.map