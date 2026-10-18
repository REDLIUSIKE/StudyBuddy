/** Immutable version identity shared by one Electron shell and its bundled dsh runtime. */
import { DESKTOP_HOST_PROTOCOL_VERSION } from './host-protocol.ts';
/** Release facts embedded in the bundled runtime descriptor. */
export interface DesktopRelease {
    readonly schemaVersion: 1;
    /** Exact version used by both Electron and `@deepseek-ai/dsh`. */
    readonly version: string;
    readonly hostProtocolVersion: typeof DESKTOP_HOST_PROTOCOL_VERSION;
    readonly nodeVersion: string;
    readonly pnpmVersion: string;
}
/** Validate release data read from an installed or packaged filesystem resource. */
export declare function parseDesktopRelease(value: unknown): DesktopRelease;
//# sourceMappingURL=release.d.ts.map