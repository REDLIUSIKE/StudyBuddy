/** Virtual executable registry used by the Worker process launcher. */
import { basename } from "../../module-system/posix-path.js";
import { LANDLOCK_EXECUTABLE } from "./landlock.js";
import { XDG_OPEN_EXECUTABLE } from "./xdg-open.js";
const EXECUTABLES = new Map([
    [LANDLOCK_EXECUTABLE.name, LANDLOCK_EXECUTABLE],
    [XDG_OPEN_EXECUTABLE.name, XDG_OPEN_EXECUTABLE],
]);
/**
 * Resolve a Worker platform executable by logical name.
 * @param path - Bare name or executable path passed to `spawn`.
 * @returns Its implementation, or undefined for the normal command table.
 */
export function virtualExecutable(path) {
    return EXECUTABLES.get(basename(path));
}
//# sourceMappingURL=virtual-executables.js.map