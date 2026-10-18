import type { RuntimeProfile } from "./contracts.ts";

export class RuntimeAdmissionError extends Error {
  constructor(readonly code: "INVALID_RUNTIME_PROFILE" | "RESEARCH_HOST_REQUIRED", message: string) {
    super(message);
    this.name = "RuntimeAdmissionError";
  }
}

// Do not import config/env/providers here. Rejected or host-owned startup must
// not evaluate a module that reads the standalone credential directory.
export function resolveRuntimeProfile(value: string | undefined): RuntimeProfile {
  if (value === undefined || value === "standalone") return "standalone";
  if (value === "studybuddy") return "studybuddy";
  throw new RuntimeAdmissionError("INVALID_RUNTIME_PROFILE", "Unsupported research runtime profile");
}

export function requireResearchHost(): never {
  throw new RuntimeAdmissionError("RESEARCH_HOST_REQUIRED", "An admitted research host is required for the embedded runtime");
}

/** Legacy helper entry points must never become an embedded fallback. */
export function requireStandaloneHelper(): void {
  if (resolveRuntimeProfile(process.env.KADY_RUNTIME_PROFILE) !== "standalone") requireResearchHost();
}
