// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ModelsSettings, type ModelsSettingsProps } from '../src/client/ModelsSettings.tsx'
import { SourceController } from '../src/client/source-controller.ts'
import { zh } from '../src/client/locales.ts'
afterEach(cleanup)

it('shows an empty account source list without a default provider and opens the shared source editor', () => {
  const unused = async (): Promise<never> => { throw new Error('UNUSED_FIXTURE_OPERATION') }
  const controller = new SourceController({ listNativeUserSources: unused, getNativeUserModels: unused,
    listNativeUserModelRegistrations: unused, checkNativeUserSource: unused, saveNativeUserSource: unused,
    resumeNativeUserSourceSave: unused, deleteNativeUserModel: unused, reorderNativeUserModels: unused,
    updateNativeUserModel: unused, pingNativeUserModel: unused, testNativeUserModel: unused, resumeNativeUserModelSave: unused })
  const scope = { accountId: 'fixture-owner', generation: 1 }
  controller.setScope(scope)
  const activate = vi.fn()
  function Panel() {
    return <ModelsSettings {...{ t: (key: keyof typeof zh) => zh[key], activate, source: controller,
      useAccount: (select: (state: unknown) => unknown) => select({ scope }),
      useSource: (select: (state: unknown) => unknown) => select(controller.getSnapshot()) } as unknown as ModelsSettingsProps} />
  }
  try {
    render(<Panel />)
    expect(activate).toHaveBeenCalledWith('sources')
    expect(screen.queryByText('DeepSeek')).toBeNull()
    expect(screen.queryByText(zh.sourceIntro)).toBeNull()
    expect(screen.queryByText(/与“我的 AI/)).toBeNull()
    expect(screen.getByText(zh.none)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: zh.addProvider }))
    expect(controller.getSnapshot().draft).not.toBeNull()
    expect(screen.getByRole('dialog', { name: zh.addSource })).toBeTruthy()
    expect(screen.getByLabelText(zh.key).getAttribute('type')).toBe('password')
  } finally { controller.dispose() }
})
