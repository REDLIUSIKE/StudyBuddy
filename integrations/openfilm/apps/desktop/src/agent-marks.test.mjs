import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AGENT_IDS } from './agent-roster.mjs';
import { MARKS, agentMark } from '../../../packages/openfilm/studio/ui/src/lib/provider-marks.ts';

/* Settings → Agents shows each agent by its mark (its own, or its maker's); the own key has a key instead */
test('every agent has its mark', () => {
  const missing = AGENT_IDS.filter((id) => id !== 'byok' && !MARKS[agentMark(id)]);
  assert.deepEqual(missing, [], `no mark in packages/openfilm/studio/ui/src/lib/provider-marks.ts for: ${missing.join(', ')}`);
});
