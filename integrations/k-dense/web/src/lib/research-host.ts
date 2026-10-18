/** Closed public workbench actions; provider routes and credentials never enter this interface. */
import { runtimeProfile } from "./runtime-profile";
export type ResearchPageAction = { kind: "open-project" | "list-chats" | "new-chat"; projectId: string }
  | { kind: "select-chat" | "close-chat"; projectId: string; sessionId: string }
  | { kind: "reference"; projectId: string; path: string }
  | { kind: "draft"; projectId: string; text: string; references: string[] }
  | { kind: "show-models" | "show-projects" }
  | {kind:'open-service-site';url:string};
interface Host { request(action: ResearchPageAction): Promise<unknown> }
export async function nativeResearchRequest(action: ResearchPageAction): Promise<unknown> {
  if (!action || !["open-project", "list-chats", "new-chat", "select-chat", "close-chat", "reference", "draft", "show-models", "show-projects",'open-service-site'].includes(action.kind)) throw Error("RESEARCH_ACTION_INVALID");
  if(action.kind==='open-service-site'&&!['https://guijitongzhuo.com/','https://modal.com/','https://www.autodl.com/','https://paperclip.gxl.ai/','https://metaso.cn/','https://exa.ai/','https://open.bochaai.com/','https://modal.com/settings/tokens','https://paperclip.gxl.ai/keys','https://dashboard.exa.ai/api-keys','https://metaso.cn/search-api/api-keys'].includes(action.url))throw Error('RESEARCH_ACTION_INVALID');
  if ("projectId" in action && !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(action.projectId)) throw Error("RESEARCH_ACTION_INVALID");
  if ("sessionId" in action && !/^session-[a-f0-9-]{36}$/.test(action.sessionId)) throw Error("RESEARCH_ACTION_INVALID");
  const relative = (value: string) => !!value && value.length < 4096 && !value.includes("\\") && !value.includes(":") && !value.includes("\0") && !value.startsWith("/") && !value.split("/").some(part => !part || part === "." || part === "..");
  if (action.kind === "reference" && !relative(action.path)) throw Error("RESEARCH_ACTION_INVALID");
  if (action.kind === "draft" && (!action.text.trim() || action.text.length > 131072 || action.references.length > 24 || !action.references.every(relative))) throw Error("RESEARCH_ACTION_INVALID");
  const host = typeof window === "undefined" ? undefined : Reflect.get(window, "researchHost") as Host | undefined;
  if (runtimeProfile() !== "studybuddy" || !host?.request) throw Error("RESEARCH_DESKTOP_REQUIRED");
  return host.request(action);
}
