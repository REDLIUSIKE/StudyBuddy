import type { ChildProcess } from "node:child_process";
import { embedded } from "./policy";

const jobs = new Set<{ abort(): void; finished: Promise<unknown> }>();
let stopping = false;
export function assertWorkAllowed() {
  if (embedded && stopping) throw new Error("AIGC_SCOPE_REVOKED");
}
export async function runOwnedWork<T>(signal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
  assertWorkAllowed();
  const controller = new AbortController();
  const done = Promise.withResolvers<void>();
  const row = { abort: () => controller.abort(), finished: done.promise };
  if (embedded) jobs.add(row);
  try { return await operation(signal ? AbortSignal.any([signal, controller.signal]) : controller.signal); }
  finally { done.resolve(); jobs.delete(row); }
}
export function ownProcess(child: ChildProcess) {
  if (!embedded) return;
  const done = Promise.withResolvers<void>();
  const row = { abort: () => { child.kill("SIGKILL"); }, finished: done.promise };
  jobs.add(row);
  const finish = () => { done.resolve(); jobs.delete(row); };
  child.once("close", finish); child.once("error", finish);
  if (stopping) row.abort();
}
export async function stopOwnedWork() {
  stopping = true;
  while (jobs.size) {
    const pending = [...jobs];
    for (const job of pending) job.abort();
    await Promise.allSettled(pending.map(job => job.finished));
  }
}
