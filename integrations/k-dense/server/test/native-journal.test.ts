import fs from "node:fs";
import { afterAll, beforeEach, expect, it } from "vitest";
import { PROJECTS_ROOT } from "../src/config.ts";
import { createProject } from "../src/projects.ts";
import { readNotebookEntries } from "../src/agent/notebook-store.ts";
import { NativeJournalImporter } from "../src/runtime/native-journal.ts";
import {readSteps} from '../src/provenance/store.ts';
import type { RuntimeContext } from "../src/runtime/contracts.ts";
beforeEach(() => { fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true }); createProject({ name: "Journal", projectId: "study" }); });
afterAll(() => fs.rmSync(PROJECTS_ROOT, { recursive: true, force: true }));
const context: RuntimeContext = { projectId: "study", sessionRef: "native-session", hostBinding: {} };
const row = (seq: number, kind: string) => ({ eventId: `native-session:${seq}`, nativeSessionId: "native-session", seq, time: "2026-10-13T00:00:00Z", kind, payloadSample: '{"result":"reported evidence"}', payloadSha256: "a".repeat(64), truncated: false });
it("stores observed references once and never labels a model's prose as performed research", async () => {
  let requested = 0;
  const importer = new NativeJournalImporter({ current: () => true, read: async (_context, after) => {
    requested++; return { projectId: "study", nativeSessionId: "native-session", records: after < 1 ? [row(0, "assistant/message"), row(1, "tool/result")] : [] };
  } });
  await importer.refresh(context); await importer.refresh(context);
  const entries = readNotebookEntries("native-session", "study");
  expect(entries).toHaveLength(2); expect(entries[0].type).toBe("note"); expect(entries[1].type).toBe("observation");
  expect(entries.every(entry => !entry.execution || entry.execution.state !== "completed")).toBe(true);
  expect(entries[0].body).toContain("native-session:0"); expect(requested).toBe(2);
  const steps=readSteps('native-session','study');expect(steps).toHaveLength(1);expect(steps[0]).toMatchObject({id:'native:native-session:1',inputs:[],outputs:[],degraded:'no-scan-baseline',native:{sessionId:'native-session',seq:1,kind:'tool/result',payloadSha256:'a'.repeat(64),truncated:false}});expect(steps[0].model).toBeUndefined();expect(steps[0].isError).toBeUndefined();
  expect(steps[0].args).toMatchObject({ historyOnly: true });
});
it("rejects a foreign session or a late snapshot before writing a notebook", async () => {
  let live = true;
  const foreign = new NativeJournalImporter({ current: () => live, read: async () => ({ projectId: "other", nativeSessionId: "native-session", records: [row(0, "tool/result")] }) });
  await expect(foreign.refresh(context)).rejects.toThrow("NATIVE_JOURNAL_INVALID");
  const late = new NativeJournalImporter({ current: () => live, read: async () => { live = false; return { projectId: "study", nativeSessionId: "native-session", records: [row(0, "tool/result")] }; } });
  await expect(late.refresh(context)).rejects.toThrow("RESEARCH_CONTEXT_REVOKED");
  expect(readNotebookEntries("native-session", "study")).toEqual([]);
});
