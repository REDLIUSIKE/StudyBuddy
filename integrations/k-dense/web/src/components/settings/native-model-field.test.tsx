import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NativeModelField } from './native-model-field';
const fixture = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/projects', () => ({ apiFetch: fixture.fetch, useProjectScopeId: () => 'study' }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it('shows exact native rows without a legacy provider probe or automatic choice', async () => {
  fixture.fetch.mockResolvedValue(new Response(JSON.stringify({ groups: [{ id: 'owned-route', name: 'StudyBuddy', models: [{ id: 'exact/model', name: 'Gateway model' }] }] })));
  const changed = vi.fn(); render(<NativeModelField label="专员模型" value="" emptyLabel="沿用原生会话模型" onChange={changed} />);
  await screen.findByRole('option', { name: 'Gateway model' }); expect(changed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'owned-route/exact/model' } }); expect(changed).toHaveBeenCalledWith('owned-route/exact/model');
  expect(fixture.fetch.mock.calls.map(call => call[0])).toEqual(['/research/models']);
});
it('keeps an unavailable saved choice and refuses malformed directory data', async () => {
  fixture.fetch.mockResolvedValue(new Response(JSON.stringify({ groups: [{ id: 'owned-route', name: 'StudyBuddy', models: 'invalid' }] })));
  const changed = vi.fn(); render(<NativeModelField label="专员模型" value="old-route/exact" onChange={changed} />);
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeNull());
  expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('old-route/exact'); expect(changed).not.toHaveBeenCalled();
});
