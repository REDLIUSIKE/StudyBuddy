"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from './projects';
import { emptyNativeWorkspace, parseNativeWorkspaceState, type NativeWorkspaceState } from './native-workspace-state';
/** Hydrate once and serialize strong-version saves without reloading mounted editors. */
export function useNativeWorkspace(projectId: string) {
  const [initial, setInitial] = useState<NativeWorkspaceState>(), [error, setError] = useState<string>(), [revision, setRevision] = useState(0);
  const owner = useRef<{ controller: AbortController; etag?: string; latest?: NativeWorkspaceState; chain: Promise<void>; blocked: boolean; timer?: ReturnType<typeof setTimeout> } | undefined>(undefined);
  useEffect(() => {
    const row = { controller: new AbortController(), chain: Promise.resolve(), blocked: false } as NonNullable<typeof owner.current>;
    owner.current = row; setError(undefined);
    void apiFetch('/research/workspace', { signal: row.controller.signal }, projectId).then(async response => {
      if (!response.ok) throw Error('RESEARCH_UI_STATE_LOAD_FAILED');
      const etag = response.headers.get('etag'); if (!etag || !/^"[a-f0-9]{64}"$/.test(etag)) throw Error('RESEARCH_UI_STATE_INVALID');
      const value = await response.json() as { state: unknown }, state = value.state === null ? emptyNativeWorkspace() : parseNativeWorkspaceState(value.state);
      if (owner.current !== row || row.controller.signal.aborted) return;
      row.etag = etag; row.latest = state; setInitial(state);
    }).catch(error => { if (owner.current === row && !row.controller.signal.aborted) setError(error instanceof Error ? error.message : 'RESEARCH_UI_STATE_LOAD_FAILED'); });
    return () => { if (row.timer) clearTimeout(row.timer); row.controller.abort(); if (owner.current === row) owner.current = undefined; };
  }, [projectId, revision]);
  const save = useCallback((state: NativeWorkspaceState) => {
    const row = owner.current; if (!row || !row.etag || row.blocked || row.controller.signal.aborted) return;
    const next = parseNativeWorkspaceState(state);
    if (JSON.stringify(next) === JSON.stringify(row.latest)) return; row.latest = next;
    if (row.timer) clearTimeout(row.timer);
    row.timer = setTimeout(() => { row.timer = undefined; row.chain = row.chain.then(async () => {
      if (row.controller.signal.aborted || owner.current !== row || row.blocked) return;
      const response = await apiFetch('/research/workspace', { method: 'PUT', signal: row.controller.signal, headers: { 'Content-Type': 'application/json', 'If-Match': row.etag! }, body: JSON.stringify(next) }, projectId);
      if (!response.ok) throw Error(response.status === 412 ? 'RESEARCH_UI_STATE_CHANGED' : 'RESEARCH_UI_STATE_SAVE_FAILED');
      const etag = response.headers.get('etag'); if (!etag || !/^"[a-f0-9]{64}"$/.test(etag)) throw Error('RESEARCH_UI_STATE_INVALID'); row.etag = etag;
    }).catch(error => { row.blocked = true; if (owner.current === row && !row.controller.signal.aborted) setError(error instanceof Error ? error.message : 'RESEARCH_UI_STATE_SAVE_FAILED'); }); }, 200);
  }, [projectId]);
  return { initial, save, error, retry: () => setRevision(value => value + 1) };
}
