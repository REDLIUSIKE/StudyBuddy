"use client";
import { researchError } from "@/lib/research-i18n";

import { researchText } from "@/lib/research-i18n";
import { researchLocale } from "@/lib/research-i18n";

import { researchBrand, runtimeProfile } from "@/lib/runtime-profile";
import { nativeResearchRequest } from "@/lib/research-host";

import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowUpRightIcon,
  ChevronRightIcon,
  FolderIcon,
  MoreHorizontalIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  SunIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SettingsDialog } from "@/components/lazy-surfaces";
import { ProjectCreateDialog } from "@/components/project-create-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEFAULT_PROJECT_ID, type Project } from "@/lib/projects";
import type { ProjectActivitySummary } from "@/lib/project-activity";
import { onOpenSettings, type OpenSettingsRequest } from "@/lib/settings-nav";
import { useProjects } from "@/lib/use-projects";
import { cn } from "@/lib/utils";
import { APP_VERSION, isVersioned } from "@/lib/version";

interface ProjectViewProps {
  onOpenProject: (projectId: string) => void;
  projectActivities?: Readonly<Record<string, ProjectActivitySummary>>;
  /** False while hidden behind a workspace; gates the Settings deep-link listener. */
  isActive?: boolean;
}

type ProjectSort = "recent" | "name" | "status";

function projectActivityLabel(project: Project): string {
  const value = project.updatedAt || project.createdAt;
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return researchText("No recent activity");
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const then = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDifference = Math.round(
    (today.getTime() - then.getTime()) / 86_400_000,
  );
  if (dayDifference === 0) return researchText("Updated today");
  if (dayDifference === 1) return researchText("Updated yesterday");
  if (dayDifference > 1 && dayDifference < 7) {
    return researchText("Updated {0} days ago", [dayDifference]);
  }
  return researchText("Updated {0}", [new Intl.DateTimeFormat(researchLocale(), {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date)]);
}

function projectActivityPriority(
  activity: ProjectActivitySummary | undefined,
): number {
  if (!activity) return 0;
  if (activity.needsInput > 0) return 5;
  if (activity.errors > 0) return 4;
  if (activity.blocked > 0) return 3;
  if (activity.running > 0) return 2;
  if (activity.done > 0) return 1;
  return 0;
}

function projectTimestamp(project: Project): number {
  const timestamp = Date.parse(project.updatedAt || project.createdAt);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function sortProjects(
  projects: Project[],
  sort: ProjectSort,
  activities: Readonly<Record<string, ProjectActivitySummary>>,
): Project[] {
  return [...projects].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "status") {
      const priority =
        projectActivityPriority(activities[b.id]) -
        projectActivityPriority(activities[a.id]);
      if (priority !== 0) return priority;
    }
    return projectTimestamp(b) - projectTimestamp(a);
  });
}

function projectBudgetLabel(limit: number): string {
  return `${new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: limit % 1 === 0 ? 0 : 2,
  }).format(limit)} budget`;
}

