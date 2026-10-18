/**
 * Windows: the programs a Node program of the app starts get no window of their own. The app's Node (Electron as Node)
 * has no console, so a console program it starts (`claude auth status`, `codex app-server` through cmd.exe) opens a
 * console window unless asked not to, and the agents' adapters do not ask. as-node.mjs makes every child_process
 * function take `windowsHide: true` unless it is given otherwise, before the adapter is loaded. A window someone has
 * to see (a sign-in) is opened by the app itself, not from there. Reads no Electron module, so `node --test` can use it.
 */
import { syncBuiltinESMExports } from 'node:module';
import { promisify } from 'node:util';

const NAMES = ['spawn', 'spawnSync', 'execFile', 'execFileSync', 'exec', 'execSync', 'fork'];

/**
 * A child_process call's arguments with `windowsHide: true` in its options: the options given (a plain object after the
 * program) get it unless they say otherwise; with none, options are put in before the callback, or at the end.
 */
export function withWindowsHide(args) {
  const at = args.findIndex((a, i) => i > 0 && a !== null && typeof a === 'object' && !Array.isArray(a));
  if (at >= 0) return args.map((a, i) => (i === at ? { windowsHide: true, ...a } : a));
  const callback = args.findIndex((a, i) => i > 0 && typeof a === 'function');
  const out = [...args];
  out.splice(callback >= 0 ? callback : out.length, 0, { windowsHide: true });
  return out;
}

/** Every child_process function of `childProcess` (node:child_process) given `windowsHide: true` unless told otherwise. */
export function hideChildWindows(childProcess) {
  for (const name of NAMES) {
    const original = childProcess[name];
    if (typeof original !== 'function' || original.hidesWindows) continue;
    const hidden = Object.assign(function (...args) { return original.apply(this, withWindowsHide(args)); }, { hidesWindows: true });
    /* `promisify(execFile)` resolves { stdout, stderr } through its own custom form: kept, with the same options */
    const custom = original[promisify.custom];
    if (typeof custom === 'function') hidden[promisify.custom] = (...args) => custom(...withWindowsHide(args));
    childProcess[name] = hidden;
  }
  /* `import { spawn } from 'node:child_process'` sees the new ones too */
  syncBuiltinESMExports();
}
