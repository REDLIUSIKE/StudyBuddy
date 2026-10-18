/**
 * Sidebar bonus notice. The card reports a display once it has a position, the
 * document is visible, and it has painted one frame: that is the whole signal,
 * and the card measures no cover, so a painted card behind the open Settings
 * overlay reports the same way as any other. Closing counts as a display too,
 * because the user acted on it. An award that expired before a render is not
 * drawn at all.
 */
import { type RefObject } from 'react';
import type { BonusNotice } from './bonus-notices.ts';
/** @param props - notice copy and identity, sidebar anchor, and display callbacks.
 * @returns a non-modal notice above the account launcher until closed.
 */
export declare function AccountNoticeCard({ notice, anchor, title, closeLabel, onShown, onDismiss }: {
    notice: BonusNotice;
    anchor: RefObject<HTMLElement>;
    title: string;
    closeLabel: string;
    /** Called once, after the visible card has passed a presented frame. */
    onShown: (orderId: BonusNotice['orderId']) => void;
    /** Called when the user closes the card, which counts as having seen it. */
    onDismiss: (orderId: BonusNotice['orderId']) => void;
}): import("react").ReactPortal | null;
//# sourceMappingURL=AccountNotice.d.ts.map