export function ProjectView({
  onOpenProject,
  projectActivities = {},
  isActive = true,
}: ProjectViewProps) {
  const {
    projects,
    activeProjectId,
    loading,
    error,
    setActive,
    refresh,
    update,
    remove,
  } = useProjects();
  const { resolvedTheme, setTheme } = useTheme();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsRequest, setSettingsRequest] = useState<OpenSettingsRequest | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProjectSort>("recent");
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  // Deep links into Settings while the Projects view is on screen.
  useEffect(() => {
    if (!isActive) return;
    return onOpenSettings((request) => {
      setSettingsRequest(request);
      setSettingsOpen(true);
    });
  }, [isActive]);

  const { visibleProjects, archivedProjects } = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matching = query
      ? projects.filter((project) =>
          [
            project.name,
            project.description,
            project.id,
            ...project.tags,
          ].some((value) => value.toLowerCase().includes(query)),
        )
      : projects;
    return {
      visibleProjects: sortProjects(
        matching.filter((project) => !project.archived),
        sort,
        projectActivities,
      ),
      archivedProjects: sortProjects(
        matching.filter((project) => project.archived),
        sort,
        projectActivities,
      ),
    };
  }, [projectActivities, projects, search, sort]);
  const showArchived = archivedOpen || search.trim().length > 0;

  const openCreate = useCallback(() => setCreateOpen(true), []);

  // Editing lives in Settings → Project, aimed at this card's project.
  const openEdit = useCallback((project: Project) => {
    setSettingsRequest({ tab: "project", projectId: project.id });
    setSettingsOpen(true);
  }, []);

  const handleOpen = useCallback(
    (projectId: string) => {
      setActive(projectId);
      onOpenProject(projectId);
    },
    [onOpenProject, setActive],
  );

  const handleToggleArchive = useCallback(
    async (project: Project) => {
      try {
        await update(project.id, { archived: !project.archived });
      } catch (exc) {
        toast.error(
          exc instanceof Error ? exc.message : researchText("Could not update project"),
        );
      }
    },
    [update],
  );

  const handleDelete = useCallback(
    async (project: Project) => {
      if (project.id === DEFAULT_PROJECT_ID) return;
      const confirmed = await confirm({
        title: researchText("Delete \"{0}\"?", [project.name]),
        description:
          researchText("Its sandbox files and chats will be permanently removed. This cannot be undone."),
        confirmLabel: researchText("Delete project"),
        destructive: true,
      });
      if (!confirmed) return;
      try {
        await remove(project.id);
      } catch (exc) {
        toast.error(
          exc instanceof Error ? exc.message : researchText("Could not delete project"),
        );
      }
    },
    [confirm, remove],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-muted/20">
      {confirmDialog}
      <header className="flex items-center justify-between border-b bg-background/90 px-6 py-3 backdrop-blur">
        <a
          href={researchBrand().website}
          target="_blank"
          rel="noopener noreferrer"
          onClick={event => { if (runtimeProfile() === 'studybuddy') { event.preventDefault(); void nativeResearchRequest({ kind: 'open-service-site', url: researchBrand().website }).catch(() => toast.error('无法打开系统浏览器，请重试')); } }}
          className="flex items-center gap-2"
        >
          {runtimeProfile() !== 'studybuddy' && <img
            src={researchBrand().logo}
            alt={researchBrand().name}
            className="h-7 w-auto object-contain dark:invert"
          />}
          <span className="text-sm font-semibold tracking-tight text-foreground/80">
            {runtimeProfile() === 'studybuddy' ? researchBrand().title : 'BYOK'}
          </span>
          {isVersioned && (
            <span className="text-[11px] text-muted-foreground/60">
              v{APP_VERSION}
            </span>
          )}
        </a>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={researchText("Open settings")}
            onClick={() => {
              setSettingsRequest(null);
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon />
          </Button>
          {mounted && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                resolvedTheme === "dark"
                  ? researchText("Switch to light mode")
                  : researchText("Switch to dark mode")
              }
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6 lg:py-10">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="flex max-w-2xl flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {researchText("Choose a project")}</h1>
            <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
              {researchText("Each project keeps its files, chats, notebook, and research settings separate.")}</p>
          </div>
          <Button onClick={openCreate}>
            <PlusIcon data-icon="inline-start" />
            {researchText("New project")}</Button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <InputGroup className="max-w-sm bg-background">
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
            <InputGroupInput
              aria-label={researchText("Search projects")}
              placeholder={researchText("Search projects…")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  size="icon-xs"
                  aria-label={researchText("Clear project search")}
                  onClick={() => setSearch("")}
                >
                  <XIcon />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
          <Select
            value={sort}
            onValueChange={(value) => setSort(value as ProjectSort)}
          >
            <SelectTrigger className="w-full sm:w-44" aria-label={researchText("Sort projects")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectGroup>
                <SelectItem value="recent">{researchText("Recent activity")}</SelectItem>
                <SelectItem value="name">{researchText("Project name")}</SelectItem>
                <SelectItem value="status">{researchText("Needs attention")}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>{researchText("Projects could not be loaded")}</AlertTitle>
            <AlertDescription>
              <p>{researchError(error)}</p>
              <Button variant="outline" size="sm" onClick={() => void refresh()}>
                {researchText("Try again")}</Button>
            </AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Spinner />
            {researchText("Loading projects…")}</div>
        ) : (
          <div className="flex flex-col gap-8">
            <ProjectSection
              title={researchText("Projects")}
              projects={visibleProjects}
              projectActivities={projectActivities}
              activeProjectId={activeProjectId}
              onOpen={handleOpen}
              onEdit={openEdit}
              onToggleArchive={handleToggleArchive}
              onDelete={handleDelete}
              emptyMessage={
                search.trim()
                  ? researchText("No active projects match your search.")
                  : researchText("Create your first project to start researching.")
              }
            />

            {archivedProjects.length > 0 && (
              <ProjectSection
                title={researchText("Archived")}
                projects={archivedProjects}
                projectActivities={projectActivities}
                activeProjectId={activeProjectId}
                onOpen={handleOpen}
                onEdit={openEdit}
                onToggleArchive={handleToggleArchive}
                onDelete={handleDelete}
                collapsible
                open={showArchived}
                onOpenChange={setArchivedOpen}
              />
            )}
          </div>
        )}
      </main>

      <footer className="border-t px-6 py-4 text-center text-xs text-muted-foreground">
        {researchText("All project data stays on this machine.")}</footer>

      <ProjectCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(project) => handleOpen(project.id)}
      />

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} request={settingsRequest} />
    </div>
  );
}

