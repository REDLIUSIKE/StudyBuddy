import { PassThrough } from "node:stream";
import { expect, it } from "vitest";
import { StdioNativeChannel } from "../src/runtime/stdio-channel.ts";

it("reads correlated native results without putting credentials into requests", async () => {
  const output = new PassThrough(), input = new PassThrough();
  let text = ""; output.on("data", bytes => { text += String(bytes); });
  const channel = new StdioNativeChannel(input, output);
  const call = channel.request("study", "bind", null, new AbortController().signal);
  const sent = JSON.parse(text.trim());
  expect(sent).toMatchObject({ type: "host-request", operation: "bind", projectId: "study", input: null });
  input.write(JSON.stringify({ type: "host-result", rpcId: sent.rpcId, data: { projectId: "study", sessionId: "native-one" } }) + "\n");
  expect(await call).toEqual({ projectId: "study", sessionId: "native-one" });
  channel.close(); expect(channel.current()).toBe(false);
});
it("marks admitted requests uncertain on disconnect and never resends", async () => {
  const output = new PassThrough(), input = new PassThrough();
  let text = ""; output.on("data", bytes => { text += String(bytes); });
  const channel = new StdioNativeChannel(input, output);
  const call = channel.request("study", "inspect", { runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, new AbortController().signal);
  const rejected = expect(call).rejects.toMatchObject({ code: "RESEARCH_TRANSPORT_DISCONNECTED" });
  channel.close(); await rejected;
  expect(text.trim().split("\n")).toHaveLength(1);
});
