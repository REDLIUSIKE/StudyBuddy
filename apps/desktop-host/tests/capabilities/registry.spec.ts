import { expect, it } from 'vitest'
import { documentAdapter } from './fixture.ts'
import { CapabilityRegistry } from '../../src/capabilities/registry.ts'

it('registersThirdAdapterWithoutDispatcherChange', () => {
  const registry = new CapabilityRegistry(), adapter = documentAdapter()
  const dispose = registry.register(adapter)
  expect(registry.get('novel')).toBe(adapter)
  expect(registry.ids()).toEqual(['novel'])
  dispose()
  expect(() => registry.get('novel')).toThrow('CAPABILITY_MODULE_UNAVAILABLE')
})
it('refusesDuplicateAndChangedSchema', () => {
  const registry = new CapabilityRegistry(), adapter = documentAdapter()
  registry.register(adapter)
  expect(() => registry.register(documentAdapter())).toThrow('CAPABILITY_MODULE_CONFLICT')
  expect(() => registry.get('novel', 'b'.repeat(64))).toThrow('CAPABILITY_MODULE_CHANGED')
  expect(Reflect.set(adapter,'revision','c'.repeat(64))).toBe(true)
  expect(() => registry.get('novel')).toThrow('CAPABILITY_MODULE_CHANGED')
})
