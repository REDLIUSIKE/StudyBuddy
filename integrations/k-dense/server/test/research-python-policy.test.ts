import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { runHelperScript } from '../src/api/sci-helpers.ts';

const temporary: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true }); });
function interpreterFixture(profile: string) {
  const python = process.env.KADY_PYTHON;
  if (!python || !path.isAbsolute(python)) throw Error('Set KADY_PYTHON to the absolute trusted shared Python executable');
  vi.stubEnv('KADY_RUNTIME_PROFILE', profile);
  // The RED invocation must not create caches while proving -B is absent.
  vi.stubEnv('PYTHONDONTWRITEBYTECODE', '1');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'research-python-args-')); temporary.push(directory);
  const script = path.join(directory, 'arguments.py');
  fs.writeFileSync(script, 'import sys,json\nprint(json.dumps(sys.orig_argv))\n');
  return script;
}

test('embedded helpers pass explicit -B and retain it before isolated Python arguments', async () => {
  const script = interpreterFixture('studybuddy');
  const normal = await runHelperScript(script, []);
  expect(normal.status, normal.stderr).toBe(0);
  expect(JSON.parse(normal.stdout).slice(1, 2)).toEqual(['-B']);
  // Only exercise -I after the first assertion proves the explicit CLI flag;
  // -I deliberately ignores PYTHONDONTWRITEBYTECODE from the environment.
  const isolated = await runHelperScript('-I', ['-c', 'import sys;print(sys.flags.dont_write_bytecode,sys.flags.isolated)']);
  expect(isolated.status, isolated.stderr).toBe(0);
  expect(isolated.stdout.trim()).toBe('1 1');
});

test('standalone helper arguments retain their existing behavior', async () => {
  const script = interpreterFixture('standalone');
  const result = await runHelperScript(script, []);
  expect(result.status, result.stderr).toBe(0);
  expect(JSON.parse(result.stdout).slice(1)).toEqual([script]);
});
