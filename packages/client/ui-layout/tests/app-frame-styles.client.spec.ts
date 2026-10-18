/** Windows shell actions stay in the native caption, outside either content column. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { transform } from 'lightningcss'
import { expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.module.css', import.meta.url)), 'utf8')
const captionCss = readFileSync(fileURLToPath(new URL('../src/client/AppFrame.caption.css', import.meta.url)), 'utf8')

function declarations(selector: string, source = css): Map<string, string> | undefined {
  for (const [, selectorList = '', body = ''] of source.replace(/\/\*[\s\S]*?\*\//g, ' ').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon !== -1) found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

it('centers Windows balance actions before the native minimize button and excludes window dragging', () => {
  const actions = declarations(':global([data-windows-titlebar]) .actions')
  expect(actions?.get('top')).toBe('calc((var(--dsh-windows-titlebar-height) - 28px) / 2)')
  expect(actions?.get('right')).toBe('var(--dsh-windows-caption-actions-right, 150px)')
  expect(declarations('html[data-windows-titlebar]', captionCss)?.get('--dsh-windows-caption-actions-right')).toBe(
    'calc(100% - env(titlebar-area-x, 0px) - env(titlebar-area-width, calc(100% - 138px)) + 12px)',
  )
  expect(declarations('.actions')?.get('-webkit-app-region')).toBe('no-drag')
  expect(declarations(':global([data-windows-titlebar][data-fullscreen]) .actions')?.get('right')).toBe('12px')
})

it('removes the old balance spacer from both Windows columns, leaving browser layout unchanged', () => {
  for (const column of ['centerCol', 'rightCol']) {
    expect(declarations(`:global([data-windows-titlebar]) .frame:has([data-shell-actions] > *) .${column}`)?.get('padding-top')).toBe('0')
    expect(declarations(`.frame:has([data-shell-actions] > *) .${column}`)?.get('padding-top')).toBe('36px')
  }
})

it('preserves native environment names in the global stylesheet and its CSS Modules reference', () => {
  const module = transform({
    filename: 'AppFrame.module.css', code: Buffer.from(css),
    cssModules: { pattern: '[hash]_[local]' }, minify: true,
  })
  const { code } = transform({ filename: 'AppFrame.caption.css', code: Buffer.from(captionCss), minify: true })
  expect(module.code.toString()).toContain('var(--dsh-windows-caption-actions-right,150px)')
  for (const name of ['titlebar-area-x', 'titlebar-area-width']) {
    expect(code.toString()).toContain(`env(${name},`)
    expect(module.exports).not.toHaveProperty(name)
  }
})
