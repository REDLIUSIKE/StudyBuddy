/** Legacy CLI trust store format only; native execution has its own admission. */
import { ProjectTrustStore } from '../runtime/formats/trust-manager.js';
import { getAgentDir } from '../runtime/file-adapters.ts';
import type { ProjectPaths } from '../projects.ts';
export function trustSandbox(paths: ProjectPaths, agentDir = getAgentDir()): void {
  const store = new ProjectTrustStore(agentDir);
  if (store.get(paths.sandbox) === null) store.set(paths.sandbox, true);
}
