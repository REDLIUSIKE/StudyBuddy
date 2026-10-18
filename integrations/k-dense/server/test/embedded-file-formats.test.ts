import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { SessionManager, loadSkillsFromDir as upstreamSkills, getAgentDir as upstreamAgentDir } from '@earendil-works/pi-coding-agent';
const directories: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function temporary() { const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'research-format-')); directories.push(directory); return directory; }
test('skill discovery preserves YAML, ignore rules, root precedence and diagnostics without a Pi runtime', async () => {
  const { loadSkillsFromDir } = await import('../src/runtime/skill-files.ts');
  const directory = temporary();
  for (const name of ['science', 'ignored', 'missing-description']) fs.mkdirSync(path.join(directory, name));
  fs.writeFileSync(path.join(directory, '.gitignore'), 'ignored/\n');
  fs.writeFileSync(path.join(directory, 'science/SKILL.md'), '\uFEFF---\r\nname: science\r\ndescription: |\r\n  Scientific work\r\ndisable-model-invocation: true\r\n---\r\nBody');
  fs.writeFileSync(path.join(directory, 'science/nested.md'), '---\nname: nested\ndescription: hidden by root\n---\n');
  fs.writeFileSync(path.join(directory, 'ignored/SKILL.md'), '---\nname: ignored\ndescription: ignored\n---\n');
  fs.writeFileSync(path.join(directory, 'missing-description/SKILL.md'), '---\nname: missing-description\n---\n');
  expect(loadSkillsFromDir({ dir: directory, source: 'project' })).toEqual(upstreamSkills({ dir: directory, source: 'project' }));
});
test('legacy history metadata is read without creating a session or mutating stored JSONL', async () => {
  const { listStoredPiSessions } = await import('../src/agent/session-files.ts');
  const directory = temporary(), sessionsDir = path.join(directory, '.pi/sessions'); fs.mkdirSync(sessionsDir, { recursive: true });
  const file = path.join(sessionsDir, '2026-10-01_old.jsonl');
  const contents = [ { type: 'session', version: 3, id: 'old', cwd: directory, timestamp: '2026-10-01T00:00:00.000Z' }, { type: 'session_info', name: 'My research' }, { type: 'message', timestamp: '2026-10-02T00:00:00.000Z', message: { role: 'user', content: 'Read my paper', timestamp: 1790899200000 } }, { type: 'message', message: { role: 'assistant', content: [{ type: 'text', text: 'Observations' }], timestamp: 1790985600000 } } ].map(value => JSON.stringify(value)).join('\n') + '\n{partial';
  fs.writeFileSync(file, contents);
  expect(await listStoredPiSessions({ sandbox: directory, sessionsDir } as any)).toEqual(await SessionManager.list(directory, sessionsDir));
  expect(fs.readFileSync(file, 'utf8')).toBe(contents);
});
test('the locked workflow Worker runs offline and terminates a cancelled script', async () => {
  const { runWorkflowScript } = await import('../src/runtime/workflow-engine.ts');
  const result = await runWorkflowScript({ script: 'return { answer: 42 };', args: {}, processCwd: temporary(), launch: async () => { throw Error('No child expected'); } });
  expect(result.value).toEqual({ answer: 42 });
  const controller = new AbortController(); const run = runWorkflowScript({ script: 'while (true) {}', args: {}, processCwd: temporary(), signal: controller.signal, launch: async () => { throw Error('No child expected'); } });
  setTimeout(() => controller.abort(), 30); await expect(run).rejects.toThrow();
});
test('the standalone directory helper retains the original live environment and tilde contract', async () => {
  const { getAgentDir } = await import('../src/runtime/file-adapters.ts');
  vi.stubEnv('PI_CODING_AGENT_DIR', '~/live-format-directory');
  expect(getAgentDir()).toBe(upstreamAgentDir());
});
