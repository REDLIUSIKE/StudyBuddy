import { describe, expect, it } from "vitest";

import { parseCampusPlaybookSubmissionCreate, parseCampusPlaybookSubmissionUpdate } from "./campus-playbook.js";

describe("campus playbook contracts", () => {
  it("normalizes a feedback or plan submission without publishing the private catalog", () => {
    expect(parseCampusPlaybookSubmissionCreate({
      kind: "FEEDBACK",
      entryId: "welcome",
      sectionId: "why-now",
      body: "  这里还可以补一条真实案例。  ",
    })).toEqual({ kind: "FEEDBACK", entryId: "welcome", sectionId: "why-now", body: "这里还可以补一条真实案例。" });
    expect(parseCampusPlaybookSubmissionCreate({
      kind: "PLAN",
      entryId: "welcome",
      sectionId: "page",
      body: "本周联系两个校园公众号。",
    })).toEqual({ kind: "PLAN", entryId: "welcome", sectionId: "page", body: "本周联系两个校园公众号。" });
    expect(parseCampusPlaybookSubmissionCreate({ kind: "PLAN", entryId: "welcome", sectionId: "forged", body: "x" }))
      .toEqual({ kind: "PLAN", entryId: "welcome", sectionId: "forged", body: "x" });
  });

  it("strictly parses admin updates", () => {
    expect(parseCampusPlaybookSubmissionUpdate({ status: "IN_PROGRESS", adminNote: "已安排产品同学跟进" }))
      .toEqual({ status: "IN_PROGRESS", adminNote: "已安排产品同学跟进" });
    expect(() => parseCampusPlaybookSubmissionUpdate({ status: "DONE", adminNote: "x" }))
      .toThrow("CAMPUS_PLAYBOOK_SUBMISSION_INVALID");
    expect(() => parseCampusPlaybookSubmissionUpdate({ status: "OPEN", adminNote: "x", extra: true }))
      .toThrow("CAMPUS_PLAYBOOK_SUBMISSION_INVALID");
  });
});
