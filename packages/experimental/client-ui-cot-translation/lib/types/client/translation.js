/**
 * Split reasoning into completed paragraphs and request-sized fragments.
 * @param text - original reasoning, including its exact whitespace.
 * @param running - whether the final paragraph may still grow.
 * @param maxTextChars - translator's configured UTF-16 request limit.
 * @returns whitespace-preserving fragments with completion flags for translation eligibility.
 */
export function reasoningFragments(text, running, maxTextChars) {
    const result = [];
    const separator = /\r?\n(?:[\t ]*\r?\n)+/g;
    let start = 0;
    while (true) {
        const match = separator.exec(text);
        let remaining = text.slice(start, match?.index ?? text.length);
        while (remaining.length > maxTextChars) {
            let cut = maxTextChars;
            if (/[\uD800-\uDBFF]/.test(remaining.charAt(cut - 1)))
                cut -= 1;
            const whitespace = remaining.slice(0, cut).search(/\s+\S*$/);
            if (whitespace > 0)
                cut = whitespace;
            const source = remaining.slice(0, cut);
            remaining = remaining.slice(cut);
            const suffix = remaining.match(/^\s+/)?.[0] ?? '';
            remaining = remaining.slice(suffix.length);
            result.push({ text: source, suffix, complete: true });
        }
        result.push({ text: remaining, suffix: match?.[0] ?? '', complete: match !== null || !running });
        if (match === null)
            return result;
        start = match.index + match[0].length;
    }
}
/** One lifecycle controller owns cancellation, request ordering, and stale-result exclusion. */
export class ReasoningTranslation {
    selection;
    maxTextChars;
    translate;
    publish;
    controller = new AbortController();
    cache = new Map();
    fragments = [];
    pending = false;
    failed = false;
    /**
     * @param selection - explicit provider and resolved target language.
     * @param maxTextChars - configured translator request limit.
     * @param translate - one cancellation-aware Remote request.
     * @param publish - component-local display state update.
     */
    constructor(selection, maxTextChars, translate, publish) {
        this.selection = selection;
        this.maxTextChars = maxTextChars;
        this.translate = translate;
        this.publish = publish;
    }
    /**
     * Adopt the current source and enqueue newly completed fragments.
     * @param text - current original reasoning.
     * @param running - whether its tail is still streaming.
     */
    update(text, running) {
        this.fragments = reasoningFragments(text, running, this.maxTextChars);
        this.emit();
        void this.run();
    }
    /** Retry untranslated fragments after a failed request. */
    retry() { this.failed = false; void this.run(); }
    /** Abort the disclosure's requests and suppress all later publications. */
    dispose() { this.controller.abort(); }
    isDisposed() { return this.controller.signal.aborted; }
    emit() {
        if (this.isDisposed())
            return;
        const text = this.fragments.map((fragment) => {
            const content = fragment.complete ? this.cache.get(fragment.text) ?? fragment.text : fragment.text;
            return content + fragment.suffix;
        }).join('');
        this.publish({ text, pending: this.pending, failed: this.failed });
    }
    async run() {
        if (this.pending || this.failed || this.isDisposed())
            return;
        let next = this.fragments.find(fragment => fragment.complete && fragment.text.trim() !== '' && !this.cache.has(fragment.text));
        if (next === undefined)
            return;
        this.pending = true;
        this.emit();
        try {
            while (next !== undefined) {
                const translated = await this.translate({ ...this.selection, text: next.text }, this.controller.signal);
                if (this.isDisposed())
                    return;
                this.cache.set(next.text, translated);
                this.emit();
                next = this.fragments.find(fragment => fragment.complete && fragment.text.trim() !== '' && !this.cache.has(fragment.text));
            }
        }
        catch (_error) {
            if (!this.isDisposed())
                this.failed = true;
        }
        finally {
            this.pending = false;
            this.emit();
        }
    }
}
//# sourceMappingURL=translation.js.map