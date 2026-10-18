"use client";
import { researchText } from "@/lib/research-i18n";


import {
  BookCheckIcon,
  BookXIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CitationEntry, CitationReport } from "@/lib/use-agent";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<CitationEntry["kind"], string> = {
  doi: "DOI",
  arxiv: "arXiv",
  pubmed: "PubMed",
  url: "URL",
};

export function CitationBadge({ report }: { report: CitationReport }) {
  const [copied, setCopied] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const order: Record<CitationEntry["status"], number> = {
      unresolved: 0,
      skipped: 1,
      verified: 2,
    };
    return [...report.entries].sort(
      (a, b) => order[a.status] - order[b.status]
    );
  }, [report.entries]);

  if (report.loading) {
    return (
      <div className="inline-flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
        <Loader2Icon className="size-3 animate-spin" />
        {researchText("Verifying citations...")}</div>
    );
  }

  if (report.total === 0) return null;

  const allVerified = report.unresolved === 0;
  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      // best-effort
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1.5 mt-2 rounded-full border px-2.5 py-1 text-xs transition-colors",
            allVerified
              ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
              : "border-amber-500/30 bg-amber-500/5 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
          )}
          title={researchText("Click to see citation resolver details")}
        >
          {allVerified ? (
            <BookCheckIcon className="size-3" />
          ) : (
            <BookXIcon className="size-3" />
          )}
          <span>
            {report.total} {report.total === 1 ? researchText("citation") : researchText("citations")}
            {" \u00b7 "}
            {report.verified} {" "}{researchText("verified")}{report.unresolved > 0 ? researchText(" · {0} unresolved", [report.unresolved]) : ""}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[420px] max-h-[480px] overflow-y-auto p-0"
      >
        <div className="px-3 py-2 border-b text-xs text-muted-foreground">
          {researchText("Deterministic resolver pass. Authority checks: doi.org, arXiv API, PubMed E-utilities, HTTP HEAD.")}</div>
        <ul className="divide-y">
          {sorted.map((entry, idx) => {
            const key = `${entry.kind}:${entry.identifier}:${idx}`;
            const statusColor =
              entry.status === "verified"
                ? "text-emerald-600 dark:text-emerald-400"
                : entry.status === "unresolved"
                ? "text-red-600 dark:text-red-400"
                : "text-muted-foreground";
            return (
              <li key={key} className="px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {KIND_LABELS[entry.kind]}
                  </span>
                  <span className={cn("font-medium", statusColor)}>
                    {entry.status}
                  </span>
                </div>
                <div className="mt-1 font-mono break-all leading-snug">
                  {entry.identifier}
                </div>
                {entry.title && (
                  <div className="mt-1 text-muted-foreground line-clamp-2">
                    {entry.title}
                  </div>
                )}
                {entry.error && entry.status !== "verified" && (
                  <div className="mt-1 text-red-600/80 dark:text-red-400/80">
                    {entry.error}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      copyToClipboard(entry.identifier, `copy-${key}`)
                    }
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                  >
                    {copied === `copy-${key}` ? (
                      <CheckIcon className="size-3" />
                    ) : (
                      <CopyIcon className="size-3" />
                    )}
                    <span>{researchText("copy")}</span>
                  </button>
                  {entry.url && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLinkIcon className="size-3" />
                      <span>{researchText("open")}</span>
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
