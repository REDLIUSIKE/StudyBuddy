"use client";
/** Read-only native notebook refresh; it never submits or replays a model action. */
import { useEffect, useState } from "react";
import { apiFetch } from "./projects";
import type { NotebookEntry } from "./notebook";
export function useNativeNotebook(projectId: string, sessionId: string | undefined, visible: boolean) {
  const [entries, setEntries] = useState<NotebookEntry[]>([]);
  useEffect(() => { setEntries([]); }, [projectId, sessionId]);
  useEffect(() => {
    if (!sessionId || !visible) return;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const read = async () => {
      try {
        const response = await apiFetch(`/sessions/${encodeURIComponent(sessionId)}/notebook`, { signal: controller.signal }, projectId);
        if (response.ok) {
          const result: unknown = await response.json();
          if (alive && result && typeof result === "object" && "entries" in result && Array.isArray(result.entries)) setEntries(result.entries as NotebookEntry[]);
        }
      } catch (error) { if (!controller.signal.aborted) console.warn("Native notebook refresh unavailable"); }
      if (alive) timer = setTimeout(() => { void read(); }, 5000);
    };
    void read();
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [projectId, sessionId, visible]);
  return entries;
}
