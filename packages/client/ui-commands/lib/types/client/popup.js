/**
 * Headless popupSelect shell state: one controller per client
 * session, owned by CommandUiRuntime's per-session map and torn down by the
 * session scope disposer. The shell is a transient layer (never in the input
 * state machine): it loads options once, filters them locally against the
 * shell's own search text, and settles a selection through the context
 * captured at open time. Draft consumption and composer focus are injected
 * callbacks — the session wiring dispatches the consume-token event (the
 * Input side owns the span/bare-token CAS guard) and focuses the composer;
 * the controller never touches the input machine.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { rankByName } from '@deepseek-ai/dsh-client-ui-primitives';
import { groupOptions } from "./option-groups.js";
const CLOSED = {
    open: false, command: null, status: 'pending', options: [], search: '', searchLabels: null, searchMode: 'substring', active: 0,
    submitting: false, confirming: null, acknowledged: false, error: null,
};
/**
 * Filter rows using substring matching, or rank labels fuzzily within each group.
 * Blank search keeps every row; fuzzy matching preserves group order.
 * @param options - the loaded rows.
 * @param search - the shell's search text.
 * @param mode - the command's policy; defaults to substring over label and detail.
 * @returns the original option objects in the order shown and used for selection.
 */
export function filterOptions(options, search, mode = 'substring') {
    const query = search.trim().toLowerCase();
    const groups = groupOptions(options);
    const ordered = groups.some(group => group.group !== undefined) ? groups.flatMap(group => group.rows) : options;
    if (query === '')
        return ordered;
    if (mode === 'fuzzy-label') {
        return groups.flatMap(group => rankByName(group.rows.map(option => ({ name: option.label, option })), query).map(row => row.option));
    }
    return ordered.filter(o => o.label.toLowerCase().includes(query) || (o.detail?.toLowerCase().includes(query) ?? false));
}
/**
 * Highlight index for a freshly loaded row list: the row marked as the current
 * value when the live search still shows it, else the top row. Opening parks
 * the highlight on the value the session already uses, so an accept gesture
 * made without looking confirms that value instead of the topmost row.
 * @param options - the loaded rows.
 * @param search - the shell's live filter text (non-empty after a retry).
 * @param mode - the command's search policy.
 * @returns index into the filtered rows.
 */
function currentIndex(options, search, mode) {
    const at = filterOptions(options, search, mode).findIndex(option => option.active === true);
    return at === -1 ? 0 : at;
}
/** The shell's error-strip line for a settlement failure. */
function errorText(error) {
    return error instanceof Error ? error.message : String(error);
}
/**
 * Headless controller of one session's popupSelect shell. Late settlements
 * lose their write rights through binding identity: dismiss/dispose/reopen
 * swap the binding, so a settling options fetch or onSelect that no longer
 * matches writes nothing and consumes nothing.
 */
