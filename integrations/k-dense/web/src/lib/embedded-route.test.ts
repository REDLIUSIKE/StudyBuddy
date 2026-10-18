import { describe, expect, it } from "vitest";
import { embeddedRoute } from "./embedded-route";

describe("embedded page routes", () => {
  it("opens only the embedded workspace at the root", () => {
    expect(embeddedRoute({ pathname: "/", search: "?project=research" })).toEqual({ kind: "workspace" });
    expect(embeddedRoute({ pathname: "/settings", search: "" })).toEqual({ kind: "not-found" });
    expect(embeddedRoute({ pathname: "/office/runtime.html", search: "" })).toEqual({ kind: "not-found" });
  });

  it.each(["report.docx", "slides.PPTX", "data/workbook.xlsx"])("preserves the Office file and owning project for %s", path => {
    const search = `?${new URLSearchParams({ path, project: "project-a" })}`;
    expect(embeddedRoute({ pathname: "/office", search })).toEqual({ kind: "office", path, projectId: "project-a" });
  });

  it.each([
    "", "?path=report.docx", "?project=a", "?path=&project=a",
    "?path=report.pdf&project=a", "?path=report.docx&project=",
    "?path=report.docx&path=other.docx&project=a", "?path=report.docx&project=a&project=b",
  ])("does not mount an Office editor for an invalid request %s", search => {
    expect(embeddedRoute({ pathname: "/office", search })).toEqual({ kind: "invalid-office" });
  });
});
