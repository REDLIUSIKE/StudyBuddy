export type LogoutAuthorityReceipt = Readonly<{
  status: "revoked";
  authorityGeneration: number;
}>;

export function parseLogoutAuthorityReceipt(
  value: unknown,
): LogoutAuthorityReceipt {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw invalidLogoutAuthorityReceipt();
  }

  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  if (
    keys.length !== 2 ||
    !keys.includes("status") ||
    !keys.includes("authorityGeneration") ||
    record.status !== "revoked" ||
    !Number.isSafeInteger(record.authorityGeneration) ||
    (record.authorityGeneration as number) <= 0
  ) {
    throw invalidLogoutAuthorityReceipt();
  }

  return {
    status: "revoked",
    authorityGeneration: record.authorityGeneration as number,
  };
}

function invalidLogoutAuthorityReceipt(): TypeError {
  return new TypeError("Invalid logout authority receipt");
}

/** Additive native acknowledgement. Only the server's persisted logout session
 * supplies identity; devices/current and caller inputs are not revocation proof. */
export type NativeLogoutAuthorityReceiptV2 = Readonly<{
  schemaVersion: 2;
  status: 'revoked';
  accountOwner: string;
  deviceId: string;
  authorityGeneration: number;
}>;

export function parseNativeLogoutAuthorityReceiptV2(value: unknown): NativeLogoutAuthorityReceiptV2 {
  const keys = ['schemaVersion', 'status', 'accountOwner', 'deviceId', 'authorityGeneration'];
  if (value === null || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw invalidLogoutAuthorityReceipt();
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(value);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key) || !Object.hasOwn(descriptors[key] ?? {}, 'value'))) {
    throw invalidLogoutAuthorityReceipt();
  }
  const record = value as Record<string, unknown>;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  if (record.schemaVersion !== 2 || record.status !== 'revoked' ||
      typeof record.accountOwner !== 'string' || !uuid.test(record.accountOwner) ||
      typeof record.deviceId !== 'string' || !uuid.test(record.deviceId) ||
      !Number.isSafeInteger(record.authorityGeneration) || (record.authorityGeneration as number) <= 0) {
    throw invalidLogoutAuthorityReceipt();
  }
  return { schemaVersion: 2, status: 'revoked', accountOwner: record.accountOwner, deviceId: record.deviceId, authorityGeneration: record.authorityGeneration as number };
}
