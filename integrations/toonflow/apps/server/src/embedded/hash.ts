// Wyhash final-4, following Zig 0.14.1 std/hash/wyhash.zig (MIT).
// Kept byte-compatible with Bun 1.3.14 so existing extension revisions stay valid.
const secret = [0xa0761d6478bd642fn, 0xe7037ed1a0b428dbn, 0x8ebc6af09c88c6e3n, 0x589965cc75374cc3n];
const mask = 0xffffffffffffffffn;
const mix = (a: bigint, b: bigint) => { const value = (a & mask) * (b & mask); return (value & mask) ^ (value >> 64n); };

export function hash(input: string | ArrayBufferLike | ArrayBufferView, seed: number | bigint = 0): bigint {
  const bytes = typeof input === "string" ? Buffer.from(input) : ArrayBuffer.isView(input)
    ? Buffer.from(input.buffer, input.byteOffset, input.byteLength) : Buffer.from(new Uint8Array(input));
  const length = bytes.length;
  const word = (offset: number) => bytes.readBigUInt64LE(offset);
  let state = BigInt.asUintN(64, BigInt(seed));
  state ^= mix(state ^ secret[0]!, secret[1]!);
  let a = 0n, b = 0n;
  if (length <= 16) {
    if (length >= 4) {
      const end = length - 4, quarter = (length >> 3) << 2;
      a = (BigInt(bytes.readUInt32LE(0)) << 32n) | BigInt(bytes.readUInt32LE(quarter));
      b = (BigInt(bytes.readUInt32LE(end)) << 32n) | BigInt(bytes.readUInt32LE(end - quarter));
    } else if (length) a = (BigInt(bytes[0]!) << 16n) | (BigInt(bytes[length >> 1]!) << 8n) | BigInt(bytes[length - 1]!);
  } else {
    let offset = 0;
    if (length >= 48) {
      let second = state, third = state;
      for (; offset + 48 < length; offset += 48) {
        state = mix(word(offset) ^ secret[1]!, word(offset + 8) ^ state);
        second = mix(word(offset + 16) ^ secret[2]!, word(offset + 24) ^ second);
        third = mix(word(offset + 32) ^ secret[3]!, word(offset + 40) ^ third);
      }
      state ^= second ^ third;
    }
    for (; offset + 16 < length; offset += 16) state = mix(word(offset) ^ secret[1]!, word(offset + 8) ^ state);
    a = word(length - 16); b = word(length - 8);
  }
  const product = (a ^ secret[1]!) * (b ^ state);
  return mix((product & mask) ^ secret[0]! ^ BigInt(length), (product >> 64n) ^ secret[1]!);
}
