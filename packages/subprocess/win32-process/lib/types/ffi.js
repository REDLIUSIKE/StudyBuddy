/** Lazy Koffi bindings for generic Win32 process, stdio, and Job operations. */
import * as abi from "./abi.js";
import { Win32Error } from "./errors.js";
import { requireKoffi } from "./koffi.js";
/**
 * Return whether a Koffi pointer represents NULL.
 * @param value - pointer value returned by Koffi or a Win32 call.
 * @returns true for null, undefined, or address zero.
 */
export function isNullPtr(value) {
    return value === null || value === undefined || value === 0n;
}
let cachedTypes;
/** Resolve Koffi pointer and process layouts on the first native operation. */
function win32Types() {
    if (cachedTypes !== undefined)
        return cachedTypes;
    const koffi = requireKoffi();
    const PVOID = koffi.pointer('void');
    const PPVOID = koffi.pointer(PVOID);
    const STARTUPINFOW = koffi.struct('DSH_STARTUPINFOW', {
        cb: 'uint32', lpReserved: 'str16', lpDesktop: 'str16', lpTitle: 'str16',
        dwX: 'uint32', dwY: 'uint32', dwXSize: 'uint32', dwYSize: 'uint32',
        dwXCountChars: 'uint32', dwYCountChars: 'uint32', dwFillAttribute: 'uint32',
        dwFlags: 'uint32', wShowWindow: 'uint16', cbReserved2: 'uint16',
        lpReserved2: koffi.pointer('uint8'), hStdInput: PVOID, hStdOutput: PVOID, hStdError: PVOID,
    });
    const PROCESS_INFORMATION = koffi.struct('DSH_PROCESS_INFORMATION', {
        hProcess: PVOID, hThread: PVOID, dwProcessId: 'uint32', dwThreadId: 'uint32',
    });
    /* v8 ignore start -- ABI guards are pinned by native header probes. */
    if (STARTUPINFOW.size !== abi.STARTUPINFOW_SIZE) {
        throw new Error(`STARTUPINFOW layout mismatch: koffi computed ${STARTUPINFOW.size}, expected ${abi.STARTUPINFOW_SIZE}`);
    }
    if (PROCESS_INFORMATION.size !== abi.PROCESS_INFORMATION_SIZE) {
        throw new Error(`PROCESS_INFORMATION layout mismatch: koffi computed ${PROCESS_INFORMATION.size}, expected ${abi.PROCESS_INFORMATION_SIZE}`);
    }
    /* v8 ignore stop */
    return cachedTypes = { PVOID, PPVOID, STARTUPINFOW, PROCESS_INFORMATION };
}
/**
 * Materialize the Koffi STARTUPINFOW layout on first native use.
 * @returns the cached native struct type.
 */
export function startupInfoType() {
    return win32Types().STARTUPINFOW;
}
/**
 * Materialize the Koffi PROCESS_INFORMATION layout on first native use.
 * @returns the cached native struct type.
 */
export function processInformationType() {
    return win32Types().PROCESS_INFORMATION;
}
/**
 * Allocate a pointer-sized out-parameter slot.
 * @returns allocated native slot.
 */
export function allocPtrSlot() {
    const { PVOID } = win32Types();
    return requireKoffi().alloc(PVOID, 1);
}
/**
 * Allocate a uint32 out-parameter slot.
 * @returns allocated native slot.
 */
export function allocUint32() {
    return requireKoffi().alloc('uint32', 1);
}
/**
 * Decode a pointer out-parameter.
 * @param slot - pointer-sized slot filled by Win32.
 * @returns decoded pointer, or null for address zero.
 */
export function decodePtr(slot) {
    const value = requireKoffi().decode(slot, win32Types().PVOID);
    return isNullPtr(value) ? null : value;
}
/**
 * Decode a uint32 out-parameter.
 * @param slot - uint32 slot filled by Win32.
 * @returns decoded unsigned value.
 */
export function decodeUint32(slot) {
    return requireKoffi().decode(slot, 'uint32');
}
/**
 * Allocate a zeroed STARTUPINFOW.
 * @returns allocated struct pointer.
 */
export function allocStartupInfo() {
    return requireKoffi().alloc(win32Types().STARTUPINFOW, 1);
}
/**
 * Encode the stdio-bearing STARTUPINFOW fields.
 * @param startupInfo - allocated STARTUPINFOW pointer.
 * @param fields - fields required for inherited stdio.
 */
export function encodeStartupInfo(startupInfo, fields) {
    requireKoffi().encode(startupInfo, win32Types().STARTUPINFOW, fields);
}
/**
 * Allocate a zeroed PROCESS_INFORMATION.
 * @returns allocated struct pointer.
 */
export function allocProcessInfo() {
    return requireKoffi().alloc(win32Types().PROCESS_INFORMATION, 1);
}
/**
 * Decode PROCESS_INFORMATION.
 * @param processInfo - struct pointer filled by CreateProcess.
 * @returns process/thread handles and ids.
 */
