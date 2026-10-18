import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { HARNESS_TOOL_METHODS, HARNESS_SKILL_SAFETY_LABS_METHODS } from '@studybuddy/contracts'
import { createToolPageApi } from '../src/studybuddy/tool-center-preload.ts'
it('preserves native installation failure details as a transferable rejection value', async () => {
  const page=createToolPageApi({invoke:async()=>({ok:false,error:{code:'NATIVE_RESULT_UNKNOWN',message:'安装结果待确认',operationId:'fixture-operation'}}),on:()=>()=>{}})
  await expect(page.api.prepareToolInstallation('hermes')).rejects.toEqual({code:'NATIVE_RESULT_UNKNOWN',message:'安装结果待确认',operationId:'fixture-operation'})
  try{await page.state()}catch(error){expect(error).not.toBeInstanceOf(Error);expect(structuredClone(error)).toEqual(error)}
})
it('loads the sandboxed CommonJS preload emitted by the desktop build', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')
  expect(main).toMatch(/new URL\('\.\/preload-studybuddy-tools\.cjs',\s*import\.meta\.url\)/)
})
it('exposes the fixed named API without generic invocation, private grants, URLs or account capabilities', async () => {
  const calls: unknown[][] = [],
    listeners = new Map<string, (value: unknown) => void>()
  const transport = {
    invoke: async (channel: string, ...args: unknown[]) => {
      calls.push([channel, ...args])
      return {
        ok: true,
        data: channel.endsWith('page-state')
          ? {
            owner: {
              lease: 'private-lease',
              scope: { accountId: 'fixture-a', generation: 1 },
              moduleId: 'verified-module',
            },
            state: {
              scope: { accountId: 'fixture-a', generation: 1 },
              enabled: true,
              refreshRevision: 0,
              returnRevision: 0,
              theme: { mode: 'light', variables: {} },
            },
          }
          : [],
      }
    },
    on: (channel: string, callback: (value: unknown) => void) => {
      listeners.set(channel, callback)
      return () => {
        listeners.delete(channel)
      }
    },
  }
  const page = createToolPageApi(transport)
  expect(Object.keys(page.api).sort()).toEqual([...HARNESS_TOOL_METHODS, ...HARNESS_SKILL_SAFETY_LABS_METHODS, 'listenInstallEvents'].sort())
  expect(Reflect.has(page.api, 'invoke')).toBe(false)
  expect(Reflect.has(page, 'acquire')).toBe(false)
  await page.api.getNativeToolCatalog()
  expect(calls.at(-1)).toEqual(['studybuddy:tool-operation', 'private-lease', 'getNativeToolCatalog', []])
  await page.api.getConfigurationViews(undefined)
  expect(calls.at(-1)).toEqual(['studybuddy:tool-operation', 'private-lease', 'getConfigurationViews', []])
  await page.api.getConfigurationViews('workbuddy')
  expect(calls.at(-1)).toEqual(['studybuddy:tool-operation', 'private-lease', 'getConfigurationViews', ['workbuddy']])
  await page.api.prepareToolInstallation('openclaw')
  expect(calls.at(-1)).toEqual(['studybuddy:tool-operation', 'private-lease', 'prepareToolInstallation', ['openclaw']])
  expect(await page.state()).not.toHaveProperty('owner')
  const off = await page.api.listenInstallEvents(() => {})
  expect(listeners.size).toBe(1)
  off()
  expect(listeners.size).toBe(0)
})
