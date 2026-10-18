import { describe, expect, it } from "vitest";

import {
  parseAccessResponse,
  type AccessResponse,
} from "./access.js";

describe("access contracts", () => {
  it.each(
    ["pending", "processing", "ready", "retrying", "failed"] as const,
  )("parses the %s ServiceBackend state", (serviceBackendStatus) => {
    const response: AccessResponse = {
      access: {
        eligible: true,
        level: "lifetime",
        productCode: "studybuddy_digital",
        source: "digital_purchase",
        grantedAt: "2026-07-31T00:00:00.000Z",
      },
      serviceBackendStatus,
    };

    expect(parseAccessResponse(response)).toEqual(response);
  });

  it("rejects an unknown ServiceBackend state", () => {
    expect(() =>
      parseAccessResponse({
        access: {
          eligible: false,
          level: null,
          productCode: null,
          source: null,
          grantedAt: null,
        },
        serviceBackendStatus: "waiting",
      }),
    ).toThrow("serviceBackendStatus");
  });

  it.each([
    "2026-07-31T08:00:00.000+08:00",
    "2026-07-31T00:00:00Z",
    "2026-02-30T00:00:00.000Z",
  ])("rejects non-canonical grantedAt timestamps: %s", (grantedAt) => {
    expect(() =>
      parseAccessResponse({
        access: {
          eligible: true,
          level: "lifetime",
          productCode: "studybuddy_digital",
          source: "digital_purchase",
          grantedAt,
        },
        serviceBackendStatus: "ready",
      }),
    ).toThrow("grantedAt");
  });

  it("keeps the exact eligible USB, digital, and ineligible fixtures", () => {
    const usb: AccessResponse = {
      access: {
        eligible: true,
        level: "lifetime",
        productCode: "studybuddy_physical",
        source: "usb_claim",
        grantedAt: "2026-07-31T00:00:00.000Z",
      },
      serviceBackendStatus: "ready",
    };
    const digital: AccessResponse = {
      access: {
        eligible: true,
        level: "lifetime",
        productCode: "studybuddy_digital",
        source: "digital_purchase",
        grantedAt: "2026-07-30T00:00:00.000Z",
      },
      serviceBackendStatus: "retrying",
    };
    const ineligible: AccessResponse = {
      access: {
        eligible: false,
        level: null,
        productCode: null,
        source: null,
        grantedAt: null,
      },
      serviceBackendStatus: "pending",
    };

    expect(parseAccessResponse(usb)).toEqual(usb);
    expect(parseAccessResponse(digital)).toEqual(digital);
    expect(parseAccessResponse(ineligible)).toEqual(ineligible);
    expect(ineligible.access).toMatchObject({
      level: null,
      productCode: null,
      source: null,
      grantedAt: null,
    });
  });
});
