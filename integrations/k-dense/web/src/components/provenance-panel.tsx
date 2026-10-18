"use client";
import { researchError } from "@/lib/research-i18n";

import { researchText } from "@/lib/research-i18n";


/**
 * Lineage view for one sandbox artifact: what produced it, from which inputs,
 * in which run, by which model — plus the notebook entries that cite it.
 *
 * Three things this deliberately refuses to smooth over, because all are real
 * scientific hazards the rest of the app cannot see:
 *   - a `stale` artifact, whose bytes changed after the step that produced it
 *   - a citation written before the artifact's latest version, so the entry
 *     describes something other than what is on disk now
 *   - an upstream input that changed since it was consumed, so the artifact
 *     cannot be regenerated from what is on disk now
 */
import { cn } from "@/lib/utils";
import {
  getArtifactProvenance,
  type ArtifactProvenance,
  type ArtifactRef,
  type EdgeConfidence,
  type EnvironmentSnapshot,
  type Lineage,
  type LineageNode,
  type ProvenanceStep,
} from "@/lib/provenance";
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BotIcon,
  CircleHelpIcon,
  CpuIcon,
  FileInputIcon,
  FileOutputIcon,
  PackageIcon,
  RefreshCcwIcon,
  ShieldCheckIcon,
  UploadIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

const CONFIDENCE_COPY: Record<EdgeConfidence, { label: string; title: string }> = {
  observed: {
    label: researchText("observed"),
    title: researchText("The tool named this file and its bytes were hashed afterward."),
  },
  inferred: {
    label: researchText("inferred"),
    title:
      researchText("Attributed from evidence rather than direct observation: either a sandbox scan that could not be split between neighbouring steps, or a file the command line named that existed beforehand — a probable input, not a verified one."),
  },
  declared: {
    label: researchText("declared"),
    title: researchText("The model asserted this link and nothing verified it."),
  },
};

function ConfidenceBadge({ confidence }: { confidence: EdgeConfidence }) {
  const copy = CONFIDENCE_COPY[confidence];
  return (
    <span
      title={copy.title}
      className={cn(
        "shrink-0 rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider",
        confidence === "observed" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        confidence === "inferred" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        confidence === "declared" && "bg-muted text-muted-foreground",
      )}
    >
      {copy.label}
    </span>
  );
}

function shortHash(sha?: string): string | null {
  return sha ? sha.slice(0, 12) : null;
}

function ArtifactRow({
  ref_,
  onOpenFile,
}: {
  ref_: ArtifactRef;
  onOpenFile?: (path: string) => void;
}) {
  const hash = shortHash(ref_.sha256);
  return (
    <li className="flex items-baseline gap-1.5 py-0.5">
      <button
        type="button"
        disabled={!onOpenFile || ref_.change === "deleted"}
        onClick={() => onOpenFile?.(ref_.path)}
        className={cn(
          "truncate font-mono text-[11px]",
          onOpenFile && ref_.change !== "deleted"
            ? "text-foreground/80 underline-offset-2 hover:underline"
            : "text-foreground/60",
          ref_.change === "deleted" && "line-through",
        )}
        title={ref_.path}
      >
        {ref_.path}
      </button>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {ref_.change === "deleted" ? researchText("deleted") : formatBytes(ref_.size)}
      </span>
      {hash && (
        <span
          className="shrink-0 font-mono text-[10px] text-muted-foreground/70"
          title={`sha256:${ref_.sha256}`}
        >
          {hash}
        </span>
      )}
      {ref_.identityAt === "harvest" && (
        <span
          className="shrink-0 text-[10px] text-muted-foreground"
          title={researchText("Hashed when the subagent's record was parsed, not when the step wrote the file — the bytes may already have changed by then.")}
        >
          {researchText("hashed later")}</span>
      )}
      {ref_.hashSkipped && (
        <span
          className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400"
          title={
            ref_.hashSkipped === "too-large"
              ? researchText("Not hashed: above the size limit. Identity is size+mtime only.")
              : researchText("Not hashed: the file could not be read.")
          }
        >
          {researchText("unhashed")}</span>
      )}
      <ConfidenceBadge confidence={ref_.confidence} />
    </li>
  );
}

