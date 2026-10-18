"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckIcon, DatabaseIcon, XIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import databases from "@/data/databases.json";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type Database = {
  id: string;
  name: string;
  url: string;
  description: string;
  category: string;
  domain: "science" | "finance";
};

const ALL_DATABASES = databases as Database[];

const DOMAIN_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  science: {
    bg: "bg-violet-500/10",
    text: "text-violet-600 dark:text-violet-400",
    border: "border-violet-500/20",
  },
  finance: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
    border: "border-emerald-500/20",
  },
};

function DomainDot({ domain }: { domain: string }) {
  return (
    <span
      className={cn(
        "inline-block size-1.5 rounded-full shrink-0",
        domain === "science" ? "bg-violet-500" : "bg-emerald-500"
      )}
    />
  );
}

/**
 * Picker UI for data sources — no trigger / no popover wrapper, so it can be
 * composed inside other containers (e.g. the unified AddContextMenu).
 */
export function DatabasePickerBody({
  selected,
  onChange,
  autoFocus = false,
}: {
  selected: Database[];
  onChange: (dbs: Database[]) => void;
  autoFocus?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [activeDomain, setActiveDomain] = useState<"all" | "science" | "finance">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedIds = useMemo(() => new Set(selected.map((d) => d.id)), [selected]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return ALL_DATABASES.filter((db) => {
      const domainMatch = activeDomain === "all" || db.domain === activeDomain;
      if (!domainMatch) return false;
      if (!q) return true;
      return (
        db.name.toLowerCase().includes(q) ||
        db.category.toLowerCase().includes(q) ||
        db.description.toLowerCase().includes(q)
      );
    });
  }, [search, activeDomain]);

  const grouped = useMemo(() => {
    const map = new Map<string, Database[]>();
    for (const db of filtered) {
      const key = db.category;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(db);
    }
    return map;
  }, [filtered]);

  const toggle = useCallback(
    (db: Database) => {
      if (selectedIds.has(db.id)) {
        onChange(selected.filter((d) => d.id !== db.id));
      } else {
        onChange([...selected, db]);
      }
    },
    [selected, selectedIds, onChange]
  );

  const clearAll = useCallback(() => onChange([]), [onChange]);

  useEffect(() => {
    if (autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  return (
    <>
      {/* Search + domain filter */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search databases…"
          className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
          {(["all", "science", "finance"] as const).map((d) => (
            <button
              key={d}
              onClick={() => setActiveDomain(d)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-medium capitalize transition-colors",
                activeDomain === d
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {d}
            </button>
          ))}
        </div>
        {selected.length > 0 && (
          <button
            onClick={clearAll}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors whitespace-nowrap"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Results */}
      <div className="max-h-72 overflow-y-auto py-1">
        {grouped.size === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">No databases found</div>
        ) : (
          Array.from(grouped.entries()).map(([category, dbs]) => (
            <div key={category}>
              <div className="sticky top-0 bg-background/95 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
                {category}
                <span className="ml-1.5 font-normal normal-case text-muted-foreground/60">
                  {dbs.length}
                </span>
              </div>
              {dbs.map((db) => {
                const isSelected = selectedIds.has(db.id);
                return (
                  <div
                    key={db.id}
                    onClick={() => toggle(db)}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-muted/60",
                      isSelected && "bg-muted/40"
                    )}
                  >
                    <div
                      className={cn(
                        "mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded border transition-colors",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background"
                      )}
                    >
                      {isSelected && <CheckIcon className="size-2.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <DomainDot domain={db.domain} />
                        <span className="font-medium text-foreground truncate">{db.name}</span>
                      </div>
                      <p className="mt-0.5 truncate text-muted-foreground/80">{db.description}</p>
                    </div>
                    <a
                      href={db.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 shrink-0 text-[10px] text-muted-foreground/50 hover:text-primary transition-colors"
                      title={db.url}
                    >
                      API ↗
                    </a>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t px-3 py-1.5">
        <span className="text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <DomainDot domain="science" /> Science
          </span>
          <span className="mx-2 text-border">·</span>
          <span className="inline-flex items-center gap-1">
            <DomainDot domain="finance" /> Finance
          </span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {filtered.length} of {ALL_DATABASES.length} databases
        </span>
      </div>
    </>
  );
}

export function DatabaseSelector({
  selected,
  onChange,
}: {
  selected: Database[];
  onChange: (dbs: Database[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const removeSelected = useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(selected.filter((d) => d.id !== id));
    },
    [selected, onChange]
  );

  const clearAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange([]);
    },
    [onChange]
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Trigger row */}
        <div
          className={cn(
            "flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 cursor-pointer transition-colors text-xs",
            open
              ? "border-border bg-muted/60"
              : "border-transparent hover:border-border hover:bg-muted/40",
            selected.length > 0 && "border-border"
          )}
          role="button"
          tabIndex={0}
        >
          <DatabaseIcon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground select-none whitespace-nowrap">
            {selected.length === 0 ? "Add data sources" : `${selected.length} source${selected.length !== 1 ? "s" : ""}`}
          </span>
          {selected.length > 0 && (
            <>
              <span className="mx-0.5 text-border">·</span>
              {/* Selected chips — max 3 shown inline */}
              <div className="flex min-w-0 items-center gap-1 overflow-hidden">
                {selected.slice(0, 3).map((db) => (
                  <span
                    key={db.id}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap",
                      DOMAIN_COLORS[db.domain].bg,
                      DOMAIN_COLORS[db.domain].text,
                      DOMAIN_COLORS[db.domain].border
                    )}
                  >
                    {db.name}
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => removeSelected(db.id, e)}
                      onKeyDown={(e) => e.key === "Enter" && removeSelected(db.id, e as unknown as React.MouseEvent)}
                      className="opacity-60 hover:opacity-100 cursor-pointer"
                    >
                      <XIcon className="size-2.5" />
                    </span>
                  </span>
                ))}
                {selected.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">+{selected.length - 3} more</span>
                )}
              </div>
              <span
                role="button"
                tabIndex={0}
                onClick={clearAll}
                onKeyDown={(e) => e.key === "Enter" && clearAll(e as unknown as React.MouseEvent)}
                className="ml-auto shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <XIcon className="size-3" />
              </span>
            </>
          )}
          <ChevronDownIcon
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform ml-auto",
              open && "rotate-180",
              selected.length > 0 && "hidden"
            )}
          />
        </div>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[480px] max-w-[calc(100vw-2rem)] p-0 overflow-hidden rounded-xl shadow-xl"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DatabasePickerBody selected={selected} onChange={onChange} autoFocus={open} />
      </PopoverContent>
    </Popover>
  );
}

/** Build a prompt suffix from selected databases */
export function buildDatabaseContext(selected: Database[]): string {
  if (selected.length === 0) return "";
  const lines = selected.map((db) => `- ${db.name} (${db.url}): ${db.description}`);
  return `\n\n[Data Sources Available]\n${lines.join("\n")}`;
}