export function decodeProcessInfo(processInfo) {
    return requireKoffi().decode(processInfo, win32Types().PROCESS_INFORMATION);
}
let cachedContext;
let cached;
/* v8 ignore start -- exercised by native Windows ABI and sandbox jobs. */
function bindingContext() {
    if (cachedContext !== undefined)
        return cachedContext;
    const koffi = requireKoffi();
    const kernel32 = koffi.load('kernel32.dll');
    const advapi32 = koffi.load('advapi32.dll');
    const bind = (lib, name, result, args) => lib.func('__stdcall', name, result, args);
    cachedContext = { kernel32, advapi32, bind };
    return cachedContext;
}
function bindings() {
    if (cached !== undefined)
        return cached;
    const koffi = requireKoffi();
    const { PVOID, PPVOID, STARTUPINFOW, PROCESS_INFORMATION } = win32Types();
    const { kernel32, advapi32, bind } = bindingContext();
    const node = koffi.load(null);
    cached = {
        closeHandle: bind(kernel32, 'CloseHandle', 'int', [PVOID]),
        getLastError: bind(kernel32, 'GetLastError', 'uint32', []),
        getFileType: bind(kernel32, 'GetFileType', 'uint32', [PVOID]),
        formatMessageW: bind(kernel32, 'FormatMessageW', 'uint32', [
            'uint32', PVOID, 'uint32', 'uint32', PVOID, 'uint32', PVOID,
        ]),
        createPipe: bind(kernel32, 'CreatePipe', 'int', [PPVOID, PPVOID, PVOID, 'uint32']),
        setHandleInformation: bind(kernel32, 'SetHandleInformation', 'int', [PVOID, 'uint32', 'uint32']),
        createProcessAsUserW: bind(advapi32, 'CreateProcessAsUserW', 'int', [
            PVOID, 'str16', 'str16', PVOID, PVOID, 'int', 'uint32', PVOID, 'str16',
            koffi.pointer(STARTUPINFOW), koffi.pointer(PROCESS_INFORMATION),
        ]),
        createProcessW: bind(kernel32, 'CreateProcessW', 'int', [
            'str16', 'str16', PVOID, PVOID, 'int', 'uint32', PVOID, 'str16',
            koffi.pointer(STARTUPINFOW), koffi.pointer(PROCESS_INFORMATION),
        ]),
        readFile: bind(kernel32, 'ReadFile', 'int', [PVOID, PVOID, 'uint32', koffi.pointer('uint32'), PVOID]),
        peekNamedPipe: bind(kernel32, 'PeekNamedPipe', 'int', [
            PVOID, PVOID, 'uint32', koffi.pointer('uint32'), koffi.pointer('uint32'), koffi.pointer('uint32'),
        ]),
        waitForSingleObject: bind(kernel32, 'WaitForSingleObject', 'uint32', [PVOID, 'uint32']),
        getExitCodeProcess: bind(kernel32, 'GetExitCodeProcess', 'int', [PVOID, koffi.pointer('uint32')]),
        createJobObjectW: bind(kernel32, 'CreateJobObjectW', PVOID, [PVOID, 'str16']),
        setInformationJobObject: bind(kernel32, 'SetInformationJobObject', 'int', [PVOID, 'int', PVOID, 'uint32']),
        queryInformationJobObject: bind(kernel32, 'QueryInformationJobObject', 'int', [
            PVOID, 'int', PVOID, 'uint32', PVOID,
        ]),
        assignProcessToJobObject: bind(kernel32, 'AssignProcessToJobObject', 'int', [PVOID, PVOID]),
        resumeThread: bind(kernel32, 'ResumeThread', 'uint32', [PVOID]),
        terminateProcess: bind(kernel32, 'TerminateProcess', 'int', [PVOID, 'uint32']),
        terminateJobObject: bind(kernel32, 'TerminateJobObject', 'int', [PVOID, 'uint32']),
        getStdHandle: bind(kernel32, 'GetStdHandle', PVOID, ['int']),
        uvGetOsfhandle: node.func('uv_get_osfhandle', PVOID, ['int']),
    };
    return cached;
}
/**
 * Extend the shared process table with caller-owned Win32 API families.
 * @param create - binds only the caller-specific operations from the shared libraries.
 * @returns generic process bindings combined with the caller-specific operations.
 */
export function extendWin32ProcessBindings(create) {
    return { ...bindings(), ...create(bindingContext()) };
}
/**
 * Load the generic process binding table without policy-specific extensions.
 * @returns shared Win32 process, stdio, and Job operations.
 */
export function loadWin32ProcessBindings() {
    return bindings();
}
/* v8 ignore stop */
/**
 * Format a Win32 error code through FormatMessageW.
 * @param api - active binding table.
 * @param win32Code - captured GetLastError value.
 * @returns trimmed system message, or an empty string when unavailable.
 */
export function errorText(api, win32Code) {
    const buffer = Buffer.alloc(1024);
    const length = api.formatMessageW(abi.FORMAT_MESSAGE_FROM_SYSTEM | abi.FORMAT_MESSAGE_IGNORE_INSERTS, null, win32Code, 0, buffer, buffer.length / 2, null);
    return length === 0 ? '' : buffer.subarray(0, length * 2).toString('utf16le').trim();
}
/**
 * Throw the current GetLastError value.
 * @param api - active binding table.
 * @param name - failing Win32 operation.
 * @param detail - optional operation context.
 * @returns never; always throws Win32Error.
 */
export function throwLastError(api, name, detail) {
    const win32Code = api.getLastError();
    throw new Win32Error(name, win32Code, detail ?? errorText(api, win32Code));
}
/**
 * Throw an explicitly captured Win32 error code.
 * @param api - active binding table.
 * @param name - failing Win32 operation.
 * @param win32Code - error captured before cleanup.
 * @param detail - optional operation context.
 * @returns never; always throws Win32Error.
 */
export function throwWin32(api, name, win32Code, detail) {
    throw new Win32Error(name, win32Code, detail ?? errorText(api, win32Code));
}
//# sourceMappingURL=ffi.js.map