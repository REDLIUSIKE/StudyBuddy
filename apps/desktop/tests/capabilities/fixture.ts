import { vi, type Mock, type Mocked } from 'vitest'
import { CapabilityProjects, type CapabilityDomainPort, type CapabilityResourceAuthorizer } from '../../src/studybuddy/capabilities/projects.ts'
import { CapabilityGrantStore } from '../../src/studybuddy/capabilities/grants.ts'
export const caller = { scope: { accountId: '11111111-1111-4111-8111-111111111111', generation: 3 }, hostGeneration: '22222222-2222-4222-8222-222222222222', callerSessionId: 'session-a', workspaceId: null, toolCallId: 'call-a' }
export const target = { moduleId: 'video', projectRef: 'film-a' }
export function projectFixture(readOnly = false): { projects: CapabilityProjects; port: Mocked<CapabilityDomainPort>; authorize: Mock<CapabilityResourceAuthorizer> } {
  const port: Mocked<CapabilityDomainPort> = { id: 'video', revision: 'a'.repeat(64), describe: vi.fn(async () => ({})), list: vi.fn(async () => []),
    create: vi.fn(async () => ({ target, title: '测试工程' })), resolve: vi.fn(async (_caller: unknown, ref: string) => { if (ref !== target.projectRef) throw Error('NOT_ADMITTED'); return { target, title: '测试工程' } }),
    tools: vi.fn(async () => []), execute: vi.fn(async () => ({ data: { saved: true }, artifacts: [], operationRef: null })), status: vi.fn(async () => ({ data: {}, artifacts: [], operationRef: null })), cancel: vi.fn(async () => ({ data: {}, artifacts: [], operationRef: null })), release: vi.fn(async () => {}) }
  const authorize: Mock<CapabilityResourceAuthorizer> = vi.fn(async (_caller, effect) => { if (readOnly && effect !== 'read') throw Error('CAPABILITY_READ_ONLY') })
  const projects = new CapabilityProjects(new CapabilityGrantStore(), authorize); projects.register(port)
  return { projects, port, authorize }
}
