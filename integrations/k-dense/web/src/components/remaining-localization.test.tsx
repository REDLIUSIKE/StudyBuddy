import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfficeToolbar } from "./office-toolbar";
import { researchText, researchError, researchRoleLabel } from "@/lib/research-i18n";
import { LogPanel } from "./latex/log-panel";

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("remaining embedded research labels", () => {
  it("keeps native Office commands unchanged behind Chinese controls", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
    const command = vi.fn();
    render(<OfficeToolbar kind="docx" enabled state={{}} onCommand={command} />);
    expect(screen.getByRole("tab", { name: "开始" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "加粗" }));
    expect(command.mock.calls[0][0]).toBe(".uno:Bold");
    fireEvent.click(screen.getByRole("tab", { name: "插入" }));
    fireEvent.click(screen.getByRole("button", { name: "表格" }));
    expect(command.mock.calls[1][0]).toBe(".uno:InsertTable");
  });

  it("translates dynamic state and plan-field display labels without changing their source values", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
    expect(researchText("Awaiting evidence")).toBe("等待证据");
    expect(researchText("Hypothesis / research question")).toBe("假设与研究问题");
    expect(researchText("needs_decision")).toBe("等待决策");
  });

  it("shows Chinese local errors while preserving status codes, paths and original unknown diagnostics", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
    expect(researchError("Failed to load (503)")).toBe("加载失败（503）");
    expect(researchError("RESEARCH_SCOPE_REVOKED")).toContain("研究连接已失效");
    expect(researchError("RESEARCH_SCOPE_REVOKED")).toContain("RESEARCH_SCOPE_REVOKED");
    expect(researchError("Unknown external error / English path.csv")).toBe("Unknown external error / English path.csv");
    expect(researchRoleLabel("high")).toBe("high");
    expect(researchRoleLabel("pipeline-engineer")).toBe("pipeline-engineer");
  });

  it("retains original standalone error text and Office labels", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "standalone");
    expect(researchError("Failed to load (503)")).toBe("Failed to load (503)");
    render(<OfficeToolbar kind="docx" enabled state={{}} onCommand={vi.fn()} />);
    expect(screen.getByRole("tab", { name: "Home" })).toBeVisible();
  });

  it("keeps compiler log contents and diagnostic messages verbatim in the Chinese interface", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
    const raw = "ERROR English output: user_data/English file.csv\nOriginal compiler command: latexmk -pdf main.tex\n";
    render(<LogPanel open log={raw} filter="all" errors={["Save failed"]} onClose={vi.fn()} onFilterChange={vi.fn()} />);
    expect(screen.getByText("编译日志")).toBeVisible();
    expect(document.querySelector("pre")?.textContent).toContain(raw);
    expect(screen.getByText("Save failed")).toBeVisible();
  });
});