interface ProjectSectionProps {
  title: string;
  projects: Project[];
  projectActivities: Readonly<Record<string, ProjectActivitySummary>>;
  activeProjectId: string;
  emptyMessage?: string;
  onOpen: (projectId: string) => void;
  onEdit: (project: Project) => void;
  onToggleArchive: (project: Project) => void;
  onDelete: (project: Project) => void;
  collapsible?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

function ProjectSection({
  title,
  projects,
  projectActivities,
  activeProjectId,
  emptyMessage,
  onOpen,
  onEdit,
  onToggleArchive,
  onDelete,
  collapsible = false,
  open = true,
  onOpenChange,
}: ProjectSectionProps) {
  const content =
    projects.length === 0 ? (
      <Card className="border-dashed bg-background/50">
        <CardContent className="text-sm text-muted-foreground">
          {emptyMessage ?? researchText("No projects.")}
        </CardContent>
      </Card>
    ) : (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            activity={projectActivities[project.id]}
            active={project.id === activeProjectId}
            onOpen={() => onOpen(project.id)}
            onEdit={() => onEdit(project)}
            onToggleArchive={() => onToggleArchive(project)}
            onDelete={() => onDelete(project)}
          />
        ))}
      </div>
    );

  if (collapsible) {
    return (
      <section aria-labelledby={`${title}-heading`}>
        <Collapsible open={open} onOpenChange={onOpenChange}>
          <h2 id={`${title}-heading`}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="group -ml-3 text-muted-foreground"
                aria-label={researchText("{0} archived projects ({1})", [open ? "Hide" : "Show", projects.length])}
              >
                <ChevronRightIcon className="transition-transform group-data-[state=open]:rotate-90" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  {title}
                </span>
                <Badge variant="secondary">{projects.length}</Badge>
              </Button>
            </CollapsibleTrigger>
          </h2>
          <CollapsibleContent className="pt-3">{content}</CollapsibleContent>
        </Collapsible>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`${title}-heading`}>
      <div className="flex items-center gap-3">
        <h2
          id={`${title}-heading`}
          className="text-sm font-semibold uppercase tracking-wider text-muted-foreground"
        >
          {title}
        </h2>
        <span className="text-xs text-muted-foreground/60">{projects.length}</span>
      </div>
      {content}
    </section>
  );
}

interface ProjectCardProps {
  project: Project;
  activity?: ProjectActivitySummary;
  active: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}

