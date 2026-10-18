import { describe, expect, it } from "vitest";

import {
  parseAiActivityShareRequest,
  parseAiActivitySnapshot,
  parseTokenShareSnapshot,
} from "./ai-activity.js";

const SNAPSHOT_VERSION = "20000000-0000-4000-8000-000000000001";
const PUBLIC_ID = "20000000-0000-4000-8000-000000000002";
const MODEL_ID = "20000000-0000-4000-8000-000000000004";
const CAPABILITY_ID = "20000000-0000-4000-8000-000000000005";

function dateAtOffset(offset: number): string {
  const date = new Date(Date.UTC(2025, 8, 2 + offset));
  return date.toISOString().slice(0, 10);
}

function activitySnapshot() {
  return {
    snapshotVersion: SNAPSHOT_VERSION,
    freshness: "fresh" as const,
    metrics: {
      totalTokens: "900719925474099312345",
      peakDayTokens: "45678901234567890",
      currentStreakDays: 2,
      longestStreakDays: 7,
      activeDays: 182,
    },
    days: Array.from({ length: 365 }, (_, offset) => ({
      date: dateAtOffset(offset),
      totalTokens: offset === 364 ? "45678901234567890" : String(offset),
      intensity: (offset === 0 ? 0 : ((offset - 1) % 4) + 1) as 0 | 1 | 2 | 3 | 4,
    })),
    footprints: {
      models: [{
        id: MODEL_ID,
        displayName: "DeepSeek",
        brand: "deepseek" as const,
        totalTokens: "100719925474099312345",
      }],
      capabilities: [{ id: CAPABILITY_ID, displayName: "知涟", kind: "zhilian" as const }],
    },
  };
}

