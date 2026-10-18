import { expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listAigcHistory, readAigcHistory, aigcHistoryContext } from '../src/studybuddy/aigc-history.ts'
it('reads the actual legacy branch without rewriting, executing tools or inventing native events', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aigc-history-')), dir = join(root, '.agent/sessions'); await mkdir(dir, { recursive: true })
  const content = [ { type: 'session', version: 3, id: 'old', cwd: root },
    { type: 'message', id: 'a', parentId: null, message: { role: 'user', content: 'Original user' } },
    { type: 'message', id: 'b', parentId: 'a', message: { role: 'assistant', content: [{ type: 'text', text: 'Abandoned branch' }] } },
    { type: 'message', id: 'c', parentId: 'a', message: { role: 'assistant', content: [{ type: 'toolCall', name: 'write', arguments: { path: 'forbidden' } }, { type: 'text', text: 'Current branch' }] } },
  ].map(row => JSON.stringify(row)).join('\n') + '\n'
  const file = join(dir, 'old.jsonl'); await writeFile(file, content)
  try {
    expect(await listAigcHistory(root)).toMatchObject([{ file: 'old.jsonl' }])
    const history = await readAigcHistory(root, 'old.jsonl')
    expect(history.messages).toHaveLength(2); expect(JSON.stringify(history.messages)).not.toContain('Abandoned branch')
    expect(history.allRecords).toHaveLength(4); expect(JSON.stringify(history.allRecords)).toContain('Abandoned branch')
    expect(aigcHistoryContext(history)).toContain('Current branch'); expect(aigcHistoryContext(history)).not.toContain('forbidden')
    expect(await readFile(file, 'utf8')).toBe(content)
    await expect(readAigcHistory(root, '../old.jsonl')).rejects.toThrow('AIGC_HISTORY_INVALID')
  } finally { await rm(root, { recursive: true, force: true }) }
})
