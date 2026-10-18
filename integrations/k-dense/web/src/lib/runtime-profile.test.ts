import { afterEach, expect, it, vi } from "vitest";
import { researchBrand, runtimeProfile } from "./runtime-profile";
afterEach(() => vi.unstubAllEnvs());
it("preserves standalone branding and uses native controls only in the embedded artifact", () => {
  vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", undefined);
  expect(runtimeProfile()).toBe("standalone"); expect(researchBrand().name).toBe("K-Dense BYOK");
  vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
  expect(runtimeProfile()).toBe("studybuddy"); expect(researchBrand()).toMatchObject({ name: "StudyBuddy", logo: "/brand/studybuddy-wordmark.png" });
});
