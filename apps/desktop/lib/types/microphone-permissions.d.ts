/** Microphone access belongs to the primary application frame and the operating system. */
import { type Session, type WebContents } from 'electron';
/**
 * Handle microphone requests from the owned application window; other permissions retain Electron's defaults.
 * @param session - application's browser session.
 * @param primary - current primary window contents, absent while no window is open.
 */
export declare function installMicrophonePermissions(session: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>, primary: () => WebContents | undefined): void;
//# sourceMappingURL=microphone-permissions.d.ts.map