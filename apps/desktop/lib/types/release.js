/** Immutable version identity shared by one Electron shell and its bundled dsh runtime. */
import { valid } from 'semver';
import { DESKTOP_HOST_PROTOCOL_VERSION } from "./host-protocol.js";
function isRecord(value) {
    return typeof value === 'object' && value !== null;
}
/** Validate release data read from an installed or packaged filesystem resource. */
export function parseDesktopRelease(value) {
    if (!isRecord(value) || value.schemaVersion !== 1 || typeof value.version !== 'string'
        || valid(value.version) === null || value.hostProtocolVersion !== DESKTOP_HOST_PROTOCOL_VERSION
        || typeof value.nodeVersion !== 'string' || valid(value.nodeVersion) === null
        || typeof value.pnpmVersion !== 'string' || valid(value.pnpmVersion) === null) {
        throw new Error('dsh desktop: invalid desktop release metadata');
    }
    return {
        schemaVersion: 1,
        version: value.version,
        hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
        nodeVersion: value.nodeVersion,
        pnpmVersion: value.pnpmVersion,
    };
}
//# sourceMappingURL=release.js.map