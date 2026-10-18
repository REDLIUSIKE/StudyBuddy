import { fireEvent, render, screen, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowsPanel, WorkflowLaunchDialog } from "./workflows-panel";
import workflows from "@/data/workflows.json";

vi.mock("@/lib/use-models", () => ({ useModels: () => ({ modelAvailability: () => "available", models: [] }) }));
vi.mock("@/lib/app-settings", () => ({ useAppDefaults: () => null }));

afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("research workbench language", () => {
  it("finds a workflow by its Chinese title and description in the embedded workbench", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
    render(<WorkflowsPanel onLaunch={vi.fn()} onPrepare={vi.fn()} />);
    const search = screen.getByPlaceholderText("搜索研究流程…");
    fireEvent.change(search, { target: { value: "审阅论文" } });
    expect(screen.getByRole("button", { name: /审阅论文/ })).toBeVisible();
    expect(screen.getAllByText("论文写作与审阅")[0]).toBeVisible();
    expect(screen.getByText("评估研究方法、统计严谨性与局限性，并提供建设性反馈")).toBeVisible();
    fireEvent.change(search, { target: { value: "严谨性" } });
    expect(screen.getByRole("button", { name: /审阅论文/ })).toBeVisible();
  });

  it("keeps the English standalone catalogue searchable", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "standalone");
    render(<WorkflowsPanel onLaunch={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("Search workflows..."), { target: { value: "Review a Paper" } });
    expect(screen.getByRole("button", { name: /Review a Paper/ })).toBeVisible();
    expect(screen.queryByText("审阅论文")).not.toBeInTheDocument();
  });

  it("prepares the original reviewed workflow prompt and file identity from a Chinese dialog", async () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
    const onPrepare = vi.fn();
    render(<WorkflowLaunchDialog workflow={workflows[0]} open onOpenChange={vi.fn()} onLaunch={vi.fn()} onPrepare={onPrepare} availableFiles={["user_data/English name.csv"]} />);
    expect(screen.getByRole("heading", { name: "审阅论文" })).toBeVisible();
    fireEvent.click(screen.getByRole("checkbox", { name: "user_data/English name.csv" }));
    fireEvent.click(screen.getByRole("button", { name: "准备原生对话" }));
    await waitFor(() => expect(onPrepare).toHaveBeenCalled());
    expect(onPrepare.mock.calls[0][0]).toContain(workflows[0].prompt);
    expect(onPrepare.mock.calls[0][1]).toEqual(["user_data/English name.csv"]);
  });
});
