/** Project-local file/pane state, independent of the temporary loopback origin or native model authority. */
export interface NativeWorkspaceState {
  schemaVersion: 1; view: 'files' | 'workflows' | 'notebook' | 'compute' | 'automation'; treeOpen: boolean; treeWidth: number;
  sandbox: { openPaths: string[]; activePath: string | null };
}
export const emptyNativeWorkspace = (): NativeWorkspaceState => ({ schemaVersion: 1, view: 'files', treeOpen: true, treeWidth: 224, sandbox: { openPaths: [], activePath: null } });
/** Validate stored state and preserve exact relative file references. */
export function parseNativeWorkspaceState(value: unknown): NativeWorkspaceState {
  const invalid = (): never => { throw Error('RESEARCH_UI_STATE_INVALID'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const row = value as NativeWorkspaceState;
  if (Object.keys(row).length !== 5 || row.schemaVersion !== 1 || !['files', 'workflows', 'notebook', 'compute', 'automation'].includes(row.view) || typeof row.treeOpen !== 'boolean' || !Number.isFinite(row.treeWidth) || row.treeWidth < 144 || row.treeWidth > 640 ||
    !row.sandbox || typeof row.sandbox !== 'object' || Object.keys(row.sandbox).length !== 2 || !Array.isArray(row.sandbox.openPaths) || row.sandbox.openPaths.length > 10) return invalid();
  const relative = (path: unknown): path is string => typeof path === 'string' && !!path && path.length < 4096 && !/[\\:\u0000]/.test(path) && !path.startsWith('/') && !path.split('/').some(part => !part || part === '.' || part === '..');
  if (!row.sandbox.openPaths.every(relative) || new Set(row.sandbox.openPaths).size !== row.sandbox.openPaths.length || (row.sandbox.activePath !== null && !row.sandbox.openPaths.includes(row.sandbox.activePath))) return invalid();
  return { schemaVersion: 1, view: row.view, treeOpen: row.treeOpen, treeWidth: row.treeWidth, sandbox: { openPaths: [...row.sandbox.openPaths], activePath: row.sandbox.activePath } };
}
