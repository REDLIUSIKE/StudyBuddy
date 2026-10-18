import { describe, expect, it } from "vitest";

import { parseLogoutAuthorityReceipt } from "./auth-lifecycle.js";
import { parseNativeLogoutAuthorityReceiptV2 } from './auth-lifecycle.js';

describe("logout authority receipt", () => {
  it("accepts only the exact revoked receipt with a positive safe authority generation", () => {
    const receipt = {
      status: "revoked",
      authorityGeneration: 7,
    } as const;

    expect(parseLogoutAuthorityReceipt(receipt)).toEqual(receipt);
  });

  it.each([
    null,
    {},
    { status: "revoked" },
    { authorityGeneration: 7 },
    { status: "active", authorityGeneration: 7 },
    { status: "revoked", authorityGeneration: 0 },
    { status: "revoked", authorityGeneration: -1 },
    { status: "revoked", authorityGeneration: 1.5 },
    { status: "revoked", authorityGeneration: Number.MAX_SAFE_INTEGER + 1 },
    { status: "revoked", authorityGeneration: 7, intentCount: 2 },
    Object.assign(
      { status: "revoked", authorityGeneration: 7 },
      { [Symbol("extra")]: true },
    ),
  ])("rejects malformed, missing, unsafe, or extra receipt fields: %o", (value) => {
    expect(() => parseLogoutAuthorityReceipt(value)).toThrow(TypeError);
  });
});

describe('additive native logout proof', () => {
  const proof = { schemaVersion: 2, status: 'revoked', accountOwner: '11111111-1111-4111-8111-111111111111', deviceId: 'abcd2222-2222-4222-8222-222222222222', authorityGeneration: 17 };
  const parse = parseNativeLogoutAuthorityReceiptV2;
  it('retains exact server owner/device proof without changing the v1 two-field contract', () => {
    expect(parse(proof)).toEqual(proof);
    expect(() => parseLogoutAuthorityReceipt(proof)).toThrow(TypeError);
  });
  it('rejects wrong identity, unsafe generations, missing fields, extras and accessors without evaluating them', () => {
    for (const input of [
      { ...proof, schemaVersion: 1 }, { ...proof, status: 'active' },
      { ...proof, deviceId: null }, { ...proof, accountOwner: 'not-an-owner' },
      { ...proof, deviceId: proof.deviceId.toUpperCase() },
      { ...proof, authorityGeneration: 0 }, { ...proof, authorityGeneration: Number.MAX_SAFE_INTEGER + 1 },
      { ...proof, apiKey: 'synthetic-excluded' }, { ...proof, [Symbol('extra')]: true },
      { status: 'revoked', authorityGeneration: 17 },
    ]) expect(() => parse(input)).toThrow();
    let evaluated = false;
    const accessor = { ...proof };
    Object.defineProperty(accessor, 'deviceId', { enumerable: true, get() { evaluated = true; return proof.deviceId; } });
    expect(() => parse(accessor)).toThrow();
    expect(evaluated).toBe(false);
  });
});
