/** Shared low-level Win32 process, stdio, and Job Object primitives. */
export { ERROR_INSUFFICIENT_BUFFER } from "./abi.js";
export * from "./errors.js";
export { allocPtrSlot, allocUint32, decodePtr, decodeUint32, extendWin32ProcessBindings, isNullPtr, loadWin32ProcessBindings, throwLastError, throwWin32, } from "./ffi.js";
export { closeHandleChecked, drainPipe, isJobEmpty, pollProcessExit, probeCurrentTokenJobSupport, spawnInheritedJobProcess, spawnCurrentTokenJobProcess, spawnPipedProcess, terminateJob, waitForProcessExit, } from "./process.js";
//# sourceMappingURL=index.js.map