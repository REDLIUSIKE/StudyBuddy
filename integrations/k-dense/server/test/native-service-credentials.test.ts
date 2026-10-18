import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeServiceCredentials } from '../src/runtime/native-service-credentials.ts';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); vi.unstubAllEnvs(); });
function setup(options: { current?: () => boolean; modal?: (id: string, secret: string) => Promise<void> } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-services-')); roots.push(root);
  return { root, store: new NativeServiceCredentials({ file: path.join(root, 'services.json'), current: options.current ?? (() => true),
    validateModal: options.modal ?? vi.fn(async () => {}), validatePaperclip: vi.fn(async () => {}) }) };
}
it('rejects model keys and arbitrary fields without storing any part of the change', async () => {
  const { root, store } = setup();
  await expect(store.update({ exaApiKey: 'exa-real-fixture', deepseekApiKey: 'not-allowed' })).rejects.toThrow('RESEARCH_SERVICE_FIELD_INVALID');
  expect(fs.existsSync(path.join(root, 'services.json'))).toBe(false);
});
it('persists one account credential pair, returns only masked state and ignores ambient credentials', async () => {
  vi.stubEnv('MODAL_TOKEN_ID', 'ambient-other-account');
  const { root, store } = setup(); expect(store.status().modalTokenId?.set).toBe(false);
  const result = await store.update({ modalTokenId: 'fixture-token-id', modalTokenSecret: 'fixture-secret-value' });
  expect(result.modalTokenId?.set).toBe(true); expect(JSON.stringify(result)).not.toContain('fixture-secret-value');
  expect(fs.existsSync(path.join(root, '.env'))).toBe(false);
  const resumed = new NativeServiceCredentials({ file: path.join(root, 'services.json'), current: () => true, validateModal: async () => {}, validatePaperclip: async () => {} });
  expect(resumed.status()).toEqual(result);
});
it('rejects half a Modal pair and failed validation before changing persisted credentials', async () => {
  const modal = vi.fn(async () => { throw Error('Credentials rejected'); }); const { root, store } = setup({ modal });
  await expect(store.update({ modalTokenId: 'fixture-token-id' })).rejects.toThrow('RESEARCH_MODAL_PAIR_REQUIRED');
  expect(modal).not.toHaveBeenCalled();
  await expect(store.update({ modalTokenId: 'fixture-token-id', modalTokenSecret: 'fixture-secret-value' })).rejects.toThrow('Credentials rejected');
  expect(fs.existsSync(path.join(root, 'services.json'))).toBe(false);
});
it('rejects revocation during credential validation and does not apply a late result', async () => {
  let current = true; const { root, store } = setup({ current: () => current, modal: async () => { current = false; } });
  await expect(store.update({ modalTokenId: 'fixture-token-id', modalTokenSecret: 'fixture-secret-value' })).rejects.toThrow('RESEARCH_CONTEXT_REVOKED');
  expect(fs.existsSync(path.join(root, 'services.json'))).toBe(false);
});
it('clearing credentials persists their absence and removes only the owned environment variables', async () => {
  const { store } = setup(); vi.stubEnv('UNRELATED_SETTING', 'preserved');
  await store.update({ modalTokenId: 'fixture-token-id', modalTokenSecret: 'fixture-secret-value' });
  await store.update({ modalTokenId: null, modalTokenSecret: null });
  expect(store.status().modalTokenId?.set).toBe(false); expect(process.env.MODAL_TOKEN_ID).toBeUndefined(); expect(process.env.UNRELATED_SETTING).toBe('preserved');
});
it('keeps all six credentials independent, persists provider choices and migrates old stores', async () => {
  const {root,store}=setup();
  await store.update({exaApiKey:'exa-own-fixture',paperclipApiKey:'gxl-own-fixture',modalTokenId:'modal-own-id',modalTokenSecret:'modal-own-secret'});
  await store.update({autodlToken:'autodl-own-token',metasoApiKey:'metaso-own-key',bochaApiKey:'bocha-own-key'});
  await store.select({compute:'autodl',academic:'metaso',web:'bocha'});
  expect(store.selection()).toEqual({compute:'autodl',academic:'metaso',web:'bocha'});
  expect(store.status().exa?.set).toBe(true);expect(store.status().modalTokenSecret?.set).toBe(true);
  const reopened=new NativeServiceCredentials({file:path.join(root,'services.json'),current:()=>true,validateModal:async()=>{},validatePaperclip:async()=>{}});
  expect(reopened.selection()).toEqual(store.selection()); expect(reopened.secret('bochaApiKey')).toBe('bocha-own-key');
  await expect(store.select({compute:'unknown'})).rejects.toThrow('RESEARCH_SERVICE_SELECTION_INVALID');
  await store.update({bochaApiKey:null});expect(store.selection().web).toBe('bocha');expect(()=>store.secret('bochaApiKey')).toThrow('RESEARCH_SERVICE_CREDENTIAL_REQUIRED');
  fs.writeFileSync(path.join(root,'old.json'),JSON.stringify({schemaVersion:1,values:{exaApiKey:'old-exa-fixture'}}));
  const old=new NativeServiceCredentials({file:path.join(root,'old.json'),current:()=>true,validateModal:async()=>{},validatePaperclip:async()=>{}});
  expect(old.selection()).toEqual({compute:'modal',academic:'paperclip',web:'exa'});expect(old.secret('exaApiKey')).toBe('old-exa-fixture');
});
