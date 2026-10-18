import { afterEach, expect, it, vi } from 'vitest'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionEvent, SessionHeader } from '@deepseek-ai/dsh-session/types'
import { KNOWN_SESSION_EVENT_TYPES } from '../../../core/session/src/known-event-types.ts'
import type {} from '../../../sandbox/sandbox-policy/src/workspace-roots.ts'
import { SessionFormatUnsupportedError, validateStoredEvents } from '../src/index.ts'

afterEach(() => { vi.restoreAllMocks() })
const header: SessionHeader = { version: SESSION_FORMAT_VERSION, id: SessionId('project-roots'), createdAt: 0, isSeeded: false, cwd: '/main' }
function events(): SessionEvent[] {
  return [{ type: 'sandbox/workspace-roots', seq: 0, time: 0, data: { roots: ['/main', '/资料'] } } as SessionEvent]
}

it('the current vocabulary accepts frozen source records without making them ignorable', () => {
  const log = events()
  expect(validateStoredEvents(header, log)[0]?.type).toBe('sandbox/workspace-roots')
  expect(log[0]).not.toHaveProperty('ignorable')
})

it('an older vocabulary refuses required roots before adoption and leaves the input untouched', () => {
  const has = KNOWN_SESSION_EVENT_TYPES.has.bind(KNOWN_SESSION_EVENT_TYPES)
  vi.spyOn(KNOWN_SESSION_EVENT_TYPES, 'has').mockImplementation(type => type !== 'sandbox/workspace-roots' && has(type))
  const log = events()
  const original = JSON.stringify(log)
  expect(() => validateStoredEvents(header, log)).toThrow(SessionFormatUnsupportedError)
  expect(JSON.stringify(log)).toBe(original)
  expect(Object.isFrozen(log[0])).toBe(false)
})
