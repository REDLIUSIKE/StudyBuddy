"use client";
import { researchText } from "@/lib/research-i18n";


import { useMemo } from "react";

import {
  type Annotation,
  colorForAuthor,
} from "@/lib/pdf-annotations";
import { cn } from "@/lib/utils";

export interface AnnotationSidebarProps {
  annotations: Annotation[];
  onJump: (a: Annotation) => void;
  onRemove: (id: string) => void;
}

export function AnnotationSidebar({
  annotations,
  onJump,
}: AnnotationSidebarProps) {
  const groups = useMemo(() => {
    const byPage = new Map<number, Annotation[]>();
    for (const a of annotations) {
      if (!byPage.has(a.page)) byPage.set(a.page, []);
      byPage.get(a.page)!.push(a);
    }
    return Array.from(byPage.entries()).sort((a, b) => a[0] - b[0]);
  }, [annotations]);

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l bg-background/40 md:flex">
      <div className="shrink-0 border-b px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {researchText("Annotations")}<span className="ml-1 text-foreground/60">({annotations.length})</span>
      </div>
      <div className="flex-1 overflow-auto">
        {groups.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            {researchText("No annotations yet. Select text and click")}{" "}
            <span className="font-medium">{researchText("Highlight")}</span> {" "}{researchText("or click")}{" "}
            <span className="font-medium">{researchText("Add note")}</span>.
          </div>
        )}
        {groups.map(([page, anns]) => (
          <div key={page} className="border-b">
            <div className="sticky top-0 z-10 bg-background/90 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
              {researchText("Page")}{" "}{page}
            </div>
            <ul>
              {anns.map((a) => {
                const color = a.color || colorForAuthor(a.author);
                const snippet =
                  a.type === "highlight"
                    ? a.text
                    : a.body;
                return (
                  <li key={a.id}>
                    <button
                      onClick={() => onJump(a)}
                      className={cn(
                        "flex w-full items-start gap-2 px-3 py-2 text-left text-xs hover:bg-muted/60",
                      )}
                    >
                      <span
                        className="mt-0.5 inline-block size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="truncate">{a.author.label}</span>
                          <span>·</span>
                          <span>{a.type}</span>
                        </div>
                        <div className="line-clamp-3 text-foreground/90">
                          {snippet || (
                            <span className="italic text-muted-foreground">
                              {researchText("(empty)")}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
