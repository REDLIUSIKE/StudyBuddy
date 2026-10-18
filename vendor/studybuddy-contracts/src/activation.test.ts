import { describe, expect, it } from "vitest";

import {
  parseActivationClaimResponse,
  parseUsbIdentityEnvelope,
  type ActivationClaimResponse,
  type ActivationInspectResponse,
  type UsbIdentityEnvelope,
} from "./activation.js";

describe("activation contracts", () => {
  it("parses the exact USB identity envelope wire format", () => {
    const envelope: UsbIdentityEnvelope = {
      payloadBase64url: "eyJzY2hlbWFWZXJzaW9uIjoxfQ",
      signatureBase64url: "A".repeat(86),
    };

    expect(parseUsbIdentityEnvelope(envelope)).toEqual(envelope);
  });

  it("requires a canonical 64-byte detached signature", () => {
    const baseEnvelope = {
      payloadBase64url: "e30",
    };

    expect(() =>
      parseUsbIdentityEnvelope({
        ...baseEnvelope,
        signatureBase64url: "A".repeat(84),
      }),
    ).toThrow("signatureBase64url");
    expect(() =>
      parseUsbIdentityEnvelope({
        ...baseEnvelope,
        signatureBase64url: "A".repeat(87),
      }),
    ).toThrow("signatureBase64url");
    expect(() =>
      parseUsbIdentityEnvelope({
        ...baseEnvelope,
        signatureBase64url: `${"A".repeat(85)}B`,
      }),
    ).toThrow("signatureBase64url");
  });

  it("rejects unknown envelope fields and oversized payloads", () => {
    expect(() =>
      parseUsbIdentityEnvelope({
        payloadBase64url: "e30",
        signatureBase64url: "signature",
        usbId: "leaked-field",
      }),
    ).toThrow("USB identity envelope");

    expect(() =>
      parseUsbIdentityEnvelope({
        payloadBase64url: "a".repeat(5_464),
        signatureBase64url: "signature",
      }),
    ).toThrow("payloadBase64url");
  });

  it("parses the exact historical lifetime claim response", () => {
    const inspect: ActivationInspectResponse = { status: "claimable" };
    const claim: ActivationClaimResponse = {
      claimId: "96a9f5cb-16ba-45ca-a296-799c77df280f",
      accessLevel: "lifetime",
      grantedAt: "2026-08-31T00:00:00.000Z",
    };
    expect(inspect.status).toBe("claimable");
    expect(parseActivationClaimResponse(claim)).toEqual(claim);
  });

  it.each([
    {
      claimId: "96a9f5cb-16ba-45ca-a296-799c77df280f",
      accessLevel: "lifetime",
    },
    {
      claimId: "96a9f5cb-16ba-45ca-a296-799c77df280f",
      accessLevel: "monthly",
      grantedAt: "2026-08-31T00:00:00.000Z",
    },
  ])("rejects an invalid lifetime claim response: %o", (response) => {
    expect(() => parseActivationClaimResponse(response)).toThrow();
  });
});
