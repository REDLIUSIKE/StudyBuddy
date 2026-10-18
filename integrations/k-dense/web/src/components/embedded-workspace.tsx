"use client";

import { useCallback, useEffect, useState } from "react";
import { ProjectView } from "./project-view";
import { ProjectSwitcher } from "./project-switcher";
import { FileTreePanel } from "./sandbox-panel";
import { FilePreviewPanel, SettingsDialog, WorkflowsPanel } from "./lazy-surfaces";
import { ProjectScopeProvider } from "@/lib/projects";
import { useProjects } from "@/lib/use-projects";
import { flattenFiles, flattenFolders, useSandbox } from "@/lib/use-sandbox";
import { nativeResearchRequest, type ResearchPageAction } from "@/lib/research-host";
import { ResearchToolbar } from "./research-toolbar";
import { NativeDictation } from "./native-dictation";
import { onOpenSettings, type OpenSettingsRequest } from "@/lib/settings-nav";
import { toast } from "sonner";
import { useNativeNotebook } from "@/lib/use-native-notebook";
import { useNativeWorkspace } from "@/lib/use-native-workspace";
import type { NativeWorkspaceState } from "@/lib/native-workspace-state";

/** The original editors/viewers remain mounted while the shell owns native Conversation. */
export function EmbeddedWorkspace() {
  const { activeProjectId, projects, loading } = useProjects();
  const [screen, setScreen] = useState<"projects" | "workspace">("projects");
  const [opened, setOpened] = useState<string[]>([]);
  const [directoryReady, setDirectoryReady] = useState(false);
  useEffect(() => { if (!loading) setDirectoryReady(true); }, [loading]);
  const open = useCallback((id: string) => { setOpened(rows => rows.includes(id) ? rows : [...rows, id]); setScreen("workspace"); }, []);
  useEffect(() => { if (screen === "workspace") open(activeProjectId); }, [activeProjectId, open, screen]);
  return <>
    <div className={screen === "projects" ? "contents" : "hidden"} aria-hidden={screen !== "projects"}>
      <ProjectView isActive={screen === "projects"} onOpenProject={open} projectActivities={{}} />
    </div>
    {directoryReady && opened.filter(id => projects.some(project => project.id === id)).map(id => <ProjectScopeProvider key={id} value={id}>
      <div className={screen === "workspace" && id === activeProjectId ? "contents" : "hidden"} aria-hidden={screen !== "workspace" || id !== activeProjectId}>
        <RestoredEmbeddedProject projectId={id} visible={screen === "workspace" && id === activeProjectId} onBack={() => { setScreen("projects"); void nativeResearchRequest({ kind: "show-projects" }); }} />
      </div>
    </ProjectScopeProvider>)}
  </>;
}

