"use client";

import { PanelLeft, Workflow, Settings } from "lucide-react";
import { Button } from "./ui/button";

const selected = "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15";

/** Existing research actions, with visible button boundaries and current state. */
export function ResearchToolbar({ treeOpen, workflowsOpen, settingsOpen, onToggleFiles, onToggleWorkflows, onOpenSettings }: {
  treeOpen: boolean; workflowsOpen: boolean; settingsOpen: boolean;
  onToggleFiles(): void; onToggleWorkflows(): void; onOpenSettings(): void;
}) {
  return <div role="toolbar" aria-label="研究工具" className="flex shrink-0 items-center gap-2">
    <Button type="button" variant="outline" size="sm" aria-pressed={treeOpen} className={treeOpen ? selected : undefined} onClick={onToggleFiles}>
      <PanelLeft aria-hidden="true" />{treeOpen ? "收起文件" : "展开文件"}
    </Button>
    <Button type="button" variant="outline" size="sm" aria-pressed={workflowsOpen} className={workflowsOpen ? selected : undefined} onClick={onToggleWorkflows}>
      <Workflow aria-hidden="true" />研究流程
    </Button>
    <Button type="button" variant="outline" size="sm" aria-haspopup="dialog" aria-expanded={settingsOpen} className={settingsOpen ? selected : undefined} onClick={onOpenSettings}>
      <Settings aria-hidden="true" />设置
    </Button>
  </div>;
}
