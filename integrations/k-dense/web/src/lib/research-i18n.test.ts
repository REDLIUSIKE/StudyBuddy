import { afterEach, describe, expect, it, vi } from "vitest";
import { researchText, workflowCopy, workflowFieldLabel } from "./research-i18n";
import workflows from "@/data/workflows.json";

afterEach(() => vi.unstubAllEnvs());

describe("authored research interface copy", () => {
  it("keeps interpolation values such as paths, model IDs and source text literal", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
    expect(researchText("Delete {0}", ["English {1} &amp; 文件.csv"])).toBe("删除English {1} &amp; 文件.csv");
    expect(researchText("unrecognised model/id")).toBe("unrecognised model/id");
  });

  it("provides Chinese names, explanations and input labels for the complete workflow catalogue", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "studybuddy");
    for (const workflow of workflows) {
      expect(workflowCopy(workflow).name, workflow.id).toMatch(/[\u4e00-\u9fff]/);
      expect(workflowCopy(workflow).description, workflow.id).toMatch(/[\u4e00-\u9fff]/);
      for (const field of workflow.placeholders) {
        expect(workflowFieldLabel(field.label).split("（")[0], `${workflow.id}:${field.key}`).toMatch(/[\u4e00-\u9fff]/);
      }
    }
  });

  it("retains standalone English and the original workflow object without changing execution inputs", () => {
    vi.stubEnv("NEXT_PUBLIC_RESEARCH_PROFILE", "standalone");
    expect(researchText("Delete {0}", ["data.csv"])).toBe("Delete data.csv");
    expect(workflowCopy(workflows[0])).toBe(workflows[0]);
    expect(workflowFieldLabel("Paper topic / title")).toBe("Paper topic / title");
  });
});
