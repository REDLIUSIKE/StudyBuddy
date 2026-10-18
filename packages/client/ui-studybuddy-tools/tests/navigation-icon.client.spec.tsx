// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { IconCordisPluginOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { ToolsPanelIcon } from '../src/client/ToolCenterPanel.tsx'

it('gives tool management a distinct decorative glyph at the navigation size', () => {
  const icon = renderToStaticMarkup(<ToolsPanelIcon size={16} />)
  expect(icon).not.toBe(renderToStaticMarkup(<IconCordisPluginOutlineRegular size={16} />))
  expect(icon).toContain('width="16"')
  expect(icon).toContain('height="16"')
  expect(icon).toContain('aria-hidden="true"')
})
