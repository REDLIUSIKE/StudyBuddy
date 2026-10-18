import { afterEach, expect, it, vi } from "vitest";
import { nativeResearchRequest } from "./research-host";
afterEach(() => { vi.unstubAllEnvs(); Reflect.deleteProperty(window, "researchHost"); });
it("requires the embedded private bridge instead of calling standalone providers", async () => {
  vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
  await expect(nativeResearchRequest({ kind: "open-project", projectId: "study" })).rejects.toThrow("RESEARCH_DESKTOP_REQUIRED");
});
it("sends only a closed explicit project action", async () => {
  vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
  const request = vi.fn(async () => ({ projectId: "study", sessionId: "native-session" }));
  Reflect.set(window, "researchHost", { request });
  expect(await nativeResearchRequest({ kind: "open-project", projectId: "study" })).toMatchObject({ sessionId: "native-session" });
  await expect(nativeResearchRequest({ kind: "raw-provider", model: "foreign" } as never)).rejects.toThrow("RESEARCH_ACTION_INVALID");
  expect(request).toHaveBeenCalledTimes(1);
});
it('opens an exact official site through Main without requiring a project or model request',async()=>{vi.stubEnv('NEXT_PUBLIC_RESEARCH_PROFILE','studybuddy');const request=vi.fn(async()=>({opened:true}));Reflect.set(window,'researchHost',{request});expect(await nativeResearchRequest({kind:'open-service-site',url:'https://metaso.cn/'} as never)).toEqual({opened:true});await expect(nativeResearchRequest({kind:'open-service-site',url:'https://metaso.cn/?key=secret'} as never)).rejects.toThrow('RESEARCH_ACTION_INVALID');expect(request).toHaveBeenCalledOnce();});
