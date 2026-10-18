import { describe, expect, it, vi } from "vitest";
import type { ResearchRuntime, RuntimeContext } from "../src/runtime/contracts.ts";
import * as entry from "../src/index.ts";

const id = "44444444-4444-4444-8444-444444444444";
const binding = Object.freeze({ admittedBy: "private-host-fixture" });
const context: RuntimeContext = { projectId: "project-a", sessionRef: "session-a", hostBinding: binding };
const action = { operationId: id, kind: "methods-draft", input: { prompt: "Draft only supported methods", references: ["user_data/study.csv"] } };
const signal = () => new AbortController().signal;
function setup() {
  let current = true;
  const transport = {
    current: () => current,
    invoke: vi.fn(async (_context: RuntimeContext, operation: string, _input: unknown, _signal: AbortSignal): Promise<unknown> => {
      if (operation === "capabilities") return [{ id: "methods-draft", state: "ready" }];
      return { runId: id, state: "completed", result: { kind: "message", value: "## Methods\nOnly the supported recorded work." } };
    }),
    events: async function* () {},
  };
  const factory = (entry as unknown as Record<string, unknown>).createHostRuntime;
  if (typeof factory !== "function") throw Error("HOST_RUNTIME_NOT_IMPLEMENTED");
  const runtime = factory(context, transport) as ResearchRuntime;
  return { runtime, transport, revoke: () => { current = false; } };
}

describe("host-owned model helpers", () => {
  it("passes the captured context and deliberate helper action to one native owner", async () => {
    const { runtime, transport } = setup();
    expect(await runtime.capabilities(context)).toEqual([{ id: "methods-draft", state: "ready" }]);
    const result = await runtime.submit(context, action, signal());
    expect(result).toEqual({ runId: id, state: "completed", result: { kind: "message", value: "## Methods\nOnly the supported recorded work." } });
    expect(transport.invoke.mock.calls[1]?.slice(0, 3)).toEqual([context, "submit", action]);
  });
  it.each([
    { ...context, projectId: "another-project" },
    { ...context, sessionRef: "another-session" },
    { ...context, hostBinding: { ...binding } },
  ])("rejects foreign context before any native call", async foreign => {
    const { runtime, transport } = setup();
    await expect(runtime.submit(foreign, action, signal())).rejects.toThrow("RESEARCH_CONTEXT_REVOKED");
    expect(transport.invoke).not.toHaveBeenCalled();
  });
  it("rejects authority injection and unregistered helper kinds before transport", async () => {
    const { runtime, transport } = setup();
    for (const invalid of [
      { ...action, kind: "provider-fetch" },
      { ...action, input: { ...action.input, apiKey: "forbidden" } },
      { ...action, input: { ...action.input, provider: "another-provider", model: "another-model" } },
    ]) await expect(runtime.submit(context, invalid, signal())).rejects.toThrow("RESEARCH_ACTION_INVALID");
    expect(transport.invoke).not.toHaveBeenCalled();
  });
  it("shares concurrent identical operations and refuses edited reuse", async () => {
    const { runtime, transport } = setup();
    const values = await Promise.all([runtime.submit(context, action, signal()), runtime.submit(context, action, signal())]);
    expect(values.map(value => value.runId)).toEqual([id, id]);
    expect(transport.invoke).toHaveBeenCalledTimes(1);
    await expect(runtime.submit(context, { ...action, input: { ...action.input, prompt: "A different request" } }, signal())).rejects.toThrow("RESEARCH_OPERATION_CONFLICT");
    expect(transport.invoke).toHaveBeenCalledTimes(1);
  });
  it("recovers an uncertain submission through inspect without sending it again", async () => {
    const { runtime, transport } = setup();
    transport.invoke.mockRejectedValueOnce(Object.assign(Error("Disconnected after admission"), { code: "RESEARCH_TRANSPORT_DISCONNECTED" }));
    expect(await runtime.submit(context, action, signal())).toEqual({ runId: id, state: "unknown" });
    expect(await runtime.submit(context, action, signal())).toEqual({ runId: id, state: "unknown" });
    expect((await runtime.inspect(context, id)).state).toBe("completed");
    expect(transport.invoke.mock.calls.map(call => call[1])).toEqual(["submit", "inspect"]);
  });
  it("rejects a late helper result after account invalidation", async () => {
    const { runtime, transport, revoke } = setup();
    let finish!: (value: unknown) => void;
    transport.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = runtime.submit(context, action, signal());
    const rejected = expect(pending).rejects.toThrow("RESEARCH_CONTEXT_REVOKED");
    await vi.waitFor(() => expect(transport.invoke).toHaveBeenCalledTimes(1));
    revoke(); finish({ runId: id, state: "completed", result: { kind: "message", value: "Stale output" } });
    await rejected;
  });
  it("preserves selected-authority errors and never retries with Pi", async () => {
    const { runtime, transport } = setup();
    transport.invoke.mockRejectedValue(Error("SELECTED_AUTHORITY_UNAVAILABLE"));
    await expect(runtime.submit(context, action, signal())).rejects.toThrow("SELECTED_AUTHORITY_UNAVAILABLE");
    await expect(runtime.submit(context, action, signal())).rejects.toThrow("SELECTED_AUTHORITY_UNAVAILABLE");
    expect(transport.invoke).toHaveBeenCalledTimes(1);
  });
});
