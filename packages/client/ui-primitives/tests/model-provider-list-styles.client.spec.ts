import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const providerCss = readFileSync(new URL('../src/ModelProviderList.module.css', import.meta.url), 'utf8')
const accountCss = readFileSync(new URL('../../ui-studybuddy-account/src/client/MyAiPanel.module.css', import.meta.url), 'utf8')
function rule(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const found = [...css.matchAll(new RegExp('^' + escaped + ' \\{([^}]*)\\}', 'gm'))]
  if (!found.length) throw new Error('Missing stylesheet rule: ' + selector)
  return found.map(match => match[1]!).join('\n')
}
it('keeps native compact edit controls and a full-width dashed provider entry', () => {
  expect(rule(providerCss, '.rows')).toContain('flex-direction: column')
  expect(rule(providerCss, '.rowActions > button')).toContain('height: 28px')
  expect(rule(providerCss, '.rowActions > button')).toContain('font-size: 12px')
  expect(rule(providerCss, '.addActions')).toContain('display: flex')
  const add = rule(providerCss, '.addButton')
  expect(add).toContain('flex: 1 1 0')
  expect(add).toContain('height: 44px')
  expect(add).toContain('border: 1px dashed var(--dsw-alias-border-l3)')
})
it('allows long source names to wrap without displacing the edit control', () => {
  expect(rule(providerCss, '.rowSummary')).toContain('min-width: 0')
  expect(rule(providerCss, '.rowIdentity')).toContain('flex-wrap: wrap')
  expect(rule(providerCss, '.rowName')).toContain('overflow-wrap: anywhere')
  expect(rule(providerCss, '.rowActions')).toContain('flex: none')
})
it('uses native panel material and viewport-bounded scrollable source dialogs', () => {
  const panel = rule(accountCss, '.sourcesPanel')
  expect(panel).toContain('background:var(--dsw-alias-bg-layer-2)')
  expect(panel).toContain('border-radius:var(--dsw-radius-panel)')
  expect(panel).toContain('box-shadow:var(--dsw-elevation-prominent)')
  expect(panel).toContain('width:min(800px,100%)')
  expect(rule(accountCss, '.sourceDialog')).toContain('max-height:100%')
  expect(rule(accountCss, '.sourceDialogContent')).toContain('overflow-y:auto')
  expect(providerCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
})