function RestoredEmbeddedProject(props: { projectId: string; visible: boolean; onBack(): void }) {
  const persistence = useNativeWorkspace(props.projectId);
  if (!persistence.initial) return <div role={persistence.error ? "alert" : "status"} className="p-4">{persistence.error ?? "正在恢复项目视图"}{persistence.error && <button onClick={persistence.retry} className="ml-3 underline">重试</button>}</div>;
  return <><EmbeddedProject {...props} initial={persistence.initial} saveState={persistence.save} />{persistence.error && <p role="alert" className="fixed bottom-1 left-1 rounded border bg-background p-2 text-xs">视图状态未能保存：{persistence.error}</p>}</>;
}
function EmbeddedProject({ projectId, visible, onBack, initial, saveState }: { projectId: string; visible: boolean; onBack(): void; initial: NativeWorkspaceState; saveState(state: NativeWorkspaceState): void }) {
  const [savedSandbox, setSavedSandbox] = useState(initial.sandbox);
  const sandboxState = useCallback((state: NativeWorkspaceState['sandbox']) => setSavedSandbox(current => JSON.stringify(current) === JSON.stringify(state) ? current : state), []);
  const sandbox = useSandbox(visible, projectId, initial.sandbox, sandboxState);
  const [settings, setSettings] = useState(false), [settingsRequest, setSettingsRequest] = useState<OpenSettingsRequest | null>(null);
  const [view, setView] = useState<NativeWorkspaceState['view']>(initial.view);
  const [treeOpen, setTreeOpen] = useState(initial.treeOpen), [treeWidth, setTreeWidth] = useState(initial.treeWidth), [sessionId, setSessionId] = useState<string>();
  useEffect(() => { saveState({ schemaVersion: 1, view, treeOpen, treeWidth, sandbox: savedSandbox }); }, [view, treeOpen, treeWidth, savedSandbox, saveState]);
  const [chats, setChats] = useState<{ sessionId: string; label: string; closed: boolean }[]>([]), [chatBusy, setChatBusy] = useState(false);
  const adopt = useCallback((value: unknown) => {
    if (!value || typeof value !== "object" || !("projectId" in value) || value.projectId !== projectId || !("sessionId" in value) || value.sessionId !== null && typeof value.sessionId !== "string") return;
    setSessionId(value.sessionId ?? undefined);
    if ("chats" in value && Array.isArray(value.chats)) setChats(value.chats.filter((row): row is { sessionId: string; label: string; closed: boolean } => !!row && typeof row === "object" && typeof row.sessionId === "string" && typeof row.label === "string" && typeof row.closed === "boolean"));
  }, [projectId]);
  const chatAction = async (action: ResearchPageAction) => {
    if (chatBusy) return; setChatBusy(true);
    try { adopt(await nativeResearchRequest(action)); } catch (error) { toast.error(error instanceof Error ? error.message : "研究对话连接失败"); }
    finally { setChatBusy(false); }
  };
  const notebook = useNativeNotebook(projectId, sessionId, visible);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void nativeResearchRequest({ kind: "open-project", projectId }).then(value => {
      if (active) adopt(value);
    }).catch(error => { if (active) toast.error(error instanceof Error ? error.message : "研究对话连接失败"); });
    return () => { active = false; };
  }, [projectId, visible, adopt]);
  useEffect(() => onOpenSettings(request => { if (visible) { setSettingsRequest(request); setSettings(true); } }), [visible]);
  const draft = (text: string, references: string[] = []) => { void nativeResearchRequest({ kind: "draft", projectId, text, references }).catch(error => toast.error(String(error))); };
  const select = (path: string) => { setView("files"); void sandbox.selectFile(path); };
  return <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground" data-research-workspace={projectId}>
    <header className="flex shrink-0 items-center gap-3 overflow-x-auto border-b px-3 py-2">
      <ProjectSwitcher onOpenProjectView={onBack} />
      <ResearchToolbar treeOpen={treeOpen} workflowsOpen={view === "workflows"} settingsOpen={settings}
        onToggleFiles={() => setTreeOpen(value => !value)}
        onToggleWorkflows={() => setView(view === "workflows" ? "files" : "workflows")}
        onOpenSettings={() => { setSettingsRequest(null); setSettings(true); }} />
      <NativeDictation key={sessionId ?? "unbound"} projectId={projectId} sessionId={sessionId} visible={visible} />
    </header>
    <nav className="flex shrink-0 items-center gap-1 overflow-x-auto border-b px-3 py-1 text-xs" aria-label="研究对话">
      {chats.filter(chat => !chat.closed).map(chat => <span key={chat.sessionId} className="flex items-center rounded border">
        <button className={sessionId === chat.sessionId ? "bg-primary/10 px-2 py-1 text-primary" : "px-2 py-1"} disabled={chatBusy} onClick={() => { void chatAction({ kind: "select-chat", projectId, sessionId: chat.sessionId }); }}>{chat.label}</button>
        <button aria-label={`关闭 ${chat.label}`} className="px-1" disabled={chatBusy} onClick={() => { void chatAction({ kind: "close-chat", projectId, sessionId: chat.sessionId }); }}>×</button>
      </span>)}
      <button className="shrink-0 rounded border px-2 py-1" disabled={chatBusy} onClick={() => { void chatAction({ kind: "new-chat", projectId }); }}>＋ 新对话</button>
      {chats.some(chat => chat.closed) && <select aria-label="重开历史对话" className="ml-auto max-w-32 rounded border bg-background px-1 py-1" value="" disabled={chatBusy} onChange={event => { if (event.target.value) void chatAction({ kind: "select-chat", projectId, sessionId: event.target.value }); }}>
        <option value="">历史对话</option>{chats.filter(chat => chat.closed).map(chat => <option key={chat.sessionId} value={chat.sessionId}>{chat.label}</option>)}
      </select>}
    </nav>
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className={treeOpen ? "min-w-36 max-w-[40%] shrink-0 overflow-hidden border-r" : "hidden"} style={{ width: treeWidth }}>
        <FileTreePanel tree={sandbox.tree} selectedPath={sandbox.activeTabPath} uploading={sandbox.uploading} onSelect={select}
          onDownload={sandbox.downloadFile} onDelete={sandbox.deleteFile} onDownloadDir={sandbox.downloadDir} onDeleteDir={sandbox.deleteDir}
          onDownloadAll={sandbox.downloadAll} onRefresh={sandbox.fetchTree} onClose={() => setTreeOpen(false)} onUpload={sandbox.uploadFiles}
          onOrganize={() => draft("先列出文件整理方案，保留原始数据、引用和相对路径，待我确认后再执行。")}
          onMove={sandbox.moveItem} onRename={sandbox.renameItem} onCreateDir={sandbox.createDir} />
      </div>
      {treeOpen && <div role="separator" aria-label="调整文件列表宽度" aria-orientation="vertical" tabIndex={0} className="w-1 shrink-0 cursor-col-resize bg-border/30 hover:bg-primary/30"
        onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setTreeWidth(width => Math.max(144, Math.min(640, width + (event.key === 'ArrowRight' ? 16 : -16)))); } }}
        onPointerDown={event => { const anchor = event.currentTarget, start = event.clientX, width = treeWidth; anchor.setPointerCapture(event.pointerId);
          const move = (next: PointerEvent) => setTreeWidth(Math.max(144, Math.min(640, width + next.clientX - start)));
          const finish = () => { anchor.removeEventListener('pointermove', move); anchor.removeEventListener('pointerup', finish); anchor.removeEventListener('pointercancel', finish); };
          anchor.addEventListener('pointermove', move); anchor.addEventListener('pointerup', finish, { once: true }); anchor.addEventListener('pointercancel', finish, { once: true }); }} />}
      <main className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden">
        <div className={view === "workflows" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <WorkflowsPanel onLaunch={(text, _standaloneModel, references) => { draft(text, references); setView("files"); }} onPrepare={async (text, references) => { await nativeResearchRequest({ kind: "draft", projectId, text, references }); setView("files"); }} onUploadFiles={sandbox.uploadFiles}
            availableFiles={sandbox.tree ? flattenFiles(sandbox.tree) : []} availableFolders={sandbox.tree ? flattenFolders(sandbox.tree) : []}
            filesReady={sandbox.tree !== null} onRefreshFiles={sandbox.fetchTree} />
        </div>
        <div className={view !== "workflows" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
          <FilePreviewPanel projectId={projectId} isActive={visible} tabs={sandbox.tabs} activeTabPath={sandbox.activeTabPath} onTabSelect={select}
            onTabClose={sandbox.closeTab} onDownload={sandbox.downloadFile} onSaveText={sandbox.saveFile} onSaveImageBlob={sandbox.saveImageBlob}
            onRetry={sandbox.retryFile} onCompileLatex={sandbox.compileLatex} showNotebook={view === "notebook"} onSelectNotebook={() => setView("notebook")}
            showCompute={view === "compute"} onSelectCompute={() => setView("compute")} showAutomation={view === "automation"} onSelectAutomation={() => setView("automation")}
            computeSessionId={sessionId ?? null} computeScope="project" onComputeScopeChange={() => {}} onOpenComputeOutput={select}
            notebookSessionId={sessionId ?? null} notebookEntries={notebook} notebookStreaming={false} notebookSubagentCompletions={0}
            onOpenNotebookFile={select} onNotebookJumpToChat={() => { void nativeResearchRequest({ kind: "open-project", projectId }); }} />
        </div>
        {sandbox.activeTabPath && <button className="shrink-0 border-t px-3 py-1 text-left text-xs" onClick={() => { void nativeResearchRequest({ kind: "reference", projectId, path: sandbox.activeTabPath! }).catch(error => toast.error(String(error))); }}>添加当前文件到原生对话</button>}
      </main>
    </div>
    <SettingsDialog open={settings} onOpenChange={setSettings} request={settingsRequest} />
  </div>;
}
