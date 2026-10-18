/** Default model references remain live without a settings service. */
import { Context } from '@deepseek-ai/cordis'
import { expect, it, onTestFinished, vi } from 'vitest'
import DefaultModel, {currentAgentDefault} from '../src/index.ts'
import { liveConfig } from '../../../settings/settings/tests/live-config.ts'
import { configurationFixture } from '../../../settings/settings/tests/configuration-fixture.ts'
it('reads the actual inherited default from a live Agent scope without undeclared property injection',async()=>{
  const ctx=new Context();onTestFinished(()=>ctx.fiber.dispose())
  await liveConfig(ctx,DefaultModel,{provider:'exact-fixture-route',model:'exact-fixture-model'})
  let reading:()=>ReturnType<typeof currentAgentDefault>=()=>null
  await ctx.plugin({name:'native-agent-scope-fixture',apply(scope:Context){reading=()=>currentAgentDefault(scope)}})
  expect(reading()).toEqual({provider:'exact-fixture-route',model:'exact-fixture-model'})
})

it('reads complete selections from volatile config and clears omitted reasoning effort', async () => {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const live = await liveConfig(ctx, DefaultModel, { provider: 'p', model: 'm' })
  const consumer = ctx.agentDefaultModel
  await live.update({ provider: 'q', model: 'n', reasoningEffort: 'high' })
  expect(consumer.currentSelection()).toEqual({ provider: 'q', model: 'n', reasoningEffort: 'high' })
  await live.replace({ provider: 'p', model: 'm' })
  expect(consumer.currentSelection()).toEqual({ provider: 'p', model: 'm' })
  await consumer.saveSelection({ provider: 'unsaved', model: 'unsaved' })
  expect(consumer.currentSelection()).toEqual({ provider: 'p', model: 'm' })
})

it('supports explicit no-selection without choosing a model and preserves an existing saved default', async () => {
  const ctx = new Context(); onTestFinished(() => ctx.fiber.dispose())
  const live = await liveConfig(ctx, DefaultModel, { provider: '', model: '' })
  ctx.agentDefaultModel.requireExplicitSelection()
  expect(ctx.agentDefaultModel.explicitSelection).toBe(true)
  expect(ctx.agentDefaultModel.currentDefault()).toBeNull()
  expect(() => ctx.agentDefaultModel.currentSelection()).toThrow('MODEL_SELECTION_REQUIRED')
  await live.replace({ provider: 'owned-provider', model: 'exact-manual-model' })
  expect(ctx.agentDefaultModel.currentDefault()).toEqual({ provider: 'owned-provider', model: 'exact-manual-model' })
})
it('reads only its profile entry and leaves an inherited model preset unselected until an explicit save', async () => {
  const { ctx, start } = await configurationFixture({ hmr: false })
  const read = vi.spyOn(ctx.configEditor, 'configuration')
  ctx.agentDefaultModel.requireExplicitSelection({
    provider: id => id === 'owned', selection: value => value.provider === 'owned' &&
      value.model === 'exact-model',
  })
  expect(ctx.agentDefaultModel.currentDefault()).toBeNull()
  expect(read.mock.calls[0]![0]?.options.id).toBe('default-model')
  expect(read.mock.results[0]!.value).toHaveLength(1)
  expect(ctx.agentDefaultModel.selectionAllowed({ provider: 'test', model: 'original' })).toBe(false)
  expect(ctx.agentDefaultModel.selectionAllowed({ provider: 'owned', model: 'exact-model' })).toBe(true)
  await ctx.agentDefaultModel.saveSelection({ provider: 'owned', model: 'exact-model' })
  expect(ctx.agentDefaultModel.currentDefault()).toEqual({ provider: 'owned', model: 'exact-model' })
  await ctx.fiber.dispose()
  const restored = await start(); restored.agentDefaultModel.requireExplicitSelection()
  expect(restored.agentDefaultModel.currentDefault()).toEqual({ provider: 'owned', model: 'exact-model' })
  expect(restored.agentDefaultModel.selectionAllowed({ provider: 'owned', model: 'exact-model' })).toBe(false)
})

it('persists complete selections through its owning profile entry', async () => {
  const { ReasoningEffortId } = await import('@deepseek-ai/dsh-llm')
  const { ctx } = await configurationFixture({ hmr: false })
  await ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'next', reasoningEffort: ReasoningEffortId('high') })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'next', reasoningEffort: 'high' })
  await ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'final' })
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'final' })
  const standalone = new Context()
  onTestFinished(() => standalone.fiber.dispose())
  await standalone.plugin(DefaultModel, { provider: 'test', model: 'original' })
  await standalone.agentDefaultModel.saveSelection({ provider: 'test', model: 'ignored' })
  expect(standalone.agentDefaultModel.currentSelection().model).toBe('original')
})

it('serializes overlapping saves and continues after a rejected write', async () => {
  const { ctx } = await configurationFixture({ hmr: false })
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  const editor = ctx.configEditor
  const edit = editor.edit.bind(editor)
  const calls: string[] = []
  const intercepted = vi.spyOn(editor, 'edit').mockImplementationOnce(async () => {
    calls.push('rejected')
    entered.resolve(undefined)
    await release.promise
    throw new Error('read-only document')
  }).mockImplementation(async (entry, change) => {
    calls.push('saved')
    await edit(entry, change)
  })
  const first = ctx.agentDefaultModel.saveSelection({ provider: 'test', model: 'rejected' })
  const failed = expect(first).rejects.toThrow('read-only document')
  const lastSelection = { provider: 'test', model: 'final' }
  const last = ctx.agentDefaultModel.saveSelection(lastSelection)
  onTestFinished(async () => {
    release.resolve(undefined)
    await Promise.allSettled([failed, last])
    intercepted.mockRestore()
  })
  lastSelection.model = 'mutated'
  await entered.promise
  expect(calls).toEqual(['rejected'])
  release.resolve(undefined)
  await failed
  await last
  expect(calls).toEqual(['rejected', 'saved'])
  expect(ctx.agentDefaultModel.currentSelection()).toEqual({ provider: 'test', model: 'final' })
})
