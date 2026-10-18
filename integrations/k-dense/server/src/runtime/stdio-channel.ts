/** Correlated private channel; a lost response is unknown and is never replayed. */
import { randomUUID } from "node:crypto";
import type { Readable, Writable } from "node:stream";
import {StringDecoder} from 'node:string_decoder';
import type { NativeChannel } from "./native-channel.ts";

const disconnected = () => Object.assign(Error("RESEARCH_TRANSPORT_DISCONNECTED"), { code: "RESEARCH_TRANSPORT_DISCONNECTED" });
export class StdioNativeChannel implements NativeChannel {
  private live = true;
  private text = "";
  private readonly decoder=new StringDecoder('utf8');
  private readonly pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; stop(): void }>();
  private readonly eventsByRun = new Map<string, { values: unknown[]; wake?: () => void }>();
  constructor(private readonly input: Readable, private readonly output: Writable, private readonly shutdown?: () => void) {
    input.on("data", this.read);
    input.on("end", this.close);
    input.on("error", this.close);
    output.on("error", this.close);
  }
  current = (): boolean => this.live;
  request(projectId: string, operation: string, input: unknown, signal: AbortSignal, sessionId?: string): Promise<unknown> {
    signal.throwIfAborted();
    if (!this.live) return Promise.reject(disconnected());
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(projectId) || !["bind", "capabilities", "submit", "inspect", "cancel", "answer", "project-close", "journal", "journal-export", "journal-sessions", "model-catalog","advanced","settlements", "speech-transcribe", "goal", "schedules"].includes(operation)) return Promise.reject(Error("RESEARCH_ACTION_INVALID"));
    if (this.pending.size >= 128) return Promise.reject(Error("RESEARCH_CHANNEL_BUSY"));
    if (sessionId !== undefined && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(sessionId)) return Promise.reject(Error("RESEARCH_ACTION_INVALID"));
    const rpcId = randomUUID(), encoded = JSON.stringify({ type: "host-request", rpcId, projectId, operation, input, ...(sessionId === undefined ? {} : { sessionId }) }) + "\n";
    if (Buffer.byteLength(encoded) > 1024 * 1024) return Promise.reject(Error("RESEARCH_ACTION_INVALID"));
    return new Promise((resolve, reject) => {
      const abort = () => {
        const row = this.pending.get(rpcId);
        if (!row) return;
        this.pending.delete(rpcId); row.stop();
        if (this.live) this.output.write(JSON.stringify({ type: "host-cancel", rpcId, projectId,
          ...(sessionId === undefined ? {} : { sessionId }) }) + "\n", error => { if (error) this.close(); });
        reject(disconnected());
      };
      const timer = setTimeout(abort, operation === "speech-transcribe" ? 190000 : 30000);
      const stop = () => { clearTimeout(timer); signal.removeEventListener("abort", abort); };
      signal.addEventListener("abort", abort, { once: true });
      this.pending.set(rpcId, { resolve, reject, stop });
      this.output.write(encoded, error => { if (error) this.close(); });
    });
  }
  private read = (bytes: Buffer): void => {
    this.text += this.decoder.write(bytes);
    if (Buffer.byteLength(this.text) > 1024 * 1024) { this.close(); return; }
    const lines = this.text.split("\n"); this.text = lines.pop() ?? "";
    for (const line of lines) {
      let message: unknown;
      try { message = JSON.parse(line); } catch { this.close(); return; }
      if (!message || typeof message !== "object" || !("type" in message)) { this.close(); return; }
      if (message.type === "shutdown") { this.close(); this.shutdown?.(); return; }
      if (message.type === "host-result" && "rpcId" in message && typeof message.rpcId === "string") {
        const row = this.pending.get(message.rpcId);
        if (!row) continue; // A timed-out observer has no authority to replay this result.
        this.pending.delete(message.rpcId); row.stop();
        if ("error" in message && typeof message.error === "string") row.reject(Error(message.error));
        else if ("data" in message) row.resolve(message.data);
        else row.reject(Error("RESEARCH_CONTROL_INVALID"));
      } else if (message.type === "host-event" && "projectId" in message && typeof message.projectId === "string" && "runId" in message && typeof message.runId === "string" && "event" in message) {
        const key = JSON.stringify([message.projectId, message.runId]);
        const row = this.eventsByRun.get(key);
        if (!row) continue;
        if (row.values.length >= 256) { this.close(); return; }
        row.values.push(message.event); row.wake?.();
      }
    }
  };
  async *events(projectId: string, runId: string): AsyncIterable<unknown> {
    const key = JSON.stringify([projectId, runId]), row: { values: unknown[]; wake?: () => void } = { values: [] };
    if (this.eventsByRun.has(key)) throw Error("RESEARCH_OBSERVER_CONFLICT");
    this.eventsByRun.set(key, row);
    try {
      while (this.live) {
        if (!row.values.length) await new Promise<void>(resolve => { row.wake = resolve; });
        row.wake = undefined;
        while (row.values.length) yield row.values.shift();
      }
    } finally { this.eventsByRun.delete(key); }
  }
  close = (): void => {
    if (!this.live) return;
    this.live = false;
    this.input.off("data", this.read); this.input.off("end", this.close); this.input.off("error", this.close); this.output.off("error", this.close);
    for (const row of this.pending.values()) { row.stop(); row.reject(disconnected()); }
    this.pending.clear();
    for (const row of this.eventsByRun.values()) row.wake?.();
  };
}
