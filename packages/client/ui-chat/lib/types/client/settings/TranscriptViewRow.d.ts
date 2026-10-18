/** General Settings row for work-details presentation. */
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { type TranscriptViewMode } from '../../chat-settings.ts';
import { type CollapseTiming } from '../presentation-policy.ts';
/** Registration-side work-details preference face. */
export interface TranscriptViewRowInjected {
    hooks: {
        /** Persisted work-details preference bound as useTranscriptView. */
        transcriptView: SnapshotStore<TranscriptViewMode>;
        /** Browser-local timing bound as useCollapseTiming. */
        collapseTiming: SnapshotStore<CollapseTiming>;
    };
    /** Change the work-details presentation. */
    setTranscriptView: (mode: TranscriptViewMode) => void;
    /** Retain collapse timing for this Client lifetime without changing Host settings. */
    setCollapseTiming: (timing: CollapseTiming) => void;
}
/** Full Settings-row props. */
export type TranscriptViewRowProps = PropsRuntime<'settings.general.item'> & PropsLocale<'chat'> & InjectFace<TranscriptViewRowInjected>;
/**
 * Render work-details and browser-local collapse-timing selectors.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export declare function TranscriptViewRow({ useTranscriptView, setTranscriptView, useCollapseTiming, setCollapseTiming, t, }: TranscriptViewRowProps): import("react").JSX.Element;
//# sourceMappingURL=TranscriptViewRow.d.ts.map