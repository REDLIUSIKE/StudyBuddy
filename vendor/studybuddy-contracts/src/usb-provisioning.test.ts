import { describe, expect, it } from "vitest";

import {
  canonicalUsbIdentity,
  parseUsbBatchManifest,
  parseUsbImportReceipt,
} from "./usb-provisioning.js";
import {
  parseUsbBatchManifest as parseUsbBatchManifestFromRoot,
  type UsbBatchEnvironment,
} from "./index.js";

const USB_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_USB_ID = "33333333-3333-4333-8333-333333333333";
const BATCH_ID = "22222222-2222-4222-8222-222222222222";
const DIGEST = "a".repeat(64);
const SECOND_DIGEST = "b".repeat(64);

function identity(
  usbId = USB_ID,
  identityDigest = DIGEST,
): Record<string, unknown> {
  return {
    usbId,
    identityDigest,
    payloadPath: `identities/${usbId}/device.json`,
    signaturePath: `identities/${usbId}/device.sig`,
  };
}

function manifest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    environment: "test",
    batchId: BATCH_ID,
    signingKeyVersion: 1001,
    createdAt: "2026-08-01T00:00:00.000Z",
    count: 1,
    identities: [identity()],
    ...overrides,
  };
}

function manifestWithPath(path: string): Record<string, unknown> {
  return manifest({
    identities: [{ ...identity(), payloadPath: path }],
  });
}

function receipt(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 1,
    environment: "test",
    batchId: BATCH_ID,
    manifestDigest: DIGEST,
    importedCount: 1,
    importedAt: "2026-08-01T00:01:00.000Z",
    ...overrides,
  };
}

