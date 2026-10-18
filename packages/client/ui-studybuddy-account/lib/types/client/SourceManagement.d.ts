import type { SourceSnapshot } from './source-controller.ts';
import type { AccountFace } from './face.ts';
import type { AccountLocaleKey } from './locales.ts';
/**
 * Render the existing inventory, rename, delete, order and recovery controls for one source.
 * @param props - exact source identity and the current controller callbacks; closing never writes a Key.
 * @returns management details for the selected source.
 */
export declare function SourceManagement({ source, state, actions, t, onClose, showInventory }: {
    source: SourceSnapshot['sources'][number];
    state: SourceSnapshot;
    actions: AccountFace['source'];
    t: (key: AccountLocaleKey) => string;
    onClose: () => void;
    showInventory?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=SourceManagement.d.ts.map