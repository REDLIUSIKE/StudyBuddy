// @vitest-environment jsdom
import { expect,it,vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { resolveSlotLabel } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import * as module from '../src/client/index.ts'
it('provides a settings-only support plugin entry',()=>{
  expect(Reflect.get(module,'apply')).toBeTypeOf('function');expect(Object.keys(module).sort()).toEqual(['apply','inject'])
})
it('registers localized help and About sections after existing settings without a sidebar entry',async()=>{
  const ctx=new Context();vi.stubGlobal('studybuddy',undefined)
  await ctx.plugin(SlotRegistry).await();const locale=new LocaleRuntime(ctx);ctx.provide('locale',locale)
  const remove=ctx.slots.register({ name:'root',children:{ 'settings.section':{ kind:'list',scope:'root' },'sidebar.panellist':{ kind:'list',scope:'root' } } },(_props: PropsRenderSlots<'settings.section' | 'sidebar.panellist'>)=>null)
  try{
    await ctx.plugin(module).await();const rows=ctx.slots.entries('settings.section')
    expect(rows).toHaveLength(2);expect(rows[0]?.options.id).toBe('help-feedback');expect(rows[0]?.options.order).toBe(1000)
    expect(rows[1]?.options.id).toBe('about-studybuddy');expect(rows[1]?.options.order).toBe(1100)
    locale.setLocale('zh');expect(rows.map(row=>resolveSlotLabel(row.options.label))).toEqual(['帮助与反馈','关于 StudyBuddy'])
    locale.setLocale('en');expect(rows.map(row=>resolveSlotLabel(row.options.label))).toEqual(['Help & feedback','About StudyBuddy'])
    expect(ctx.slots.entries('sidebar.panellist')).toHaveLength(0)
  }finally{remove();await ctx.fiber.dispose();vi.unstubAllGlobals()}
})
