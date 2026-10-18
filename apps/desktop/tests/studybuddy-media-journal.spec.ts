import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {expect,it} from 'vitest';
const module=await import('../src/studybuddy/'+'media-journal.ts').catch(()=>({DiskMediaRequestJournal:class{claim(){return Promise.resolve({created:false,row:{feature:'missing'}});}get(){return Promise.resolve(null);}}}));
const row={schemaVersion:1 as const,accountId:'owned-account',sessionId:'session-a',requestId:'44444444-4444-4444-8444-444444444444',kind:'image' as const,modelId:'doubao-seedream-5-0-flash-260915',inputHash:'a'.repeat(64)};
it('claims a request exactly once under concurrent callers and restores it after opening the journal again',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sb-media-journal-')),journal=new module.DiskMediaRequestJournal(root);
 const claims=await Promise.all([journal.claim(row),journal.claim(row)]);expect(claims.filter(c=>c.created)).toHaveLength(1);
 expect(await new module.DiskMediaRequestJournal(root).get(row.accountId,row.requestId)).toEqual(row);
 expect(await journal.get('foreign-account',row.requestId)).toBeNull();
});
it('rejects traversal and extra persisted credential fields',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sb-media-journal-')),journal=new module.DiskMediaRequestJournal(root);
 await expect(journal.get(row.accountId,'../foreign')).rejects.toThrow('HARNESS_MEDIA_JOURNAL_INVALID');
 await expect(journal.claim({...row,apiKey:'forbidden'})).rejects.toThrow('HARNESS_MEDIA_JOURNAL_INVALID');
});
