// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { SurfaceVisibilityProvider } from '../src/surface-visibility.tsx'
import { Modal } from '../src/Modal.tsx'
import { Menu } from '../src/Menu.tsx'
afterEach(cleanup)
it('withdraws a retained modal interaction layer while preserving entered form values', () => {
  const close = vi.fn(), form = (visible: boolean) => <SurfaceVisibilityProvider visible={visible}><Modal open onClose={close} title="Pending research question" closeLabel="Close"><input aria-label="Research answer" defaultValue="" /></Modal></SurfaceVisibilityProvider>
  const view = render(form(true))
  fireEvent.change(screen.getByLabelText('Research answer'), { target: { value: 'An unsent answer' } })
  view.rerender(form(false))
  expect(screen.queryByRole('dialog')).toBeNull(); fireEvent.keyDown(document, { key: 'Escape' }); expect(close).not.toHaveBeenCalled()
  view.rerender(form(true)); expect((screen.getByLabelText('Research answer') as HTMLInputElement).value).toBe('An unsent answer')
})
it('closes only the ephemeral menu when its retained surface becomes inactive', async () => {
  const close = vi.fn(), menu = (visible: boolean) => <SurfaceVisibilityProvider visible={visible}><Menu open portal anchor={<button>Model menu</button>} items={[{ id: 'item', label: 'Available model' }]} onClose={close} /></SurfaceVisibilityProvider>
  const view = render(menu(true)); expect(screen.getByRole('menu').isConnected).toBe(true)
  view.rerender(menu(false)); await waitFor(() => expect(close).toHaveBeenCalledOnce()); expect(screen.queryByRole('menu')).toBeNull()
})
