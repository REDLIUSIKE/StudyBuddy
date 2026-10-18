import { expect, it } from 'vitest'
import { caller, target, projectFixture } from './fixture.ts'
it('workspaceWriteLimitsAssociatedDomainResource', async () => {
  const { projects, port } = projectFixture(), signal = new AbortController().signal
  await expect(projects.assert(caller, target, 'execute')).rejects.toThrow('CAPABILITY_PROJECT_NOT_BOUND')
  expect(await projects.bind(caller, 'video', { action: 'attach', projectRef: target.projectRef }, signal)).toEqual(target)
  expect((await projects.assert(caller, target, 'execute')).port).toBe(port)
  await expect(projects.bind(caller, 'video', { action: 'attach', projectRef: 'foreign-project' }, signal)).rejects.toThrow('NOT_ADMITTED')
  await expect(projects.assert({ ...caller, callerSessionId: 'foreign' }, target, 'execute')).rejects.toThrow('CAPABILITY_PROJECT_NOT_BOUND')
})
it('readOnlyDoesNotCreateManagedDocument', async () => {
  const { projects, port } = projectFixture(true)
  await expect(projects.bind(caller, 'video', { action: 'create', title: '广告' }, new AbortController().signal)).rejects.toThrow('CAPABILITY_READ_ONLY')
  expect(port.create).not.toHaveBeenCalled()
})
