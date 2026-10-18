import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, it, vi, afterEach } from 'vitest';
import { useNativeWorkspace } from './use-native-workspace';
import { emptyNativeWorkspace } from './native-workspace-state';
const fetch = vi.hoisted(() => vi.fn());
vi.mock('./projects', () => ({ apiFetch: fetch }));
afterEach(() => { fetch.mockReset(); });
const etag = '"' + 'a'.repeat(64) + '"';
it('restores selected files once and coalesces pane drags into a versioned project save', async () => {
  const stored = { ...emptyNativeWorkspace(), sandbox: { openPaths: ['paper.tex'], activePath: 'paper.tex' } };
  fetch.mockImplementation(async (_path, init) => Response.json({ state: stored }, { headers: { etag: init?.method === 'PUT' ? '"' + 'b'.repeat(64) + '"' : etag } }));
  const hook = renderHook(() => useNativeWorkspace('study'));
  await waitFor(() => expect(hook.result.current.initial?.sandbox.activePath).toBe('paper.tex'));
  act(() => { hook.result.current.save({ ...stored, treeWidth: 250 }); hook.result.current.save({ ...stored, treeWidth: 300 }); });
  await waitFor(() => expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1));
  const saved = fetch.mock.calls.find(call => call[1]?.method === 'PUT')!;
  expect(saved[2]).toBe('study'); expect(saved[1].headers['If-Match']).toBe(etag); expect(JSON.parse(saved[1].body).treeWidth).toBe(300);
  hook.unmount();
});
it('does not silently overwrite or retry a stale saved view', async () => {
  fetch.mockImplementation(async (_path, init) => init?.method === 'PUT' ? Response.json({ detail: 'Changed' }, { status: 412 }) : Response.json({ state: null }, { headers: { etag } }));
  const hook = renderHook(() => useNativeWorkspace('study'));
  await waitFor(() => expect(hook.result.current.initial).toBeDefined());
  act(() => hook.result.current.save({ ...emptyNativeWorkspace(), treeWidth: 300 }));
  await waitFor(() => expect(hook.result.current.error).toBe('RESEARCH_UI_STATE_CHANGED'));
  act(() => hook.result.current.save({ ...emptyNativeWorkspace(), treeWidth: 350 }));
  await new Promise(resolve => setTimeout(resolve, 250));
  expect(fetch.mock.calls.filter(call => call[1]?.method === 'PUT')).toHaveLength(1); hook.unmount();
});