export class PopupSelectController {
    deps;
    /** Shell state store (the overlay component subscribes here). */
    state = createSnapshotStore(CLOSED);
    binding = null;
    /**
     * @param deps - session-wiring callbacks (token consumption + composer focus).
     */
    constructor(deps) {
        this.deps = deps;
    }
    /**
     * Open the shell for one command: publish pending state and fetch options
     * once through the business spec. A reopen supersedes the previous shell
     * (its options fetch is aborted, its late settlements are dropped).
     * @param command - command name the shell serves.
     * @param spec - the registered popupSelect spec.
     * @param context - open-time context snapshot, handed verbatim to options/onSelect.
     * @param segment - open-time token segment snapshot for post-select consumption.
     */
    open(command, spec, context, segment) {
        const searchLabels = spec.searchLabels?.() ?? null;
        this.binding?.abort.abort();
        const binding = { command, spec, context, segment, abort: new AbortController() };
        this.binding = binding;
        this.state.set({ ...CLOSED, open: true, command, searchLabels, searchMode: spec.searchMode ?? 'substring' });
        this.load(binding);
    }
    /** Run the one options fetch of a binding; settlement rights die with the binding. */
    load(binding) {
        binding.spec.options(binding.context, binding.abort.signal).then((options) => {
            if (this.binding !== binding)
                return;
            const current = this.state.getSnapshot();
            this.state.set({ ...current, status: 'ready', options, active: currentIndex(options, current.search, current.searchMode), error: null });
        }, (error) => {
            if (this.binding !== binding)
                return;
            console.error(`[ui-commands] popupSelect options failed for /${binding.command}:`, error);
            this.state.set({ ...this.state.getSnapshot(), status: 'failed', options: [], active: 0, error: errorText(error) });
        });
    }
    /** Re-run a failed options fetch (search survives; no-op unless status is 'failed'). */
    retry() {
        const binding = this.binding;
        const s = this.state.getSnapshot();
        if (binding === null || !s.open || s.status !== 'failed')
            return;
        this.state.set({ ...s, status: 'pending', error: null });
        this.load(binding);
    }
    /**
     * Replace the local search text (pure local filter — the provider is never
     * re-queried) and rebase the highlight to the top of the new filtered list:
     * typing searches for something other than the current value.
     * @param search - the shell search input's text.
     */
    setSearch(search) {
        const s = this.state.getSnapshot();
        if (!s.open || s.submitting || s.confirming !== null || search === s.search)
            return;
        this.state.set({ ...s, search, active: 0 });
    }
    /**
     * Move the highlight across the filtered rows (wraps around; no-op unless
     * options are ready and no selection is in flight).
     * @param dir - +1 down, -1 up.
     */
    move(dir) {
        const s = this.state.getSnapshot();
        if (!s.open || s.status !== 'ready' || s.submitting || s.confirming !== null)
            return;
        const rows = filterOptions(s.options, s.search, s.searchMode);
        if (rows.length === 0)
            return;
        const active = (s.active + dir + rows.length) % rows.length;
        this.state.set({ ...s, active });
    }
    /**
     * Set the highlight directly (pointer hover; no-op unless ready, idle, and
     * in filtered range).
     * @param index - filtered-row index.
     */
    highlight(index) {
        const s = this.state.getSnapshot();
        if (!s.open || s.status !== 'ready' || s.submitting || s.confirming !== null)
            return;
        if (index < 0 || index >= filterOptions(s.options, s.search, s.searchMode).length || index === s.active)
            return;
        this.state.set({ ...s, active: index });
    }
    /**
     * Select one filtered row: single-flight — the first call enters
     * `submitting` and later calls no-op until it settles. Success consumes the
     * open-time token segment (a false CAS answer is benign), closes, and
     * returns focus to the composer. Failure keeps the shell open with search,
     * highlight, and token intact, surfaces the error, and re-arms select as
     * the retry.
     * @param index - filtered-row index (callers pass the highlight or the clicked row).
     * @returns settled when the attempt has closed the shell or surfaced its failure.
     */
    async select(index) {
        const binding = this.binding;
        const s = this.state.getSnapshot();
        if (binding === null || !s.open || s.status !== 'ready' || s.submitting || s.confirming !== null)
            return;
        const option = filterOptions(s.options, s.search, s.searchMode)[index];
        if (option === undefined)
            return;
        if (option.confirmation !== undefined) {
            this.state.set({ ...s, confirming: option, acknowledged: false, error: null });
            return;
        }
        await this.settle(binding, option);
    }
    /**
     * Update the explicit checkbox for the currently pending risk gate.
     * @param acknowledged - whether the user has acknowledged the displayed risk.
     */
    acknowledge(acknowledged) {
        const s = this.state.getSnapshot();
        if (!s.open || s.submitting || s.confirming === null || s.acknowledged === acknowledged)
            return;
        this.state.set({ ...s, acknowledged });
    }
    /** Cancel only the risk gate and return to the still-open option picker. */
    cancelConfirmation() {
        const s = this.state.getSnapshot();
        if (!s.open || s.submitting || s.confirming === null)
            return;
        this.state.set({ ...s, confirming: null, acknowledged: false });
    }
    /** Settle the gated option only after the checkbox is acknowledged. */
    async confirm() {
        const binding = this.binding;
        const s = this.state.getSnapshot();
        if (binding === null || !s.open || s.submitting || s.confirming === null || !s.acknowledged)
            return;
        await this.settle(binding, s.confirming);
    }
    /** Run the business settlement for an already admitted option. */
    async settle(binding, option) {
        const s = this.state.getSnapshot();
        if (this.binding !== binding || !s.open || s.submitting)
            return;
        this.state.set({ ...s, submitting: true, confirming: null, acknowledged: false, error: null });
        try {
            await binding.spec.onSelect(option, binding.context);
        }
        catch (error) {
            console.error(`[ui-commands] popupSelect onSelect failed for /${binding.command}:`, error);
            if (this.binding !== binding)
                return; // dismissed/reopened/disposed while onSelect flew
            this.state.set({ ...this.state.getSnapshot(), submitting: false, error: errorText(error) });
            return;
        }
        if (this.binding !== binding)
            return; // late success: no state write, no consumption
        this.deps.consume(binding.segment);
        this.binding = null;
        this.state.set(CLOSED);
        this.deps.focusComposer();
    }
    /**
     * Close the shell; aborts a flying options fetch and revokes settlement
     * rights. An outside pointer interaction dismisses plainly (the click's own
     * target takes focus); Escape passes focusComposer to return focus explicitly.
     * @param opts - focusComposer: also restore composer focus (Escape path).
     */
    dismiss(opts) {
        if (this.binding === null)
            return;
        this.binding.abort.abort();
        this.binding = null;
        this.state.set(CLOSED);
        if (opts?.focusComposer === true)
            this.deps.focusComposer();
    }
    /** Scope-teardown disposer: abort in-flight work and clear state (no focus side effect). */
    dispose() {
        this.binding?.abort.abort();
        this.binding = null;
        this.state.set(CLOSED);
    }
}
//# sourceMappingURL=popup.js.map