'use client';
/** Settings use exact rows from the same Harness catalog as the native composer. */
import { useEffect, useState } from 'react';
import { apiFetch, useProjectScopeId } from '@/lib/projects';
interface Group { id: string; name: string; models: { id: string; name: string }[] }
export interface NativeModelFieldProps { id?: string; label: string; value: string; onChange(value: string): void; emptyLabel?: string; disabled?: boolean; className?: string }
export function NativeModelField({ id, label, value, onChange, emptyLabel, disabled, className }: NativeModelFieldProps) {
  const projectId = useProjectScopeId(), [groups, setGroups] = useState<Group[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setGroups([]);
    void apiFetch('/research/models', { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok || !body || !Array.isArray(body.groups) || body.groups.length > 128 || body.groups.some((group: Group) => !group || typeof group.id !== 'string' || typeof group.name !== 'string' || !Array.isArray(group.models) || group.models.length > 4096 || group.models.some(model => !model || typeof model.id !== 'string' || typeof model.name !== 'string'))) throw Error(body?.detail ?? '模型目录暂不可用');
      if (!controller.signal.aborted) setGroups(body.groups);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '模型目录暂不可用'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [projectId]);
  const available = groups.some(group => group.models.some(model => `${group.id}/${model.id}` === value));
  return <div className={className}>
    <select id={id} aria-label={label} value={value} disabled={disabled || loading || !!error} className="h-8 w-full rounded-md border bg-background px-2 text-xs" onChange={event => onChange(event.target.value)}>
      <option value="" disabled={!emptyLabel}>{loading ? '正在读取 StudyBuddy 模型目录…' : emptyLabel ?? '选择 StudyBuddy 模型'}</option>
      {value && !available && <option value={value} disabled>{value} · 当前未授权或不可用</option>}
      {groups.map(group => <optgroup key={group.id} label={group.name}>{group.models.map(model => <option key={model.id} value={`${group.id}/${model.id}`}>{model.name}</option>)}</optgroup>)}
    </select>
    {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
  </div>;
}