describe("USB provisioning contracts", () => {
  it("serializes the signed identity with exact field order and one LF", () => {
    const bytes = canonicalUsbIdentity({
      schemaVersion: 1,
      usbId: USB_ID,
      batchId: BATCH_ID,
      issuedAt: "2026-08-01T00:00:00.000Z",
      signingKeyVersion: 1001,
    });

    expect(new TextDecoder().decode(bytes)).toBe(
      '{"schemaVersion":1,"usbId":"11111111-1111-4111-8111-111111111111","batchId":"22222222-2222-4222-8222-222222222222","issuedAt":"2026-08-01T00:00:00.000Z","signingKeyVersion":1001}\n',
    );
    expect(bytes[0]).not.toBe(0xef);
  });

  it("parses an exact test manifest without coercion", () => {
    const environment: UsbBatchEnvironment = "test";
    expect(
      parseUsbBatchManifestFromRoot(manifest({ environment })),
    ).toEqual(manifest());
    expect(() =>
      parseUsbBatchManifest(manifest({ schemaVersion: "1" })),
    ).toThrow("schemaVersion");
    expect(() =>
      parseUsbBatchManifest(manifest({ signingKeyVersion: "1001" })),
    ).toThrow("signingKeyVersion");
    expect(() =>
      parseUsbBatchManifest(manifest({ environment: "staging" })),
    ).toThrow("environment");
  });

  it("rejects invalid fields before serializing a signed identity", () => {
    const valid = {
      schemaVersion: 1 as const,
      usbId: USB_ID,
      batchId: BATCH_ID,
      issuedAt: "2026-08-01T00:00:00.000Z",
      signingKeyVersion: 1001,
    };

    expect(() =>
      canonicalUsbIdentity({ ...valid, usbId: "not-a-uuid" }),
    ).toThrow("usbId");
    expect(() =>
      canonicalUsbIdentity({
        ...valid,
        issuedAt: "2026-08-01T08:00:00.000+08:00",
      }),
    ).toThrow("issuedAt");
    expect(() =>
      canonicalUsbIdentity({ ...valid, signingKeyVersion: 0 }),
    ).toThrow("signingKeyVersion");
  });

  it("rejects unknown fields in manifests, identities, receipts, and signed identities", () => {
    expect(() =>
      parseUsbBatchManifest(manifest({ privateKey: "must-not-cross" })),
    ).toThrow("USB batch manifest");
    expect(() =>
      parseUsbBatchManifest({
        ...manifest(),
        identities: [{ ...identity(), signature: "must-not-cross" }],
      }),
    ).toThrow("USB batch identity");
    expect(() =>
      parseUsbImportReceipt(receipt({ databaseUrl: "must-not-cross" })),
    ).toThrow("USB import receipt");
    expect(() =>
      canonicalUsbIdentity({
        schemaVersion: 1,
        usbId: USB_ID,
        batchId: BATCH_ID,
        issuedAt: "2026-08-01T00:00:00.000Z",
        signingKeyVersion: 1001,
        privateKey: "must-not-cross",
      } as never),
    ).toThrow("USB identity");
  });

  it.each(["../device.json", "/device.json", "C:\\device.json"])(
    "rejects an unsafe identity path %s",
    (path) =>
      expect(() => parseUsbBatchManifest(manifestWithPath(path))).toThrow(),
  );

  it.each([
    "identities//device.json",
    "identities/./device.json",
    "identities/../device.json",
    "",
  ])("rejects an unnormalized identity path %s", (path) => {
    expect(() => parseUsbBatchManifest(manifestWithPath(path))).toThrow(
      "payloadPath",
    );
  });

  it("rejects safe paths that do not match the fixed identity layout", () => {
    expect(() =>
      parseUsbBatchManifest(
        manifestWithPath(`identities/${USB_ID}/payload.json`),
      ),
    ).toThrow("fixed archive structure");
  });

  it("rejects duplicate USB IDs, digests, and paths", () => {
    expect(() =>
      parseUsbBatchManifest(
        manifest({
          count: 2,
          identities: [
            identity(),
            identity(USB_ID, SECOND_DIGEST),
          ],
        }),
      ),
    ).toThrow("usbId");
    expect(() =>
      parseUsbBatchManifest(
        manifest({
          count: 2,
          identities: [identity(), identity(SECOND_USB_ID, DIGEST)],
        }),
      ),
    ).toThrow("identityDigest");
    expect(() =>
      parseUsbBatchManifest(
        manifest({
          count: 2,
          identities: [
            identity(),
            {
              ...identity(SECOND_USB_ID, SECOND_DIGEST),
              signaturePath: `identities/${USB_ID}/device.sig`,
            },
          ],
        }),
      ),
    ).toThrow("path");
  });

  it.each([
    "A1111111-1111-4111-8111-111111111111",
    "11111111111141118111111111111111",
    "11111111-1111-0111-8111-111111111111",
    "11111111-1111-4111-7111-111111111111",
  ])("rejects a non-canonical UUID %s", (usbId) => {
    expect(() =>
      parseUsbBatchManifest(
        manifest({ identities: [identity(usbId, DIGEST)] }),
      ),
    ).toThrow("usbId");
  });

  it.each([
    "2026-08-01T08:00:00.000+08:00",
    "2026-08-01T00:00:00Z",
    "2026-02-30T00:00:00.000Z",
    "not-a-date",
  ])("rejects a non-canonical UTC instant %s", (createdAt) => {
    expect(() =>
      parseUsbBatchManifest(manifest({ createdAt })),
    ).toThrow("createdAt");
  });

  it("requires a positive safe signing key version and non-empty batch", () => {
    for (const signingKeyVersion of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        parseUsbBatchManifest(manifest({ signingKeyVersion })),
      ).toThrow("signingKeyVersion");
    }
    expect(() =>
      parseUsbBatchManifest(manifest({ count: 0, identities: [] })),
    ).toThrow("count");
  });

  it("requires count to equal identities length", () => {
    expect(() => parseUsbBatchManifest(manifest({ count: 2 }))).toThrow(
      "count",
    );
  });

  it("limits test batches to 100 and production batches to 5000", () => {
    const makeIdentities = (count: number) =>
      Array.from({ length: count }, (_, index) => {
        const suffix = index.toString(16).padStart(12, "0");
        const usbId = `00000000-0000-4000-8000-${suffix}`;
        const identityDigest = index.toString(16).padStart(64, "0");
        return identity(usbId, identityDigest);
      });

    expect(() =>
      parseUsbBatchManifest(
        manifest({ count: 101, identities: makeIdentities(101) }),
      ),
    ).toThrow("100");
    expect(() =>
      parseUsbBatchManifest(
        manifest({
          environment: "production",
          count: 5001,
          identities: makeIdentities(5001),
        }),
      ),
    ).toThrow("5000");
  });

  it.each(["a".repeat(63), "a".repeat(65), "A".repeat(64), "g".repeat(64)])(
    "rejects a non-canonical SHA-256 digest %s",
    (identityDigest) => {
      expect(() =>
        parseUsbBatchManifest(
          manifest({ identities: [identity(USB_ID, identityDigest)] }),
        ),
      ).toThrow("identityDigest");
    },
  );

  it("parses the exact import receipt", () => {
    expect(parseUsbImportReceipt(receipt())).toEqual(receipt());
  });

  it("rejects invalid receipt environment, count, digest, UUID, and timestamp", () => {
    expect(() =>
      parseUsbImportReceipt(receipt({ environment: "staging" })),
    ).toThrow("environment");
    for (const importedCount of [0, -1, 1.5, "1"]) {
      expect(() =>
        parseUsbImportReceipt(receipt({ importedCount })),
      ).toThrow("importedCount");
    }
    expect(() =>
      parseUsbImportReceipt(receipt({ importedCount: 101 })),
    ).toThrow("100");
    expect(() =>
      parseUsbImportReceipt(
        receipt({ environment: "production", importedCount: 5001 }),
      ),
    ).toThrow("5000");
    expect(() =>
      parseUsbImportReceipt(receipt({ manifestDigest: "A".repeat(64) })),
    ).toThrow("manifestDigest");
    expect(() =>
      parseUsbImportReceipt(
        receipt({ batchId: "A2222222-2222-4222-8222-222222222222" }),
      ),
    ).toThrow("batchId");
    expect(() =>
      parseUsbImportReceipt(
        receipt({ importedAt: "2026-08-01T08:01:00.000+08:00" }),
      ),
    ).toThrow("importedAt");
  });
});
