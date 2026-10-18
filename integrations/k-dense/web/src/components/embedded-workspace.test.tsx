import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { EmbeddedWorkspace } from './embedded-workspace';

vi.mock('./project-view', () => ({ ProjectView: ({ onOpenProject }: { onOpenProject(id: string): void }) => <button onClick={() => onOpenProject('study')}>打开项目</button> }));
vi.mock('./project-switcher', () => ({ ProjectSwitcher: () => null }));
vi.mock('./sandbox-panel', () => ({ FileTreePanel: () => null }));
vi.mock('./lazy-surfaces', () => ({ FilePreviewPanel: () => null, SettingsDialog: () => null, WorkflowsPanel: () => null }));
vi.mock('./research-toolbar', () => ({ ResearchToolbar: () => null }));
vi.mock('./native-dictation', () => ({ NativeDictation: () => null }));
vi.mock('@/lib/projects', () => ({ ProjectScopeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/lib/use-projects', () => ({ useProjects: () => ({ activeProjectId: 'study', projects: [{ id: 'study' }], loading: false }) }));
vi.mock('@/lib/use-sandbox', () => ({ useSandbox: () => ({ tree: null, tabs: [], activeTabPath: null }), flattenFiles: () => [], flattenFolders: () => [] }));
vi.mock('@/lib/use-native-workspace', () => ({ useNativeWorkspace: () => ({ initial: { schemaVersion: 1, view: 'files', treeOpen: true, treeWidth: 224, sandbox: { openPaths: [], activePath: null } }, save() {} }) }));
vi.mock('@/lib/use-native-notebook', () => ({ useNativeNotebook: () => [] }));
vi.mock('@/lib/settings-nav', () => ({ onOpenSettings: () => () => {} }));
vi.mock('@/lib/runtime-profile', () => ({ runtimeProfile: () => 'studybuddy' }));
afterEach(() => { cleanup(); Reflect.deleteProperty(window, 'researchHost'); });

it('removes the last closed tab, keeps its history entry, and creates a replacement only after New is clicked', async () => {
  const sessionId = 'session-11111111-1111-4111-8111-111111111111', nextId = 'session-22222222-2222-4222-8222-222222222222';
  const original = { sessionId, label: '研究对话 1', closed: false };
  const open = { projectId: 'study', sessionId, chats: [original] };
  const request = vi.fn().mockResolvedValueOnce(open)
    .mockResolvedValueOnce({ projectId: 'study', sessionId: null, chats: [{ ...original, closed: true }], intents: [] })
    .mockResolvedValueOnce(open)
    .mockResolvedValueOnce({ projectId: 'study', sessionId: nextId, chats: [original, { sessionId: nextId, label: '研究对话 2', closed: false }] });
  Reflect.set(window, 'researchHost', { request });
  render(<EmbeddedWorkspace />);
  fireEvent.click(screen.getByRole('button', { name: '打开项目' }));
  await screen.findByRole('button', { name: '研究对话 1' });
  fireEvent.click(screen.getByRole('button', { name: '关闭 研究对话 1' }));
  await waitFor(() => expect(screen.queryByRole('button', { name: '研究对话 1' })).toBeNull());
  expect(screen.queryByRole('button', { name: '研究对话 2' })).toBeNull();
  expect(screen.getByRole('option', { name: '研究对话 1' })).toBeDefined();
  expect(request.mock.calls.filter(([action]) => action.kind === 'new-chat')).toHaveLength(0);
  fireEvent.change(screen.getByRole('combobox', { name: '重开历史对话' }), { target: { value: sessionId } });
  await screen.findByRole('button', { name: '研究对话 1' });
  fireEvent.click(screen.getByRole('button', { name: '＋ 新对话' }));
  await screen.findByRole('button', { name: '研究对话 2' });
  expect(request.mock.calls.filter(([action]) => action.kind === 'new-chat')).toHaveLength(1);
});
