/** Profile admission precedes all credential and provider initialization. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireResearchHost, resolveRuntimeProfile } from "./runtime/profile.ts";
import { loadStandaloneServer } from "./runtime/pi-runtime.ts";
import type { EmbeddedBootstrap } from "./bootstrap-embedded.ts";
export { createHostRuntime } from "./runtime/host-runtime.ts";
export { prepareNativeHelperAction } from "./runtime/helper-action.ts";

export interface BuildAppOptions { runtimeProfile?: string; embedded?: EmbeddedBootstrap }

export async function buildApp(options: BuildAppOptions = {}) {
  const profile = resolveRuntimeProfile(options.runtimeProfile ?? process.env.KADY_RUNTIME_PROFILE);
  if (profile === "studybuddy") {
    if (!options.embedded) return requireResearchHost();
    return (await import("./bootstrap-embedded.ts")).buildEmbeddedApp(options.embedded);
  }
  return (await loadStandaloneServer()).buildApp();
}

const isMain = (() => {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]));
  } catch { return false; }
})();

if (isMain) {
  const profile = resolveRuntimeProfile(process.env.KADY_RUNTIME_PROFILE);
  if (profile === "studybuddy") requireResearchHost();
  await (await loadStandaloneServer()).startStandalone();
}
