/** File-extension preview registrations; component dispatch belongs to the keyed document slot. */
import { notifySubscribers } from '@deepseek-ai/dsh-client-store';
import { documentFileName, matchedSuffixLength, normalizeSuffix } from "./suffix.js";
/**
 * Rank an observed definition snapshot without consulting mutable service state.
 * @param definitions - registered implementations in registration order.
 * @param path - decoded filename or file path.
 * @returns matching implementations, external band first, then longest suffix.
 */
export function matchingDocumentPreviews(definitions, path) {
    const name = documentFileName(path);
    return definitions.map((definition, order) => ({
        definition, order,
        rank: definition.priority === 'builtin' ? 0 : 1,
        length: matchedSuffixLength(name, definition.extensions),
    }))
        .filter(candidate => candidate.length > 0)
        .sort((left, right) => right.rank - left.rank || right.length - left.length || left.order - right.order)
        .map(candidate => candidate.definition);
}
/**
 * Whether any registered implementation declares the filename's suffix binary.
 * @param definitions - registered implementations.
 * @param path - decoded filename or file path.
 * @returns true when a declared binary suffix matches the filename.
 */
export function binaryDocumentPath(definitions, path) {
    const name = documentFileName(path);
    return definitions.some(definition => matchedSuffixLength(name, definition.binaryExtensions ?? []) > 0);
}
/** Observable registry of all live implementations, including lower-priority alternatives. */
export class DocumentPreviewRegistry {
    registered = new Map();
    listeners = new Set();
    snapshot = [];
    /**
     * Read the current registrations.
     * @returns the same snapshot until a registration changes.
     */
    getSnapshot = () => this.snapshot;
    /**
     * Observe registration changes.
     * @param listener - registration-change observer.
     * @returns its disposer.
     */
    subscribe = (listener) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };
    /**
     * Register metadata separately from the matching keyed slot component.
     * @param definition - unique implementation and recognized suffixes; every
     * `binaryExtensions` entry must appear in `extensions`.
     * @returns an idempotent disposer; duplicate live implementation names and
     * binary suffixes outside `extensions` throw.
     */
    register(definition) {
        if (this.registered.has(definition.id)) {
            throw new Error(`documentPreviews: duplicate implementation "${definition.id}"`);
        }
        const declared = new Set(definition.extensions.map(normalizeSuffix));
        for (const extension of definition.binaryExtensions ?? []) {
            if (!declared.has(normalizeSuffix(extension))) {
                throw new Error(`documentPreviews: "${definition.id}" declares binary suffix "${extension}" outside its extensions`);
            }
        }
        this.registered.set(definition.id, definition);
        this.publish();
        let active = true;
        return () => {
            if (!active)
                return;
            active = false;
            this.registered.delete(definition.id);
            this.publish();
        };
    }
    /**
     * List every matching implementation in automatic-selection order.
     * @param path - decoded file path; matching never resolves filesystem access.
     * @returns extension band first, then longest suffix, then registration order.
     */
    candidates(path) {
        return matchingDocumentPreviews(this.snapshot, path);
    }
    publish() {
        this.snapshot = [...this.registered.values()];
        notifySubscribers(this.listeners, '[document-previews] registry');
    }
}
//# sourceMappingURL=registry.js.map