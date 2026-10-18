import { describe, expect, it } from "vitest";

import {
  isSkillCoverContentType,
  isSkillListingStatus,
  SKILL_LISTING_STATUSES,
} from "./skill-marketplace.js";

describe("skill marketplace contract", () => {
  it("recognizes only the lifecycle states visible to a Skill author", () => {
    expect(SKILL_LISTING_STATUSES).toEqual(["PUBLIC", "REJECTED", "DELETED"]);
    expect(isSkillListingStatus("PUBLIC")).toBe(true);
    expect(isSkillListingStatus("REJECTED")).toBe(true);
    expect(isSkillListingStatus("DELETED")).toBe(true);
    expect(isSkillListingStatus("DRAFT")).toBe(false);
    expect(isSkillListingStatus("APPROVED")).toBe(false);
  });

  it("accepts only the cover formats stated in the publishing form", () => {
    expect(isSkillCoverContentType("image/png")).toBe(true);
    expect(isSkillCoverContentType("image/jpeg")).toBe(true);
    expect(isSkillCoverContentType("image/webp")).toBe(true);
    expect(isSkillCoverContentType("image/gif")).toBe(false);
    expect(isSkillCoverContentType("application/pdf")).toBe(false);
  });
});
