import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Instrument the two real external initialization boundaries. A rejected
// bootstrap must never evaluate either module (not even to build a registry).
const initialization = vi.hoisted(() => ({
  credentialRead: vi.fn(() => { throw Object.assign(new Error("credential file read"), { code: "CREDENTIAL_READ" }); }),
  piSetup: vi.fn(() => { throw Object.assign(new Error("Pi provider initialization"), { code: "PI_SETUP" }); }),
}));
vi.mock("../src/env.ts", () => { initialization.credentialRead(); return {}; });
vi.mock("../src/agent/session-registry.ts", () => { initialization.piSetup(); return {}; });

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.unstubAllEnvs(); });

async function bootstrap(options?: unknown) {
  const entry = await import("../src/index.ts");
  return (entry.buildApp as (options?: unknown) => Promise<unknown>)(options);
}

describe("runtime admission before credentials and providers", () => {
  it.each(["unknown", "", "standalone ", "StudyBuddy"])("invalid_profile_has_no_provider_initialization (%j)", async (profile) => {
    vi.stubEnv("KADY_RUNTIME_PROFILE", profile);
    await expect(bootstrap()).rejects.toMatchObject({ code: "INVALID_RUNTIME_PROFILE" });
    expect(initialization.credentialRead).not.toHaveBeenCalled();
    expect(initialization.piSetup).not.toHaveBeenCalled();
  });

  it("studybuddy_without_host_fails_closed", async () => {
    vi.stubEnv("KADY_RUNTIME_PROFILE", "studybuddy");
    await expect(bootstrap()).rejects.toMatchObject({ code: "RESEARCH_HOST_REQUIRED" });
    expect(initialization.credentialRead).not.toHaveBeenCalled();
    expect(initialization.piSetup).not.toHaveBeenCalled();
  });

  it("explicit embedded selection cannot load standalone environment defaults", async () => {
    vi.stubEnv("KADY_RUNTIME_PROFILE", undefined);
    await expect(bootstrap({ runtimeProfile: "studybuddy" })).rejects.toMatchObject({ code: "RESEARCH_HOST_REQUIRED" });
    expect(initialization.credentialRead).not.toHaveBeenCalled();
    expect(initialization.piSetup).not.toHaveBeenCalled();
  });
});
