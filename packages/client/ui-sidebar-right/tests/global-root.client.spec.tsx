// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { ComponentProps } from 'react'
import { RightbarRoot } from '../src/client/shell/RightbarRoot.tsx'

afterEach(cleanup)
it('renders a keyed global panel while a non-conversation main page remains selected', () => {
  const props = {
    width: 440, viewportWidth: 1280, canShow: true,
    usePanelInfo: (select: (value: unknown) => unknown) => select({ activePanelId: 'studybuddy.tools' }),
    useActiveSession: (select: (value: unknown) => unknown) => select(undefined),
    useViews: (select: (value: unknown) => unknown) => select([]),
    useGlobalPanel: (select: (value: unknown) => unknown) => select('studybuddy.prompts'),
    renderSlot: (_key: string, _owner: unknown, options?: { entryKey?: string }) => options?.entryKey === 'studybuddy.prompts' ? <div>Prompt content</div> : null,
  } as ComponentProps<typeof RightbarRoot>
  render(<RightbarRoot {...props} />)
  expect(screen.getByText('Prompt content')).toBeTruthy()
})
