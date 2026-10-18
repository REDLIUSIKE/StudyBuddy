"use client";
import { researchError } from "@/lib/research-i18n";

import { researchText, researchLocale } from "@/lib/research-i18n";

import { SubagentFleetPanel } from "./subagent-fleet-panel";

/**
 * Project "Automation" tab: pi-subagents durable schedules (recurring or
 * one-shot specialist runs that fire from Kady's resident session, even with
 * no chat tab open) and missions (durable records of delegated work).
 * Schedules are created conversationally ("run the QC pipeline every 6h");
 * this panel shows and controls them.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClockIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FlagIcon,
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  Trash2Icon,
  ZapIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  closeMission,
  getMissions,
  getSchedules,
  scheduleAction,
  type MissionView,
  type ScheduleAction,
  type ScheduleView,
} from "@/lib/automation";
import { cn, formatUsd } from "@/lib/utils";
import { SettingsLink } from "@/components/settings-link";

const POLL_MS = 10_000;

const RUN_STATE_LABEL: Record<ScheduleView["runs"][number]["state"], string> = {
  running: "running",
  skipped: "skipped (overlap)",
  missed: "missed",
  completed: "completed",
  failed_launch: "failed to launch",
  failed_run: "failed",
};

/** pi-subagents redacts prompt-derived titles; name the run by its specialists instead. */
const REDACTED = "[prompt redacted]";
function missionLabel(m: MissionView): string {
  if (m.title && m.title !== REDACTED) return m.title;
  const agents = [...new Set(m.runs.map((r) => r.agent).filter((a): a is string => Boolean(a)))];
  return agents.length > 0 ? researchText("{0} run", [agents.join(", ")]) : researchText("Delegated run");
}

