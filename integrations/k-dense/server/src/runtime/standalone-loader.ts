/** One explicit boundary for standalone-only execution. The embedded build
 * folds this branch away before resolving its imports. */
import { requireStandaloneHelper, requireResearchHost } from './profile.ts';
export async function standaloneSessions() {
  if (process.env.KADY_RUNTIME_PROFILE !== 'studybuddy') {
    requireStandaloneHelper();
    return import('../agent/session-registry.ts');
  }
  return requireResearchHost();
}
export async function standaloneModels() {
  if (process.env.KADY_RUNTIME_PROFILE !== 'studybuddy') {
    requireStandaloneHelper();
    return import('../agent/models.ts');
  }
  return requireResearchHost();
}
