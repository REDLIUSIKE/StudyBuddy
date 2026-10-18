/** Closed public workbench requests. Native Session membership remains checked by Main. */
import {researchOfficialLink} from './research-links.ts'
export type ResearchPageAction = { kind: 'open-project' | 'list-chats' | 'new-chat'; projectId: string }
  | { kind: 'select-chat' | 'close-chat'; projectId: string; sessionId: string }
  | { kind: 'reference'; projectId: string; path: string }
  | { kind: 'draft'; projectId: string; text: string; references: string[] }
  | { kind: 'show-models' | 'show-projects' }
  | {kind:'open-service-site';url:string}
/** Relative sandbox reference grammar shared by closed action validation. */
export function isResearchReference(value: unknown): value is string {
  return typeof value === 'string' && !!value && value.length < 4096 && !/[\\:\u0000]/.test(value) && !value.startsWith('/') && !value.split('/').some(part => !part || part === '.' || part === '..')
}
/** Parse the entire action before any binding, file read or native notification. */
export function parseResearchPageAction(value: unknown): ResearchPageAction {
  const invalid = (): never => { throw Error('RESEARCH_ACTION_INVALID') }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('kind' in value) || typeof value.kind !== 'string') return invalid()
  const row = value as Record<string, unknown>, kind = value.kind
  const fields: Record<string, string[]> = { 'open-project': ['kind', 'projectId'], 'list-chats': ['kind', 'projectId'], 'new-chat': ['kind', 'projectId'],
    'select-chat': ['kind', 'projectId', 'sessionId'], 'close-chat': ['kind', 'projectId', 'sessionId'], 'reference': ['kind', 'projectId', 'path'],
    'draft': ['kind', 'projectId', 'text', 'references'], 'show-models': ['kind'], 'show-projects': ['kind'],'open-service-site':['kind','url'] }
  const allowed = fields[kind]
  if (!allowed || Object.keys(row).length !== allowed.length || Object.keys(row).some(key => !allowed.includes(key))) return invalid()
  if (allowed.includes('projectId') && (typeof row.projectId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.projectId))) return invalid()
  if (allowed.includes('sessionId') && (typeof row.sessionId !== 'string' || !/^session-[a-f0-9-]{36}$/.test(row.sessionId))) return invalid()
  if (kind === 'reference' && !isResearchReference(row.path)) return invalid()
  if (kind === 'draft' && (typeof row.text !== 'string' || !row.text.trim() || row.text.length > 131072 || !Array.isArray(row.references) || row.references.length > 24 || !row.references.every(isResearchReference))) return invalid()
  if(kind==='open-service-site'){if(typeof row.url!=='string')return invalid();researchOfficialLink(row.url)}
  return structuredClone(row) as ResearchPageAction
}