describe("AI activity contracts", () => {
  it('preserves exact domestic-provider activity without accepting tool names as model brands',()=>{
    const snapshot=activitySnapshot();
    for(const brand of ['hunyuan','zhipu','minimax','mimo']){
      const value={...snapshot,footprints:{...snapshot.footprints,models:snapshot.footprints.models.map(m=>({...m,brand}))}};
      expect(parseAiActivitySnapshot(value)).toEqual(value);
    }
  });
  it("parses an exact sorted 365-day snapshot without narrowing token integers", () => {
    const snapshot = activitySnapshot();
    expect(parseAiActivitySnapshot(snapshot)).toEqual(snapshot);
  });

  it("rejects extra fields and noncanonical token strings", () => {
    const snapshot = activitySnapshot();
    expect(() => parseAiActivitySnapshot({ ...snapshot, userId: PUBLIC_ID }))
      .toThrow("AI_ACTIVITY_INVALID");

    for (const totalTokens of ["-1", "+1", "01", "1.0", " 1", "1 ", "1e3"]) {
      expect(() => parseAiActivitySnapshot({
        ...snapshot,
        metrics: { ...snapshot.metrics, totalTokens },
      })).toThrow("AI_ACTIVITY_INVALID");
    }
  });

  it("rejects AI-tool statistics and invalid provider identifiers", () => {
    const snapshot = activitySnapshot();
    expect(() => parseAiActivitySnapshot({
      ...snapshot,
      footprints: { ...snapshot.footprints, tools: [] },
    })).toThrow("AI_ACTIVITY_INVALID");
    expect(() => parseAiActivitySnapshot({
      ...snapshot,
      footprints: {
        ...snapshot.footprints,
        models: snapshot.footprints.models.map((model) => ({ ...model, brand: "invalid brand" })),
      },
    })).toThrow("AI_ACTIVITY_INVALID");

    expect(() => parseAiActivitySnapshot({
      ...snapshot,
      footprints: {
        ...snapshot.footprints,
        models: snapshot.footprints.models.map((model) => ({ ...model, totalTokens: "0" })),
      },
    })).toThrow("AI_ACTIVITY_INVALID");
  });

  it("rejects duplicate, unsorted, or noncanonical activity dates", () => {
    const snapshot = activitySnapshot();
    const duplicate = snapshot.days.map((day) => ({ ...day }));
    duplicate[200] = { ...duplicate[200]!, date: duplicate[199]!.date };
    const unsorted = snapshot.days.map((day) => ({ ...day }));
    [unsorted[10], unsorted[11]] = [unsorted[11]!, unsorted[10]!];
    const noncanonical = snapshot.days.map((day) => ({ ...day }));
    noncanonical[0] = { ...noncanonical[0]!, date: "2025-9-2" };

    for (const days of [duplicate, unsorted, noncanonical]) {
      expect(() => parseAiActivitySnapshot({ ...snapshot, days }))
        .toThrow("AI_ACTIVITY_INVALID");
    }
  });

  it("rejects mismatched zero tokens and intensity in activity and share snapshots", () => {
    const snapshot = activitySnapshot();
    const share = {
      avatarUrl: "/v1/my-ai/personal-profile/avatar?v=8",
      nickname: "云杉同学",
      publicId: PUBLIC_ID,
      snapshotVersion: snapshot.snapshotVersion,
      metrics: snapshot.metrics,
      days: snapshot.days,
      footprints: snapshot.footprints,
    };

    for (const invalidDay of [
      { totalTokens: "0", intensity: 1 as const },
      { totalTokens: "42", intensity: 0 as const },
    ]) {
      const days = snapshot.days.map((day, index) => index === 10
        ? { ...day, ...invalidDay }
        : day);
      expect(() => parseAiActivitySnapshot({ ...snapshot, days }))
        .toThrow("AI_ACTIVITY_INVALID");
      expect(() => parseTokenShareSnapshot({ ...share, days }))
        .toThrow("TOKEN_SHARE_INVALID");
    }
  });

  it("accepts lifetime activity counters above the 365-day heatmap length", () => {
    const snapshot = activitySnapshot();
    const metrics = {
      ...snapshot.metrics,
      currentStreakDays: 366,
      longestStreakDays: 800,
      activeDays: 900,
    };

    expect(parseAiActivitySnapshot({ ...snapshot, metrics }).metrics).toEqual(metrics);
  });

  it("parses only snapshotVersion for a share request", () => {
    expect(parseAiActivityShareRequest({ snapshotVersion: SNAPSHOT_VERSION }))
      .toEqual({ snapshotVersion: SNAPSHOT_VERSION });

    for (const privateField of [
      { userId: PUBLIC_ID },
      { realName: "刘横" },
      { email: "liuheng@example.com" },
      { campus: { school: "云杉大学" } },
    ]) {
      expect(() => parseAiActivityShareRequest({
        snapshotVersion: SNAPSHOT_VERSION,
        ...privateField,
      })).toThrow("AI_ACTIVITY_SHARE_REQUEST_INVALID");
    }
  });

  it("parses a share view without private identity or membership fields", () => {
    const activity = activitySnapshot();
    const share = {
      avatarUrl: "/v1/my-ai/personal-profile/avatar?v=8",
      nickname: "云杉同学",
      publicId: PUBLIC_ID,
      snapshotVersion: activity.snapshotVersion,
      metrics: activity.metrics,
      days: activity.days,
      footprints: activity.footprints,
    };
    expect(parseTokenShareSnapshot(share)).toEqual(share);

    for (const privateField of [
      { userId: PUBLIC_ID },
      { realName: "刘横" },
      { email: "liuheng@example.com" },
      { campus: { school: "云杉大学" } },
      { membership: "lifetime" },
      { displayName: "刘横" },
    ]) {
      expect(() => parseTokenShareSnapshot({ ...share, ...privateField }))
        .toThrow("TOKEN_SHARE_INVALID");
    }
  });

  it("rejects an external HTTPS avatar in the Token share view", () => {
    const activity = activitySnapshot();
    expect(() => parseTokenShareSnapshot({
      avatarUrl: "https://evil.example/avatar.png",
      nickname: "云杉同学",
      publicId: PUBLIC_ID,
      snapshotVersion: activity.snapshotVersion,
      metrics: activity.metrics,
      days: activity.days,
      footprints: activity.footprints,
    })).toThrow("TOKEN_SHARE_INVALID");
  });

  it("rejects a reserved official-impersonation nickname in the Token share view", () => {
    const activity = activitySnapshot();
    expect(() => parseTokenShareSnapshot({
      avatarUrl: "/v1/my-ai/personal-profile/avatar?v=8",
      nickname: "StudyBuddy 官方",
      publicId: PUBLIC_ID,
      snapshotVersion: activity.snapshotVersion,
      metrics: activity.metrics,
      days: activity.days,
      footprints: activity.footprints,
    })).toThrow("TOKEN_SHARE_INVALID");
  });
});
