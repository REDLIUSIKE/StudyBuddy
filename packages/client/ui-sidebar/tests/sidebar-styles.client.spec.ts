/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SidebarRoot.module.css', () => {
  it('covers upper navigation while growing the mounted workspace region and keeps the foot fixed', () => {
    const region = declarations('.regionExpanded')
    expect(region?.get('position')).toBe('relative')
    expect(region?.get('z-index')).toBe('1')
    expect(region?.get('background')).toBe('var(--dsw-specific-sidebar-fill)')
    expect(declarations('.footArea')?.get('flex')).toBe('none')
    expect(declarations('.regionArea')?.get('min-height')).toBe('0')
  })

  it('places the Windows toggle at the sidebar trailing edge without covering caption menus', () => {
    const toggle = declarations(':global([data-windows-titlebar]) .toggle')
    expect(toggle?.get('left')).toBe(
      'max(calc(var(--dsh-windows-sidebar-width) - 40px), calc(var(--dsh-windows-menu-start, 48px) + var(--dsh-windows-menu-width, 0px) + 8px))',
    )
    expect(toggle?.get('position')).toBe('fixed')
    expect(toggle?.get('-webkit-app-region')).toBe('no-drag')
    expect(declarations(':global([data-windows-titlebar]) .collapsed .toggle')?.get('left')).toBe(
      'calc(var(--dsh-windows-menu-start, 48px) + var(--dsh-windows-menu-width, 0px) + 8px)',
    )
  })

  it('leaves no empty mark seat beside a complete wordmark', () => {
    expect(declarations('.brandMark:empty')?.get('display')).toBe('none')
  })
  it('shares and cancels the wide shell trailing padding structurally', () => {
    const root = declarations('.root')
    expect(root?.get('--dsh-sidebar-inline-padding')).toBe('12px')
    expect(root?.get('padding')).toBe('6px var(--dsh-sidebar-inline-padding)')
    expect(declarations('.regionArea')?.get('margin-left')).toBe('-4px')
    expect(declarations('.regionArea')?.get('padding-left')).toBe('4px')
    expect(declarations('.regionArea')?.get('margin-right')).toBe(
      'calc(-1 * var(--dsh-sidebar-inline-padding))',
    )
    expect(declarations('.collapsed .regionArea')?.get('margin-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('padding-left')).toBe('0')
    expect(declarations('.collapsed .regionArea')?.get('margin-right')).toBe('0')
  })

  it('moves the four upper controls while the settings seat only fades', () => {
    const animation = 'rail-in 150ms var(--ds-ease-in-out) backwards'
    for (const selector of [
      '.railIn .iconButton',
      '.railIn .newSession',
      '.railIn .regionArea',
    ]) {
      expect(declarations(selector)?.get('animation')).toBe(animation)
    }
    expect(declarations('.railIn .footArea')?.get('animation')).toBe(
      'rail-fade-in 150ms var(--ds-ease-in-out) backwards',
    )
    expect(css).toMatch(
      /@keyframes rail-in\s*\{\s*from\s*\{\s*opacity: 0;\s*transform: translateX\(49px\);\s*}\s*}/,
    )
    expect(css).toMatch(/@keyframes rail-fade-in\s*\{\s*from\s*\{\s*opacity: 0;\s*}\s*}/)
  })

  it('gives shell rail controls the same base anchor for their shared translation', () => {
    expect(declarations('.collapsed .logoRow')?.get('justify-content')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('align-self')).toBe('flex-start')
    expect(declarations('.collapsed .newSession')?.get('width')).toBe('36px')
  })

  it('keeps the slotted brand row at the full artwork height', () => {
    expect(declarations('.root')?.get('--dsh-sidebar-brand-height')).toBe('36px')
    expect(declarations('.brandIdentity')?.get('height')).toBe('var(--dsh-sidebar-brand-height)')
    expect(declarations('.brandName')?.get('height')).toBe('var(--dsh-sidebar-brand-height)')
    expect(declarations('.brand')?.get('min-height')).toBe('calc(var(--dsh-sidebar-brand-height) + 2px)')
    expect(declarations(':global([data-windows-titlebar]) .root .logoRow')?.get('height')).toBe('40px')
    expect(declarations('.brandName')?.get('line-height')).toBe('24px')
    expect(declarations('.brandName')?.get('font-size')).toBe('18px')
    expect(declarations('.fallbackBrandName')?.get('font-size')).toBe('17px')
    expect(declarations('.fallbackBrandName')?.get('white-space')).toBe('nowrap')
  })
})
