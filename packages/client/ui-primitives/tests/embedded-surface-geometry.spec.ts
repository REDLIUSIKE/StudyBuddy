// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { observeEmbeddedSurface, projectEmbeddedSurface } from '../src/embedded-surface-geometry.ts'
it('shows a surface inside its owning settings dialog and hides it beneath another dialog or menu',()=>{
  const owner=document.createElement('section'),container=document.createElement('div'),foreground=document.createElement('section')
  owner.setAttribute('role','dialog');owner.setAttribute('aria-modal','true');owner.append(container);document.body.append(owner)
  container.getBoundingClientRect=()=>({left:30,top:40,width:500,height:400})as DOMRect
  try{
    expect(projectEmbeddedSurface(container).visible).toBe(true)
    foreground.setAttribute('role','dialog');foreground.setAttribute('aria-modal','true');owner.append(foreground)
    expect(projectEmbeddedSurface(container).visible).toBe(false)
    foreground.removeAttribute('aria-modal');foreground.setAttribute('role','menu')
    expect(projectEmbeddedSurface(container).visible).toBe(false)
    foreground.hidden=true
    expect(projectEmbeddedSurface(container).visible).toBe(true)
    owner.remove()
    expect(projectEmbeddedSurface(container).visible).toBe(false)
  }finally{owner.remove()}
})
it('keeps viewport CSS bounds unchanged at zoom and hides for the actual wallet foreground selectors', async () => {
  const callbacks = new Set<FrameRequestCallback>()
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callbacks.add(callback)
    return callbacks.size
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  const container = document.createElement('div')
  document.body.append(container)
  container.getBoundingClientRect = () => ({ left: 10, top: 20, width: 400, height: 300 }) as DOMRect
  const values: { bounds: unknown; visible: boolean }[] = []
  const flush = () => {
    for (const callback of [...callbacks]) {
      callbacks.delete(callback)
      callback(0)
    }
  }
  const off = observeEmbeddedSurface(container, value => values.push(value))
  flush()
  expect(values.at(-1)).toEqual({ bounds: { x: 10, y: 20, width: 400, height: 300 }, visible: true })
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  document.body.append(overlay)
  await Promise.resolve()
  flush()
  expect(values.at(-1)?.visible).toBe(false)
  overlay.remove()
  await Promise.resolve()
  flush()
  expect(values.at(-1)?.visible).toBe(true)
  container.remove()
  await Promise.resolve()
  flush()
  expect(values.at(-1)?.visible).toBe(false)
  off()
  vi.unstubAllGlobals()
})
