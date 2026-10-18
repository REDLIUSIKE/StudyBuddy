import { describe, expect, it } from "vitest";
import * as contracts from "./index.js";

const active = {
  schemaVersion: 1,
  accountAccess: {
    allowed: true,
    policyRevision: "account-open-v1",
    accountRevision: "2026-10-11T04:00:00.000Z",
  },
  serviceBackendStatus: "ready",
};

describe("ordinary account access response", () => {
  it("parses normal software access without a product identity", () => {
    expect(contracts.parseAccountUseAccessResponse(active)).toEqual({
      schemaVersion: 1,
      accountAccess: {
        allowed: true,
        policyRevision: "account-open-v1",
        accountRevision: "2026-10-11T04:00:00.000Z",
      },
      serviceBackendStatus: "ready",
    });
  });

  it("preserves denied access and provisioning failure", () => {
    expect(contracts.parseAccountUseAccessResponse({
      schemaVersion: 1,
      accountAccess: {
        allowed: false,
        policyRevision: "account-open-v1",
        accountRevision: "2026-10-11T04:00:00.000Z",
      },
      serviceBackendStatus: "failed",
    })).toEqual({
      schemaVersion: 1,
      accountAccess: {
        allowed: false,
        policyRevision: "account-open-v1",
        accountRevision: "2026-10-11T04:00:00.000Z",
      },
      serviceBackendStatus: "failed",
    });
  });

  it.each([
    { ...active, schemaVersion: 2 },
    { ...active, access: { eligible: true, level: "lifetime" } },
    { ...active, accountAccess: { ...active.accountAccess, policyRevision: "other" } },
    { ...active, accountAccess: { ...active.accountAccess, accountRevision: "2026-02-30T00:00:00.000Z" } },
    { ...active, accountAccess: { ...active.accountAccess, accountRevision: "" } },
    { ...active, accountAccess: { ...active.accountAccess, allowed: "true" } },
    { ...active, accountAccess: { ...active.accountAccess, productCode: "fake-product" } },
    { ...active, serviceBackendStatus: "paid" },
    { schemaVersion: 1, accountAccess: active.accountAccess },
  ])("rejects unknown or untrusted wire data: %j", value => {
    expect(() => contracts.parseAccountUseAccessResponse(value)).toThrow(TypeError);
  });
});
