import { describe, expect, it } from "vitest";

import { parseApiErrorResponse } from "./api-error.js";

describe("API error contract", () => {
  it("parses a public error without details", () => {
    expect(
      parseApiErrorResponse({
        code: "DEVICE_PROOF_INVALID",
        message: "设备证明无效",
        requestId: "req_123",
      }),
    ).toEqual({
      code: "DEVICE_PROOF_INVALID",
      message: "设备证明无效",
      requestId: "req_123",
    });
  });

  it("allows a canonical availableAt only for the cooldown error", () => {
    expect(
      parseApiErrorResponse({
        code: "DEVICE_TRANSFER_COOLDOWN",
        message: "设备换机冷却期尚未结束",
        requestId: "req_123",
        details: { availableAt: "2026-09-30T08:30:00.000Z" },
      }),
    ).toEqual({
      code: "DEVICE_TRANSFER_COOLDOWN",
      message: "设备换机冷却期尚未结束",
      requestId: "req_123",
      details: { availableAt: "2026-09-30T08:30:00.000Z" },
    });
  });

  it("rejects non-allowlisted or unknown error details", () => {
    expect(() =>
      parseApiErrorResponse({
        code: "DEVICE_PROOF_INVALID",
        message: "设备证明无效",
        requestId: "req_123",
        details: { availableAt: "2026-09-30T08:30:00.000Z" },
      }),
    ).toThrow("details");
    expect(() =>
      parseApiErrorResponse({
        code: "DEVICE_TRANSFER_COOLDOWN",
        message: "设备换机冷却期尚未结束",
        requestId: "req_123",
        details: { availableAt: "2026-09-30T08:30:00Z" },
      }),
    ).toThrow("availableAt");
    expect(() =>
      parseApiErrorResponse({
        code: "DEVICE_TRANSFER_COOLDOWN",
        message: "设备换机冷却期尚未结束",
        requestId: "req_123",
        details: {
          availableAt: "2026-09-30T08:30:00.000Z",
          supportTicket: "do-not-leak",
        },
      }),
    ).toThrow("details");
  });
});
