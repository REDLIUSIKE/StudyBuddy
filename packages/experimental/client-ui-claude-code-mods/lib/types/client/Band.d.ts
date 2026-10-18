import type { HostObservable, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { SurfaceSnapshot } from '@deepseek-ai/dsh-experimental-claude-code-mods/types';
import { NS } from './locales.ts';
/** What the browser plugin injects: the session's band snapshots and the press that goes back to the Host. */
export interface BandInjected {
    hooks: {
        band: HostObservable<SurfaceSnapshot | undefined>;
    };
    /** Run a button of the current drawing on the Host; resolves to the drawing after the press. */
    press: (generation: number, actionId: string) => Promise<void>;
}
/** Full props of the band entry in the input dock. */
export type BandProps = PropsRuntime<'conversation.input.dock'> & {
    press: BandInjected['press'];
    useBand: <T>(select: (snapshot: SurfaceSnapshot | undefined) => T) => T;
} & PropsLocale<typeof NS>;
/**
 * The band above the prompt: the session's current mod drawing, with buttons
 * that run their `onPress` on the Host. Hotkeys are shown as hints; a press is
 * a click.
 */
export declare function Band({ press, useBand, t }: BandProps): import("react").JSX.Element | null;
//# sourceMappingURL=Band.d.ts.map