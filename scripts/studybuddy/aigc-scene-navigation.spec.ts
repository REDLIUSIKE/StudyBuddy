import { expect, it } from 'vitest'
import { createRequire } from 'node:module'
const require = createRequire(new URL('../../integrations/toonflow/packages/nodes/director3dNode/package.json', import.meta.url))
const { PerspectiveCamera } = require('three')
const { createSceneNavigation } = await import(new URL('../../integrations/toonflow/packages/nodes/director3dNode/src/sceneNavigation.ts', import.meta.url).href)
it('moves and turns a scene camera without browser pointer lock', () => {
  const camera = new PerspectiveCamera(), navigation = createSceneNavigation(camera)
  navigation.move(0, 0, 1, 1)
  expect(camera.position.z).toBeCloseTo(-0.4)
  navigation.look(-Math.PI / 0.004, 0)
  navigation.move(0, 0, 1, 0.05)
  expect(camera.position.x).toBeLessThan(-0.39)
  expect(camera.position.z).toBeCloseTo(-0.4)
  navigation.move(0, 1, 0, 0.05)
  expect(camera.position.y).toBeCloseTo(0.4)
})
it('bounds vertical view and diagonal movement when a frame stalls', () => {
  const camera = new PerspectiveCamera(), navigation = createSceneNavigation(camera)
  navigation.look(0, 1e8)
  expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true)
  navigation.move(1, 1, 1, 10)
  expect(camera.position.length()).toBeCloseTo(0.4)
})
