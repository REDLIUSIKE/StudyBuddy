import { ShortcutPersistence } from '@deepseek-ai/dsh-client-shortcuts/protocol';
import type { ShortcutConfigSnapshot, ShortcutPlatform } from '@deepseek-ai/dsh-client-shortcuts/protocol';
/**
 * Open the device configuration with atomic replacement.
 * @param userData - Electron-owned userData directory, never a Renderer-supplied path.
 * @param platform - local input platform.
 * @param publish - updates the native binding index and trusted product page after commit.
 * @returns the single-writer transaction coordinator.
 */
export declare function desktopKeybindings(userData: string, platform: ShortcutPlatform, publish: (snapshot: ShortcutConfigSnapshot) => void): ShortcutPersistence;
//# sourceMappingURL=keybindings.d.ts.map