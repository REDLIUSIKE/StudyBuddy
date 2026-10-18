/** Browser-local microphone preference shared by settings previews and dictation. */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
/**
 * Restore the browser preference independently of Host recognition settings.
 * @returns validated device selection, persisted through the shared Client store.
 */
export function createMicrophoneDeviceStore() {
    const store = createSnapshotStore({ id: '', label: '' }, { persist: { name: 'dsh.voice-input.microphone' } });
    const saved = store.getSnapshot();
    if (!saved || typeof saved !== 'object' || !('id' in saved) || typeof saved.id !== 'string'
        || !('label' in saved) || typeof saved.label !== 'string')
        store.set({ id: '', label: '' });
    return store;
}
//# sourceMappingURL=microphone-device.js.map