function ProjectCard({
  project,
  activity,
  active,
  onOpen,
  onEdit,
  onToggleArchive,
  onDelete,
}: ProjectCardProps) {
  const hasAttention = Boolean(
    activity &&
      (activity.needsInput > 0 || activity.errors > 0 || activity.blocked > 0),
  );
  const isRunning = Boolean(activity && activity.running > 0);
  const isDone = Boolean(
    activity &&
      !hasAttention &&
      !isRunning &&
      activity.done > 0,
  );
  const visibleTagLimit = project.spendLimitUsd == null ? 3 : 2;

  return (
    <Card
      className={cn(
        "group/card relative gap-3 overflow-hidden bg-background py-4 transition-[border-color,box-shadow] hover:border-foreground/20 hover:shadow-md",
        activity?.errors ? "border-red-500/50" : "",
        !activity?.errors && activity?.needsInput ? "border-amber-500/50" : "",
        !activity?.errors && !activity?.needsInput && activity?.blocked
          ? "border-orange-500/50"
          : "",
        !hasAttention && isRunning ? "border-blue-500/50" : "",
        isDone ? "border-emerald-500/50" : "",
      )}
    >
      <button
        type="button"
        className="absolute inset-0 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        aria-label={researchText("Open project {0}", [project.name])}
        onClick={onOpen}
      />
      <CardHeader className="pointer-events-none gap-1.5 px-4">
        <div className="mb-1 flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover/card:text-foreground">
          <FolderIcon className="size-4" />
        </div>
        <CardTitle className="flex min-w-0 items-center gap-1.5 text-sm">
          <span className="truncate">{project.name}</span>
          {active && <Badge variant="secondary">{researchText("Current")}</Badge>}
        </CardTitle>
        <CardDescription className="line-clamp-2 min-h-8 text-xs leading-relaxed">
          {project.description || researchText("No description yet.")}
        </CardDescription>
        {activity && (
          <ProjectActivityBadges activity={activity} />
        )}
        <CardAction className="pointer-events-auto relative z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={researchText("Project actions for {0}", [project.name])}
              >
                <MoreHorizontalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={onEdit}>
                  <SettingsIcon />
                  {researchText("Project settings…")}</DropdownMenuItem>
                <DropdownMenuItem onSelect={onToggleArchive}>
                  {project.archived ? (
                    <ArchiveRestoreIcon />
                  ) : (
                    <ArchiveIcon />
                  )}
                  {project.archived ? researchText("Unarchive") : researchText("Archive")}
                </DropdownMenuItem>
                {project.id !== DEFAULT_PROJECT_ID && (
                  <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                    <Trash2Icon />
                    {researchText("Delete")}</DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      {(project.tags.length > 0 || project.spendLimitUsd != null) && (
        <CardContent className="pointer-events-none flex min-h-5 flex-wrap gap-1 px-4">
          {project.spendLimitUsd != null && (
            <Badge variant="secondary">
              {projectBudgetLabel(project.spendLimitUsd)}
            </Badge>
          )}
          {project.tags.slice(0, visibleTagLimit).map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
          {project.tags.length > visibleTagLimit && (
            <Badge variant="outline">
              +{project.tags.length - visibleTagLimit}
            </Badge>
          )}
        </CardContent>
      )}

      <CardFooter className="pointer-events-none mt-auto justify-between gap-3 px-4">
        <span className="truncate text-xs text-muted-foreground">
          {projectActivityLabel(project)}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground transition-colors group-hover/card:text-foreground">
          {researchText("Open")}<ArrowUpRightIcon className="size-3.5 transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5" />
        </span>
      </CardFooter>
    </Card>
  );
}

function ProjectActivityBadges({
  activity,
}: {
  activity: ProjectActivitySummary;
}) {
  const activeOrAttention =
    activity.running > 0 ||
    activity.needsInput > 0 ||
    activity.errors > 0 ||
    activity.blocked > 0;
  const items = [
    activity.needsInput > 0
      ? {
          key: "input",
          label:
            activity.needsInput === 1
              ? researchText("Needs your input")
              : researchText("{0} need your input", [activity.needsInput]),
          className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
          dot: "bg-amber-500 animate-pulse",
        }
      : null,
    activity.errors > 0
      ? {
          key: "error",
          label: activity.errors === 1 ? researchText("Error") : researchText("{0} errors", [activity.errors]),
          className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
          dot: "bg-red-500",
        }
      : null,
    activity.blocked > 0
      ? {
          key: "blocked",
          label: activity.blocked === 1 ? researchText("Blocked") : researchText("{0} blocked", [activity.blocked]),
          className: "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300",
          dot: "bg-orange-500",
        }
      : null,
    activity.running > 0
      ? {
          key: "running",
          label: activity.running === 1 ? researchText("Running") : researchText("{0} running", [activity.running]),
          className: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
          dot: "bg-blue-500 animate-pulse",
        }
      : null,
    !activeOrAttention && activity.done > 0
      ? {
          key: "done",
          label: researchText("Done"),
          className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
          dot: "bg-emerald-500",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={researchText("Project activity")}>
      {items.map((item) => (
        <Badge
          key={item.key}
          variant="outline"
          className={cn("gap-1.5", item.className)}
        >
          <span className={cn("size-1.5 rounded-full", item.dot)} aria-hidden />
          {item.label}
        </Badge>
      ))}
    </div>
  );
}
