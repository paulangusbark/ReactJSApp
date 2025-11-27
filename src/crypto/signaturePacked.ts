export type BytesLike = Uint8Array | string | Buffer;

/**
 * Convert BytesLike to Uint8Array. Supports:
 * - Uint8Array / Buffer
 * - hex string with or without 0x prefix
 * - utf8 string (not typical for this function, but supported)
 */
export function toBytes(x: BytesLike): Uint8Array {
  if (x instanceof Uint8Array) return x;
  // Buffer is a subclass of Uint8Array at runtime, but narrow for TS:
  if (typeof Buffer !== "undefined" && typeof (Buffer as any).isBuffer === "function" && Buffer.isBuffer(x)) {
    return new Uint8Array(x);
  }
  if (typeof x === "string") {
    // hex?
    if (/^0x[0-9a-fA-F]*$/.test(x) || /^[0-9a-fA-F]+$/.test(x)) {
      const hex = x.startsWith("0x") ? x.slice(2) : x;
      if (hex.length % 2) throw new Error("Hex string length must be even");
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
      }
      return out;
    }
    // fallback: utf8
    return new TextEncoder().encode(x);
  }
  throw new Error("Unsupported input type for toBytes");
}

export function bytesToHex(bytes: Uint8Array, with0x = true): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i].toString(16).padStart(2, "0");
    hex += b;
  }
  return with0x ? "0x" + hex : hex;
}

/**
 * Encode:
 *   - salt: first 40 bytes of signature
 *   - coeffs: s[i] 16-bit values
 *
 * Solidity reference:
 *   s[i] = uint8(signature[40 + 2*i]) * 256 + uint8(signature[41 + 2*i]);
 */
export function encodeSignature(
  coeffs: Uint16Array | number[],
  salt: BytesLike,
  saltLength = 40
): Uint8Array {
  const saltBytes = toBytes(salt);
  if (saltBytes.length !== saltLength) {
    throw new Error(`Expected salt length ${saltLength}, got ${saltBytes.length}`);
  }

  const n = coeffs.length;
  const out = new Uint8Array(saltLength + 2 * n);

  // First saltLength bytes = salt
  out.set(saltBytes, 0);

  // Then 16-bit big-endian words
  for (let i = 0; i < n; i++) {
    const value = (typeof coeffs[i] === "number" ? coeffs[i] as number : coeffs[i]) & 0xffff;
    out[saltLength + 2 * i] = (value >> 8) & 0xff;      // high byte
    out[saltLength + 2 * i + 1] = value & 0xff;         // low byte
  }

  return out;
}

/**
 * Thin wrapper to get hex directly if you want.
 */
export function encodeSignatureHex(
  coeffs: Uint16Array | number[],
  salt: BytesLike,
  saltLength = 40
): string {
  return bytesToHex(encodeSignature(coeffs, salt, saltLength));
}

/**
 * Decode signature into:
 *   - salt: first saltLength bytes
 *   - coeffs: Uint16Array of 16-bit values
 *
 * Mirrors the Solidity:
 *   s[i] = uint8(signature[40 + 2*i]) * 256 + uint8(signature[41 + 2*i]);
 */
export function decodeSignature(
  signature: BytesLike,
  saltLength = 40
): { salt: Uint8Array; coeffs: Uint16Array } {
  const sigBytes = toBytes(signature);

  if (sigBytes.length < saltLength || ((sigBytes.length - saltLength) % 2) !== 0) {
    throw new Error("Bad signature length");
  }

  const n = (sigBytes.length - saltLength) / 2;
  const salt = sigBytes.slice(0, saltLength);
  const coeffs = new Uint16Array(n);

  for (let i = 0; i < n; i++) {
    const hi = sigBytes[saltLength + 2 * i];
    const lo = sigBytes[saltLength + 2 * i + 1];
    // uint16 big-endian, same as hi * 256 + lo
    coeffs[i] = (hi << 8) | lo;
  }

  return { salt, coeffs };
}
