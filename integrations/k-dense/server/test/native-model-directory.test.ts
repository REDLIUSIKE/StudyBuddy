import { expect, it, vi } from 'vitest';
import { NativeModelDirectory } from '../src/runtime/native-model-directory.ts';
const catalog = { groups: [{ id: 'owned-route', name: 'StudyBuddy', models: [{ id: 'exact-model/id', name: 'Exact model' }] }], failures: [], default: null };
it('validates only exact rows from the existing native catalog, without inventing aliases or fallback', async () => {
  const request = vi.fn(async () => catalog), directory = new NativeModelDirectory({ current: () => true, request } as never);
  await directory.refresh('study'); expect(directory.available('owned-route/exact-model/id')).toBe(true);
  expect(directory.available('owned-route/exact-model')).toBe(false);
  await expect(directory.require('study', 'foreign/exact-model/id')).rejects.toThrow('RESEARCH_MODEL_UNAVAILABLE');
  expect(request.mock.calls.every(call => call[1] === 'model-catalog')).toBe(true);
});
it('fences a catalog response arriving after account revocation', async () => {
  let current = true; const directory = new NativeModelDirectory({ current: () => current, request: async () => { current = false; return catalog; } } as never);
  await expect(directory.refresh('study')).rejects.toThrow('RESEARCH_CONTEXT_REVOKED'); expect(directory.available('owned-route/exact-model/id')).toBe(false);
});
it('preserves exact native reasoning choices and rejects an invented default effort',async()=>{
 const raw={groups:[{id:'native',name:'Gateway',models:[{id:'exact',name:'Exact',reasoning:{efforts:[{id:'native-high',name:'High'}],defaultEffort:'native-high'}}]}]};
 const directory=new NativeModelDirectory({current:()=>true,request:async()=>raw} as never);expect((await directory.refresh('study')).groups[0].models[0].reasoning).toEqual(raw.groups[0].models[0].reasoning);
 raw.groups[0].models[0].reasoning.defaultEffort='invented';await expect(directory.refresh('study')).rejects.toThrow('RESEARCH_MODEL_CATALOG_INVALID');
});
