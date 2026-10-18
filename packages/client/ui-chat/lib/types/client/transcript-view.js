/** Host-backed work details and independent, in-memory collapse timing. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { DEFAULT_TRANSCRIPT_VIEW_MODE, LEGACY_TRANSCRIPT_VIEW_MODE, LEGACY_EXPANDED_TRANSCRIPT_VIEW_MODE, TRANSCRIPT_VIEW_FIELD, } from "../chat-settings.js";
/** Live work-details preference consumed by Chat and its Settings row. */
export class TranscriptViewPolicy {
    host;
    defaultMode;
    unsubscribe;
    /** Reactive current mode, including the client default before Host settings arrive. */
    mode;
    /** Independent Client-lifetime choice; each new instance starts with completion-time folding. */
    collapseTiming = createSnapshotStore('completion');
    /**
     * @param host - durable Chat settings scope.
     * @param defaultMode - presentation used without an explicit saved mode.
     */
    constructor(host, defaultMode = DEFAULT_TRANSCRIPT_VIEW_MODE) {
        this.host = host;
        this.defaultMode = defaultMode;
        this.mode = createSnapshotStore(defaultMode);
        this.unsubscribe = host.subscribe(() => { this.adopt(); });
        this.adopt();
    }
    /** Release the accepted-value subscription. */
    dispose() { this.unsubscribe(); }
    /**
     * Publish and persist one explicit user choice.
     * @param mode - Compact, Standard, Detailed, or Verbose work details.
     */
    setMode(mode) {
        if (this.mode.getSnapshot() === mode)
            return;
        this.mode.set(mode);
        void this.host.set(TRANSCRIPT_VIEW_FIELD, mode);
    }
    /**
     * Keep collapse timing in memory without writing Host or browser storage.
     * @param timing - immediate completion folding or deferred folding at the next input.
     */
    setCollapseTiming(timing) {
        this.collapseTiming.set(timing);
    }
    /** Adopt the latest accepted Host section without writing it back. */
    adopt() {
        const section = this.host.getSnapshot().value;
        if (section === undefined)
            return;
        const saved = section.transcriptView;
        const mode = saved === LEGACY_TRANSCRIPT_VIEW_MODE || saved === LEGACY_EXPANDED_TRANSCRIPT_VIEW_MODE
            ? 'detailed' : saved ?? this.defaultMode;
        if (this.mode.getSnapshot() !== mode)
            this.mode.set(mode);
    }
}
//# sourceMappingURL=transcript-view.js.map