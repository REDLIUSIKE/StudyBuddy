import { expect, it } from 'vitest'
import { windowsAppUpdateConfiguration } from '../scripts/windows-update-config.mjs'
import { STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER } from '../scripts/studybuddy-evsign.mjs'
it('retains the real product updater cache and approved publisher when resuming a prepared installer', () => {
  expect(windowsAppUpdateConfiguration({ productName: 'StudyBuddy', publish: [{ provider: 'generic', url: 'https://updates.example.com/feed/', channel: 'latest' }] },
    { name: '@deepseek-ai/dsh-desktop', version: '1.0.2' })).toEqual({ provider: 'generic', url: 'https://updates.example.com/feed/', channel: 'latest',
    updaterCacheDirName: '@deepseek-aidsh-desktop-updater', publisherName: [STUDYBUDDY_WINDOWS_UPDATE_PUBLISHER] })
  expect(() => windowsAppUpdateConfiguration({ publish: [] }, { name: 'fixture', version: '1.0.2' })).toThrow(/one fixed/)
})