/** Who did it, in words a reader can act on. */
function actorLabel(step: ProvenanceStep): string {
  switch (step.role) {
    case "subagent":
      return researchText("subagent{0}", [step.agentName ? `: ${step.agentName}` : ""]);
    case "user":
      return step.toolName === "upload"
        ? researchText("uploaded by you")
        : step.toolName === "save"
          ? researchText("saved by you in the editor")
          : step.toolName === "move"
            ? researchText("moved by you")
            : step.toolName === "delete"
              ? researchText("deleted by you")
              : researchText("You");
    case "compute":
      return researchText("remote compute");
    default:
      return researchText("lead agent");
  }
}

function ActorIcon({ step, className }: { step: ProvenanceStep; className?: string }) {
  if (step.role === "user") {
    return step.toolName === "upload" ? (
      <UploadIcon className={className} />
    ) : (
      <UserIcon className={className} />
    );
  }
  if (step.role === "compute") return <CpuIcon className={className} />;
  return <WrenchIcon className={className} />;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

/** One-line environment summary plus an expandable package list. */
function EnvironmentLine({
  env,
  atHarvest,
}: {
  env: EnvironmentSnapshot;
  atHarvest?: boolean;
}) {
  const parts: string[] = [];
  if (env.python) {
    parts.push(
      researchText("Python {0}{1}{2}", [env.python.version ?? "?", env.python.source === "system" ? researchText(" (system)") : "", ""]) +
        (env.python.packages.length ? researchText(" · {0} packages", [env.python.packages.length]) : ""),
    );
  }
  if (env.r) parts.push(researchText("{0} · {1} packages", [env.r.version, env.r.packages.length]));
  for (const lock of env.lockfiles) parts.push(`${lock.path} ${lock.sha256.slice(0, 8)}`);
  if (env.git) parts.push(`git ${env.git.head.slice(0, 8)}`);
  if (parts.length === 0) parts.push(`${env.os.platform} ${env.os.arch}`);
  const hasPackages = (env.python?.packages.length ?? 0) + (env.r?.packages.length ?? 0) > 0;
  return (
    <details className="mt-1.5">
      <summary
        className="flex cursor-pointer items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
        title={researchText("Environment {0}", [env.id])}
      >
        <PackageIcon className="size-2.5 shrink-0" />
        <span className="truncate">{parts.join(" · ")}</span>
        {atHarvest && (
          <span
            className="shrink-0 text-muted-foreground/70"
            title={researchText("Captured when the subagent's record was parsed, not when the step ran — the subagent may have changed the environment in between.")}
          >
            {researchText("(captured later)")}</span>
        )}
      </summary>
      <div className="mt-1 rounded bg-muted/50 p-1.5 font-mono text-[10px] leading-relaxed">
        <p>
          {env.os.platform} {env.os.release} {env.os.arch}
          {env.tools?.uv ? ` · uv ${env.tools.uv}` : ""}
        </p>
        {env.git && <p>git HEAD {env.git.head}</p>}
        {env.lockfiles.map((lock) => (
          <p key={lock.path} className="truncate" title={`sha256:${lock.sha256}`}>
            {lock.path} sha256:{lock.sha256.slice(0, 16)}
          </p>
        ))}
        {hasPackages && (
          <div className="mt-1 max-h-48 overflow-auto">
            {env.python?.packages.map((pkg) => (
              <p key={`py-${pkg.name}`}>
                {pkg.name}=={pkg.version}
              </p>
            ))}
            {env.python?.packagesTruncated ? (
              <p className="text-muted-foreground">
                + {env.python.packagesTruncated} {" "}{researchText("more Python packages not recorded")}</p>
            ) : null}
            {env.r?.packages.map((pkg) => (
              <p key={`r-${pkg.name}`}>
                R: {pkg.name} {pkg.version}
              </p>
            ))}
            {env.r?.packagesTruncated ? (
              <p className="text-muted-foreground">
                + {env.r.packagesTruncated} {" "}{researchText("more R packages not recorded")}</p>
            ) : null}
          </div>
        )}
      </div>
    </details>
  );
}

function StepCard({
  step,
  target,
  environment,
  onOpenFile,
}: {
  step: ProvenanceStep;
  target: string;
  environment?: EnvironmentSnapshot;
  onOpenFile?: (path: string) => void;
}) {
  const outputRef = step.outputs.find((o) => o.path === target);
  const otherOutputs = step.outputs.filter((o) => o.path !== target);
  return (
    <div className="rounded-md border bg-card/40 p-2.5">
      <div className="flex items-center gap-1.5">
        <ActorIcon step={step} className="size-3 shrink-0 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{step.toolName}</span>
        {step.isError && (
          <span className="rounded bg-destructive/10 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-destructive">
            {researchText("error")}</span>
        )}
        {outputRef && <ConfidenceBadge confidence={outputRef.confidence} />}
        {/* The target's own ref is summarised by the badge above rather than
            rendered as an ArtifactRow, so its timing marker has to live here or
            the card silently implies a write-time hash it does not have. */}
        {outputRef?.identityAt === "harvest" && (
          <span
            className="shrink-0 text-[10px] text-muted-foreground"
            title={researchText("This step ran inside a subagent, so the file was hashed when its record was parsed rather than when the step wrote it.")}
          >
            {researchText("hashed later")}</span>
        )}
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {formatWhen(step.timestamp)}
        </span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
        {step.model && (
          <span className="flex items-center gap-1">
            <BotIcon className="size-2.5" />
            <span className="font-mono">{step.model}</span>
          </span>
        )}
        <span title={step.role === "subagent" ? step.agentName : undefined}>{actorLabel(step)}</span>
        {step.compute && (
          <span
            className="font-mono"
            title={researchText("Modal job {0}{1}", [step.compute.jobId, step.compute.sandboxId ? ` · sandbox ${step.compute.sandboxId}` : ""])}
          >
            {step.compute.instance ?? "modal"}
            {step.compute.gpu ? ` · ${step.compute.gpu}` : ""}
            {step.compute.environment ? ` · ${step.compute.environment}` : ""}
            {step.compute.exitCode !== undefined ? researchText(" · exit {0}", [step.compute.exitCode]) : ""}
            {researchText(" · job {0}", [shortId(step.compute.jobId)])}
          </span>
        )}
        {step.runId && (
          <span className="font-mono" title={researchText("Run {0}", [step.runId])}>
            {researchText("run")}{" "}{step.runId.replace(/^run_/, "").slice(0, 8)}
          </span>
        )}
        {step.role !== "user" && (
          <span className="font-mono" title={researchText("Session {0}", [step.sessionId])}>
            {researchText("session")}{" "}{step.sessionId.slice(0, 8)}
          </span>
        )}
      </div>

      {step.compute?.missingOutputs?.length ? (
        <p className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangleIcon className="mt-px size-2.5 shrink-0" />
          {step.compute.missingOutputs.length === 1
            ? researchText("The remote job never produced {0}.", [step.compute.missingOutputs[0]])
            : researchText("The remote job never produced {0} requested outputs.", [step.compute.missingOutputs.length])}
        </p>
      ) : null}

      {environment && <EnvironmentLine env={environment} atHarvest={step.environmentAt === "harvest"} />}

      {step.degraded && (
        <p className="mt-1.5 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangleIcon className="mt-px size-2.5 shrink-0" />
          {step.degraded === "sandbox-too-large"
            ? researchText("Sandbox exceeded the scan budget — file attribution for this step is incomplete.")
            : step.degraded === "scan-failed"
              ? researchText("The sandbox scan failed — file attribution for this step is incomplete.")
              : researchText("Ran inside a subagent and was reconstructed afterward, so this step's file effects could not be observed directly. Any files below are attributed by timing, not observation.")}
        </p>
      )}

      {step.inputs.length > 0 && (
        <div className="mt-2">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <FileInputIcon className="size-2.5" /> {" "}{researchText("Inputs")}</p>
          <ul className="mt-0.5">
            {step.inputs.map((input) => (
              <ArtifactRow key={input.path} ref_={input} onOpenFile={onOpenFile} />
            ))}
          </ul>
        </div>
      )}

      {otherOutputs.length > 0 && (
        <div className="mt-2">
          <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <FileOutputIcon className="size-2.5" /> {" "}{researchText("Also wrote")}</p>
          <ul className="mt-0.5">
            {otherOutputs.map((output) => (
              <ArtifactRow key={output.path} ref_={output} onOpenFile={onOpenFile} />
            ))}
          </ul>
        </div>
      )}

      {step.truncatedEdges ? (
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          + {step.truncatedEdges} {" "}{researchText("more file")}{step.truncatedEdges === 1 ? "" : researchText("s")} {" "}{researchText("not recorded (per-step limit)")}</p>
      ) : null}

      {step.args !== undefined && (
        <details className="mt-2">
          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
            {researchText("Arguments")}</summary>
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-1.5 font-mono text-[10px] leading-relaxed">
            {JSON.stringify(step.args, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

const ROOT_COPY: Record<NonNullable<LineageNode["root"]>, { label: string; title: string }> = {
  upload: { label: researchText("uploaded"), title: researchText("You uploaded this file. This is where the chain starts.") },
  user: {
    label: researchText("created by you"),
    title: researchText("You created this file in the editor; nothing recorded fed into it."),
  },
  unrecorded: {
    label: researchText("no recorded origin"),
    title:
      researchText("No recorded step produced the version that was used here. It predates provenance recording, arrived outside the sandbox API, or was written during a run whose attribution degraded."),
  },
  budget: {
    label: researchText("walk stopped"),
    title: researchText("The upstream walk reached its depth limit here."),
  },
};

/**
 * Upstream tree: the artifact at the top, each input indented beneath the
 * step that consumed it, down to uploads or the edge of the record. A DAG can
 * reach the same input twice; it is expanded once and referenced after.
 */
function LineageTree({
  lineage,
  target,
  onOpenFile,
}: {
  lineage: Lineage;
  target: string;
  onOpenFile?: (path: string) => void;
}) {
  const nodes = new Map(lineage.nodes.map((node) => [node.path, node]));
  const inputsOf = new Map<string, Lineage["edges"]>();
  for (const edge of lineage.edges) {
    const list = inputsOf.get(edge.to) ?? [];
    list.push(edge);
    inputsOf.set(edge.to, list);
  }
  const expanded = new Set<string>();

  const renderNode = (
    path: string,
    depth: number,
    viaConfidence?: EdgeConfidence,
  ): ReactNode => {
    const node = nodes.get(path);
    const step = node?.stepId ? lineage.steps[node.stepId] : undefined;
    const repeated = expanded.has(path);
    expanded.add(path);
    const inputs = repeated ? [] : (inputsOf.get(path) ?? []);
    return (
      <li key={`${depth}:${path}`} className="min-w-0">
        <div
          className="flex min-w-0 items-baseline gap-1.5 py-0.5"
          style={{ paddingLeft: `${depth * 14}px` }}
        >
          {depth > 0 && <span className="shrink-0 text-muted-foreground/60">└</span>}
          <button
            type="button"
            disabled={!onOpenFile || node?.current === null}
            onClick={() => onOpenFile?.(path)}
            className={cn(
              "truncate font-mono text-[11px]",
              onOpenFile && node?.current !== null
                ? "text-foreground/80 underline-offset-2 hover:underline"
                : "text-foreground/60",
              node?.current === null && "line-through",
              depth === 0 && "font-medium",
            )}
            title={path}
          >
            {path}
          </button>
          {step && (
            <span
              className="shrink-0 truncate text-[10px] text-muted-foreground"
              title={`${step.toolName} · ${actorLabel(step)} · ${formatWhen(step.timestamp)}`}
            >
              {step.role === "agent" || step.role === "subagent" ? `${step.toolName} · ` : ""}
              {actorLabel(step)}
            </span>
          )}
          {viaConfidence && viaConfidence !== "observed" && (
            <ConfidenceBadge confidence={viaConfidence} />
          )}
          {node?.root && node.root !== "user" && node.root !== "upload" && (
            <span
              className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground"
              title={ROOT_COPY[node.root].title}
            >
              {ROOT_COPY[node.root].label}
            </span>
          )}
          {node?.changedSinceUse === true && (
            <span
              className="flex shrink-0 items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400"
              title={researchText("The bytes on disk differ from the version this step consumed. Whatever was built from it may not be reproducible from the current file.")}
            >
              <AlertTriangleIcon className="size-2.5" /> {" "}{researchText("changed since use")}</span>
          )}
          {repeated && (
            <span className="shrink-0 text-[10px] text-muted-foreground/70">{researchText("(shown above)")}</span>
          )}
        </div>
        {inputs.length > 0 && (
          <ul>
            {inputs.map((edge) => renderNode(edge.from, depth + 1, edge.confidence))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div>
      <ul>{renderNode(target, 0)}</ul>
      {lineage.truncated && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          {researchText("Upstream walk stopped at its limit — the record continues beyond what is shown.")}</p>
      )}
    </div>
  );
}

const STALENESS_COPY = {
  current: {
    Icon: ShieldCheckIcon,
    className: "text-emerald-600 dark:text-emerald-400",
    text: "Current — the bytes on disk match what the producing step recorded.",
  },
  stale: {
    Icon: AlertTriangleIcon,
    className: "text-amber-600 dark:text-amber-400",
    text: "Stale — this file changed after the step that produced it. Anything citing it may describe a different version.",
  },
  unknown: {
    Icon: CircleHelpIcon,
    className: "text-muted-foreground",
    text: "Unverified — no recorded hash to compare against, so sameness could not be checked.",
  },
  /**
   * Also "unknown" on the wire, but for a different reason worth stating: the
   * bytes match a hash taken when the subagent's record was parsed rather than
   * when the step wrote the file, so this only rules out changes since then.
   */
  unknownRetrospective: {
    Icon: CircleHelpIcon,
    className: "text-muted-foreground",
    text: "Unchanged since this record was reconstructed — but the producing step ran inside a subagent and its bytes were never hashed at the time, so a match cannot confirm this is what it produced.",
  },
} as const;

export interface ProvenancePanelProps {
  path: string;
  projectId: string;
  onOpenFile?: (path: string) => void;
  /**
   * Jump to a notebook entry in the Lab Notebook view. The notebook view is
   * scoped to the active tab's session, so a citation from a different session
   * opens the notebook without focusing the entry.
   */
  onOpenNotebookEntry?: (entryId: string) => void;
}

export function ProvenancePanel({
  path,
  projectId,
  onOpenFile,
  onOpenNotebookEntry,
}: ProvenancePanelProps) {
  const [data, setData] = useState<ArtifactProvenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getArtifactProvenance(path, projectId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, projectId]);

  useEffect(() => load(), [load]);

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {researchText("Loading provenance…")}</div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <AlertTriangleIcon className="size-5 text-muted-foreground/40" />
        <p className="text-xs text-muted-foreground">{researchError(error)}</p>
        <button
          onClick={load}
          className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <RefreshCcwIcon className="size-3" /> {" "}{researchText("Retry")}</button>
      </div>
    );
  }

  if (!data) return null;

  const hasHistory = data.producedBy.length > 0;
  // Distinguish "we have no hash" from "we have one, but it was taken too late
  // to certify anything" — both arrive as `unknown`.
  const latestRef = data.producedBy[0]?.outputs.find((o) => o.path === data.path);
  const staleness =
    data.staleness === "unknown" && latestRef?.identityAt === "harvest" && latestRef.sha256
      ? STALENESS_COPY.unknownRetrospective
      : STALENESS_COPY[data.staleness];

  return (
    <div className="h-full overflow-auto px-3 py-3">
      {/* Identity */}
      <div className="rounded-md border bg-card/40 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {researchText("This version")}</p>
          <button
            onClick={load}
            disabled={loading}
            className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            title={researchText("Re-read from disk")}
          >
            <RefreshCcwIcon className={cn("size-2.5", loading && "animate-spin")} /> {" "}{researchText("Refresh")}</button>
        </div>
        {data.current ? (
          <div className="mt-1 space-y-0.5">
            <p className="font-mono text-[11px] text-foreground/80">
              sha256:{data.current.sha256 ?? "—"}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {formatBytes(data.current.size)} {" "}{researchText("· modified")}{" "}{formatWhen(data.current.mtimeMs)}
            </p>
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {researchText("This file no longer exists in the sandbox.")}</p>
        )}
        <p className={cn("mt-2 flex items-start gap-1 text-[10px]", staleness.className)}>
          <staleness.Icon className="mt-px size-2.5 shrink-0" />
          {researchText(staleness.text)}
        </p>
      </div>

      {/* Upstream lineage: only worth a section once there is more than the
          artifact itself in it. */}
      {data.lineage && data.lineage.edges.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {researchText("Lineage")}</p>
          <div data-testid="provenance-lineage" className="rounded-md border bg-card/40 px-2.5 py-2">
            <LineageTree lineage={data.lineage} target={data.path} onOpenFile={onOpenFile} />
          </div>
        </div>
      )}

      {/* Producing steps */}
      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {researchText("Produced by")}{" "}{hasHistory ? `(${data.producedBy.length})` : ""}
        </p>
        {hasHistory ? (
          <div className="space-y-2">
            {data.producedBy.map((step) => (
              <StepCard
                key={step.id}
                step={step}
                target={data.path}
                environment={
                  step.environmentId ? data.environments?.[step.environmentId] : undefined
                }
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed px-2.5 py-3 text-[11px] leading-relaxed text-muted-foreground">
            {researchText("No recorded provenance. Either this file predates provenance recording, it was uploaded rather than produced by the agent, or it was written during a run whose attribution degraded.")}</p>
        )}
      </div>

      {/* Notebook citations */}
      {data.citedBy.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {researchText("Cited in the notebook (")}{data.citedBy.length})
          </p>
          <div className="space-y-1">
            {data.citedBy.map((citation) => (
              <button
                key={citation.id}
                type="button"
                disabled={!onOpenNotebookEntry}
                onClick={() => onOpenNotebookEntry?.(citation.id)}
                className={cn(
                  "flex w-full items-start gap-1.5 rounded-md border bg-card/40 px-2 py-1.5 text-left",
                  onOpenNotebookEntry && "hover:bg-muted/50",
                )}
              >
                <span className="mt-px shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                  {researchText(citation.type ?? "")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-foreground/90">
                    {citation.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-muted-foreground">
                    {researchText(citation.role ?? "")} · {formatWhen(citation.timestamp)}
                  </span>
                  {citation.precedesLatestOutput && (
                    <span className="mt-0.5 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                      <AlertTriangleIcon className="mt-px size-2.5 shrink-0" />
                      {researchText("Written before the latest version of this file — the entry may describe different bytes.")}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Downstream reads */}
      {data.readByTotal > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {researchText("Read by (")}{data.readByTotal})
          </p>
          <ul className="space-y-0.5">
            {data.readBy.map((step) => (
              <li
                key={step.id}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
              >
                <ArrowRightIcon className="size-2.5 shrink-0" />
                <span className="font-mono">{step.toolName}</span>
                <span className="text-[10px]">{formatWhen(step.timestamp)}</span>
              </li>
            ))}
          </ul>
          {data.readByTotal > data.readBy.length && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              + {data.readByTotal - data.readBy.length} {" "}{researchText("more")}</p>
          )}
        </div>
      )}
    </div>
  );
}