export function AutomationPanel({ projectId }: { projectId: string }) {
  const [schedules, setSchedules] = useState<ScheduleView[]>([]);
  const [missions, setMissions] = useState<MissionView[]>([]);
  const [heldByBudget, setHeldByBudget] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const { confirm, dialog } = useConfirm();

  const refresh = useCallback(async () => {
    // Schedules and missions come from different stores; one failing must not
    // hide the other.
    const [s, m] = await Promise.allSettled([getSchedules(projectId), getMissions(projectId)]);
    if (s.status === "fulfilled") {
      setSchedules(s.value.schedules);
      setHeldByBudget(s.value.heldByBudget);
    }
    if (m.status === "fulfilled") setMissions(m.value);
    const failures = [s, m].flatMap((r) =>
      r.status === "rejected" ? [r.reason instanceof Error ? r.reason.message : String(r.reason)] : [],
    );
    setError(failures.length > 0 ? failures.join(" · ") : null);
    setLoaded(true);
  }, [projectId]);

  useEffect(() => {
    setLoaded(false);
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = useCallback(
    async (schedule: ScheduleView, action: ScheduleAction) => {
      if (action === "delete") {
        const ok = await confirm({
          title: researchText("Delete schedule \"{0}\"?", [schedule.name]),
          description: researchText("Its definition and run history are removed. Runs already in progress finish normally."),
          confirmLabel: researchText("Delete"),
          destructive: true,
        });
        if (!ok) return;
      }
      setBusy(`${action}:${schedule.id}`);
      setError(null);
      setNotice(null);
      try {
        const result = await scheduleAction(schedule.id, action, projectId);
        setSchedules(result.schedules);
        // Only a manual fire has news worth reading (started, or skipped as an overlap).
        if (action === "run" && result.message) setNotice(result.message.split("\n")[0]);
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : researchText("Could not {0} the schedule", [researchText(action)]));
      } finally {
        setBusy(null);
      }
    },
    [confirm, projectId],
  );

  const close = useCallback(
    async (mission: MissionView) => {
      const ok = await confirm({
        title: researchText("Close mission \"{0}\"?", [missionLabel(mission)]),
        description: researchText("Marks it cancelled. Linked runs are not stopped."),
        confirmLabel: researchText("Close mission"),
      });
      if (!ok) return;
      setBusy(`close:${mission.id}`);
      try {
        setMissions(await closeMission(mission.id, projectId));
      } catch (exc) {
        setError(exc instanceof Error ? exc.message : researchText("Could not close the mission"));
      } finally {
        setBusy(null);
      }
    },
    [confirm, projectId],
  );

  // "Run started" goes stale as soon as the row's own state catches up.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 10_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const openMissions = useMemo(() => missions.filter((m) => !["completed", "failed", "cancelled"].includes(m.status)), [missions]);
  const closedMissions = useMemo(() => missions.filter((m) => ["completed", "failed", "cancelled"].includes(m.status)), [missions]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4" data-testid="automation-panel">
      <SubagentFleetPanel key={projectId} projectId={projectId} />
      {dialog}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium">{researchText("Automation")}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {researchText("Recurring and one-shot specialist runs, plus durable missions. Ask Kady to create one (&ldquo;re-run the QC report every 6 hours&rdquo;); they fire from a resident session even with no chat open and pause automatically when the project spend limit is reached.")}</p>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => void refresh()} aria-label={researchText("Refresh automation")}>
          <RefreshCwIcon className="size-3.5" />
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{researchError(error)}</p>}
      {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
      {heldByBudget.length > 0 && (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
          {heldByBudget.length} {" "}{researchText("schedule")}{heldByBudget.length === 1 ? researchText(" is") : researchText("s are")} {" "}{researchText("held because the project reached its spend limit.")}{" "}
          <SettingsLink tab="project" section="budget">
            {researchText("Raise the limit in project settings")}</SettingsLink>{" "}
          {researchText("and they resume on their own.")}</p>
      )}

      <section aria-label={researchText("Schedules")} className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <AlarmClockIcon className="size-3.5" /> {" "}{researchText("Schedules")}</h4>
        {!loaded ? (
          <p className="text-xs text-muted-foreground">{researchText("Loading…")}</p>
        ) : schedules.length === 0 ? (
          <p className="rounded-lg border px-3 py-2.5 text-xs text-muted-foreground">
            {researchText("No schedules yet. In a chat: &ldquo;every night at 2am, have the data validator re-check user_data and log a notebook entry&rdquo;.")}</p>
        ) : (
          schedules.map((s) => {
            const expanded = open[s.id] ?? false;
            const rowBusy = busy?.endsWith(`:${s.id}`) ?? false;
            return (
              <div key={s.id} className="rounded-lg border" data-schedule={s.id}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => setOpen((o) => ({ ...o, [s.id]: !expanded }))}
                    aria-expanded={expanded}
                    aria-label={`${expanded ? "Collapse" : "Expand"} ${s.name}`}
                  >
                    {expanded ? <ChevronDownIcon className="size-3.5 shrink-0" /> : <ChevronRightIcon className="size-3.5 shrink-0" />}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                        <span>{s.name}</span>
                        {s.heldByBudget ? (
                          <Badge variant="outline" className="h-5 text-[10px] text-amber-600">{researchText("Held: spend limit")}</Badge>
                        ) : s.paused ? (
                          <Badge variant="outline" className="h-5 text-[10px]">{researchText("Paused")}</Badge>
                        ) : s.activeRunId ? (
                          <Badge variant="secondary" className="h-5 text-[10px]">{researchText("Running")}</Badge>
                        ) : null}
                      </div>
                      <div className="truncate text-[11px] text-muted-foreground">
                        {s.trigger.kind === "interval"
                          ? researchText("every {0}{1}", [s.trigger.every, s.trigger.nextRunAt && !s.paused ? researchText(" · next {0}", [new Date(s.trigger.nextRunAt).toLocaleString(researchLocale())]) : ""])
                          : researchText("once at {0}", [new Date(s.trigger.nextRunAt ?? s.trigger.at).toLocaleString(researchLocale())])}
                        {s.lastRun ? researchText(" · last {0}", [RUN_STATE_LABEL[s.lastRun.state]]) : ""}
                        {s.spendUsd > 0 ? researchText(" · {0} spent", [formatUsd(s.spendUsd)]) : ""}
                      </div>
                    </div>
                  </button>
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={researchText("Run {0} now", [s.name])} title={s.heldByBudget ? researchText("Held until the spend limit is raised") : researchText("Run {0} now", [s.name])} disabled={rowBusy || s.heldByBudget} onClick={() => void act(s, "run")}>
                    {busy === `run:${s.id}` ? <Loader2Icon className="size-3.5 animate-spin" /> : <ZapIcon className="size-3.5" />}
                  </Button>
                  {s.paused ? (
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={researchText("Resume {0}", [s.name])} disabled={rowBusy || s.heldByBudget} onClick={() => void act(s, "resume")}>
                      <PlayIcon className="size-3.5" />
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={researchText("Pause {0}", [s.name])} disabled={rowBusy} onClick={() => void act(s, "pause")}>
                      <PauseIcon className="size-3.5" />
                    </Button>
                  )}
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" aria-label={researchText("Delete {0}", [s.name])} disabled={rowBusy} onClick={() => void act(s, "delete")}>
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </div>
                {expanded && (
                  <div className="border-t px-3 py-2 text-[11px]">
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">{s.workflowScript}</pre>
                    <div className="mt-2 text-muted-foreground">
                      {researchText("model:")}{" "}{s.model ?? researchText("inherited from the project's latest chat model")}
                      {s.quiet ? researchText(" · quiet (successful fires don't wake Kady)") : ""}
                      {" · "}{researchText("catch-up:")}{" "}{s.catchUp}
                      {s.timeoutMs ? researchText(" · timeout {0} min", [Math.round(s.timeoutMs / 60000)]) : ""}
                      {s.baseRef ? researchText(" · base {0}", [s.baseRef]) : ""}
                    </div>
                    {s.runs.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-0.5">
                        {s.runs.map((r) => (
                          <li key={r.id} className={cn("flex flex-wrap items-center gap-x-2", r.state.startsWith("failed") && "text-destructive")}>
                            <span className="font-mono text-[10px] text-muted-foreground">{new Date(r.plannedAt).toLocaleString()}</span>
                            <span>{researchText(RUN_STATE_LABEL[r.state] ?? "")}</span>
                            <span className="text-muted-foreground">({researchText(r.dueReason ?? "")})</span>
                            {r.error && <span className="w-full break-words">{r.error}</span>}
                            {r.summary && !r.error && (
                              <span className="w-full whitespace-pre-wrap break-words rounded bg-muted/40 px-2 py-1 text-[10px] text-foreground">{r.summary}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <section aria-label={researchText("Missions")} className="flex flex-col gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FlagIcon className="size-3.5" /> {" "}{researchText("Missions")}</h4>
        {loaded && missions.length === 0 && (
          <p className="rounded-lg border px-3 py-2.5 text-xs text-muted-foreground">
            {researchText("No missions recorded. Multi-step delegations Kady runs create one automatically; they survive restarts and hold decisions, artifacts and receipts.")}</p>
        )}
        {[...openMissions, ...closedMissions].map((m) => (
          <div key={m.id} className={cn("rounded-lg border px-3 py-2", ["completed", "failed", "cancelled"].includes(m.status) && "opacity-70")} data-mission={m.id}>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                  <span>{missionLabel(m)}</span>
                  <Badge variant={m.status === "needs_decision" ? "destructive" : "outline"} className="h-5 text-[10px]">{researchText(m.status.replace("_", " ") ?? "")}</Badge>
                  {m.goal && <Badge variant="secondary" className="h-5 text-[10px]">{researchText("goal ·")}{" "}{researchText(m.goal.status ?? "")}</Badge>}
                </div>
                {m.objective && m.objective !== REDACTED && <div className="truncate text-[11px] text-muted-foreground">{m.objective}</div>}
                <div className="text-[10px] text-muted-foreground">
                  {m.runs.length} {" "}{researchText("run")}{m.runs.length === 1 ? "" : researchText("s")}
                  {m.decisions.some((d) => d.status === "open") ? researchText(" · {0} open decision(s)", [m.decisions.filter((d) => d.status === "open").length]) : ""}
                  {m.usage?.tokens ? researchText(" · {0} tokens", [m.usage.tokens.toLocaleString()]) : ""}
                  {m.budget?.tokens ? researchText(" / {0} budget", [m.budget.tokens.toLocaleString()]) : ""}
                  {researchText(" · updated {0}", [new Date(m.updatedAt).toLocaleString()])}
                </div>
              </div>
              {!["completed", "failed", "cancelled"].includes(m.status) && (
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px]" aria-label={researchText("Close mission {0}", [missionLabel(m)])} disabled={busy === `close:${m.id}`} onClick={() => void close(m)}>
                  {researchText("Close")}</Button>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
