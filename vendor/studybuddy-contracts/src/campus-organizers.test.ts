import { describe, expect, it } from "vitest";
import { parseEndCampusOrganizerAssignment, parseStartCampusOrganizerAssignment } from "./campus-organizers.js";

describe("campus organizer contracts", () => {
  it("accepts an explicit school assignment and end command", () => {
    expect(parseStartCampusOrganizerAssignment({
      schoolId: "00000000-0000-4000-8000-000000000001",
      organizerStudyBuddyUserId: "00000000-0000-4000-8000-000000000002",
      effectiveFrom: "2026-08-25T09:00:00.000Z",
      reason: "开荒期首任主理人",
    })).toMatchObject({ reason: "开荒期首任主理人" });
    expect(parseEndCampusOrganizerAssignment({ effectiveTo: "2026-09-01T00:00:00.000Z", reason: "主理人变更" }))
      .toMatchObject({ reason: "主理人变更" });
  });

  it("rejects unknown fields and noncanonical time", () => {
    expect(() => parseStartCampusOrganizerAssignment({ schoolId: "x" })).toThrow("CAMPUS_ORGANIZER_INVALID");
    expect(() => parseEndCampusOrganizerAssignment({ effectiveTo: "2026-09-01", reason: "x", wallet: true }))
      .toThrow("CAMPUS_ORGANIZER_INVALID");
  });
});
