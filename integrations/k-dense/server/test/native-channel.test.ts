import { expect, it, vi } from "vitest";
import { ManagedResearchRuntime } from "../src/runtime/native-channel.ts";
import {PassThrough} from 'node:stream';import {StdioNativeChannel} from '../src/runtime/stdio-channel.ts';

it("shares a pending native binding and keeps independent project Sessions", async () => {
  const calls: string[] = [];
  let release: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  const runtime = new ManagedResearchRuntime({ current: () => true,
    request: async (projectId, operation) => { calls.push(projectId + ":" + operation); await waiting; return { projectId, sessionId: "session-" + projectId }; },
    events: async function* () {},
  });
  const first = runtime.bind("a"), second = runtime.bind("a");
  release!();
  const context = await first;
  expect(await second).toBe(context);
  expect(calls).toEqual(["a:bind"]);
  expect((await runtime.bind("b")).sessionRef).toBe("session-b");
});
it("admits a copied runtime context only through its original opaque binding and revokes it", async () => {
  let live = true, submissions = 0;
  const runtime = new ManagedResearchRuntime({ current: () => live,
    request: async (projectId, operation) => {
      if (operation === "bind") return { projectId, sessionId: "session-a" };
      if (operation === "capabilities") return [{ id: "conversation", state: "ready" }];
      submissions++; return { runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", state: "running" };
    }, events: async function* () {},
  });
  const context = await runtime.bind("a"), driver = runtime.forContext(context);
  expect(await driver.capabilities(context)).toEqual([{ id: "conversation", state: "ready" }]);
  await expect(driver.submit({ ...context, hostBinding: {} }, { operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "conversation", input: { prompt: "review", references: [] } }, new AbortController().signal)).rejects.toThrow("RESEARCH_CONTEXT_REVOKED");
  expect(submissions).toBe(0);
  live = false; runtime.revoke();
  expect(() => runtime.forContext(context)).toThrow("RESEARCH_CONTEXT_REVOKED");
});
it("keeps a running helper pinned to its native Session after the selected chat changes", async () => {
  let selected = "session-a";
  const captures: string[] = [];
  const runtime = new ManagedResearchRuntime({ current: () => true, request: async (projectId, operation, _input, _signal, sessionId) => {
    if (operation === "bind") return { projectId, sessionId: selected };
    captures.push(sessionId!); return [{ id: "methods-draft", state: "ready" }];
  }, events: async function* () {} });
  const a = await runtime.bind("study"), driverA = runtime.forContext(a);
  selected = "session-b"; const b = await runtime.bind("study");
  expect(b.sessionRef).toBe("session-b"); expect(runtime.current(a)).toBe(true);
  await driverA.capabilities(a); expect(captures).toEqual(["session-a"]);
});
it('carries the closed advanced operation over the real private stdio boundary and correlates its result without a raw provider escape',async()=>{
 const input=new PassThrough(),output=new PassThrough(),wire:any[]=[],channel=new StdioNativeChannel(input,output);output.on('data',chunk=>{const request=JSON.parse(chunk.toString());wire.push(request);input.write(JSON.stringify({type:'host-result',rpcId:request.rpcId,data:{state:'running'}})+'\n')})
 try{expect(await channel.request('study','advanced',{action:'inspect',operationId:'33333333-3333-4333-8333-333333333333'},new AbortController().signal,'session-a')).toEqual({state:'running'});expect(wire).toHaveLength(1);expect(wire[0]).toMatchObject({operation:'advanced',projectId:'study',sessionId:'session-a'});await expect(channel.request('study','provider-fetch',{},new AbortController().signal)).rejects.toThrow('RESEARCH_ACTION_INVALID');expect(wire).toHaveLength(1)}finally{channel.close();input.destroy();output.destroy()}
});
it.each(['goal', 'schedules'])('carries the existing %s operation over the private pipe with its exact Session binding', async operation => {
  const input = new PassThrough(), output = new PassThrough(), wire: Record<string, unknown>[] = [];
  const channel = new StdioNativeChannel(input, output), params = { action: 'list', requestId: 'existing-operation' };
  output.on('data', bytes => {
    const request = JSON.parse(String(bytes)); wire.push(request);
    input.write(JSON.stringify({ type: 'host-result', rpcId: request.rpcId, data: { received: operation } }) + '\n');
  });
  try {
    expect(await channel.request('study', operation, params, new AbortController().signal, 'session-a')).toEqual({ received: operation });
    expect(wire).toEqual([expect.objectContaining({ type: 'host-request', projectId: 'study', operation, input: params, sessionId: 'session-a' })]);
    for (const invalid of ['goals', 'schedule', 'provider-fetch']) await expect(channel.request('study', invalid, {}, new AbortController().signal)).rejects.toThrow('RESEARCH_ACTION_INVALID');
    expect(wire).toHaveLength(1);
  } finally { channel.close(); input.destroy(); output.destroy(); }
});
it('preserves a Chinese native result when the private pipe splits UTF-8 bytes inside a character',async()=>{
 const input=new PassThrough(),output=new PassThrough(),channel=new StdioNativeChannel(input,output);output.on('data',chunk=>{const request=JSON.parse(chunk.toString()),bytes=Buffer.from(JSON.stringify({type:'host-result',rpcId:request.rpcId,data:{text:'论文😀'}})+'\n'),offset=bytes.indexOf(Buffer.from('论'))+1;input.write(bytes.subarray(0,offset));input.write(bytes.subarray(offset))})
 try{expect(await channel.request('study','inspect',{runId:'33333333-3333-4333-8333-333333333333'},new AbortController().signal)).toEqual({text:'论文😀'})}finally{channel.close();input.destroy();output.destroy()}
});
it('sends one exact private cancellation when the admitted ASR caller aborts and never replays a late result', async () => {
  const input = new PassThrough(), output = new PassThrough(), wire: Record<string, unknown>[] = [], channel = new StdioNativeChannel(input, output)
  output.on('data', bytes => { wire.push(JSON.parse(String(bytes))) })
  const controller = new AbortController(), sessionId = 'session-44444444-4444-4444-8444-444444444444'
  try {
    const result = channel.request('study', 'speech-transcribe', { requestId: '33333333-3333-4333-8333-333333333333' }, controller.signal, sessionId)
      .then(value => ({ value }), error => ({ error: error.message }))
    expect(wire).toHaveLength(1)
    const rpcId = wire[0]!.rpcId
    controller.abort(); expect(await result).toEqual({ error: 'RESEARCH_TRANSPORT_DISCONNECTED' })
    expect(wire).toEqual([expect.objectContaining({ type: 'host-request', rpcId, projectId: 'study', sessionId, operation: 'speech-transcribe' }),
      { type: 'host-cancel', rpcId, projectId: 'study', sessionId }])
    input.write(JSON.stringify({ type: 'host-result', rpcId, data: { text: 'late result' } }) + '\n')
    controller.abort(); expect(wire).toHaveLength(2); expect(channel.current()).toBe(true)
  } finally { channel.close(); input.destroy(); output.destroy() }
})
it('cleans a settled cancellation listener and sends no request for a pre-aborted caller', async () => {
  const input = new PassThrough(), output = new PassThrough(), wire: Record<string, unknown>[] = [], channel = new StdioNativeChannel(input, output)
  output.on('data', bytes => { wire.push(JSON.parse(String(bytes))) })
  try {
    const before = new AbortController(); before.abort()
    expect(() => channel.request('study', 'speech-transcribe', null, before.signal)).toThrow()
    expect(wire).toEqual([])
    const settled = new AbortController(), result = channel.request('study', 'inspect', null, settled.signal)
    input.write(JSON.stringify({ type: 'host-result', rpcId: wire[0]!.rpcId, data: { state: 'ready' } }) + '\n')
    expect(await result).toEqual({ state: 'ready' }); settled.abort(); expect(wire).toHaveLength(1)
  } finally { channel.close(); input.destroy(); output.destroy() }
})
it('cancels a timed-out ASR observer once and releases its abort listener without another dispatch', async () => {
  vi.useFakeTimers()
  const input = new PassThrough(), output = new PassThrough(), wire: Record<string, unknown>[] = [], channel = new StdioNativeChannel(input, output)
  output.on('data', bytes => { wire.push(JSON.parse(String(bytes))) })
  const controller = new AbortController()
  try {
    const result = channel.request('study', 'speech-transcribe', null, controller.signal).then(() => 'ready', error => error.message)
    await vi.advanceTimersByTimeAsync(190000)
    expect(await result).toBe('RESEARCH_TRANSPORT_DISCONNECTED')
    expect(wire).toEqual([expect.objectContaining({ type: 'host-request' }), { type: 'host-cancel', rpcId: wire[0]!.rpcId, projectId: 'study' }])
    controller.abort(); await vi.advanceTimersByTimeAsync(190000); expect(wire).toHaveLength(2)
  } finally { channel.close(); input.destroy(); output.destroy(); vi.useRealTimers() }
})
