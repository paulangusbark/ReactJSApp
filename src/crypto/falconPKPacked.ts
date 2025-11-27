// falconPkPacked.ts
// SPDX-License-Identifier: MIT

// If you use Buffer in Node, install types:  npm i -D @types/node

export const N = 1024;
export const PACKED_LEN = 1792; // 1024 * 14 / 8

export type BytesLike = Uint8Array | string | Buffer;

/**
 * Convert BytesLike to Uint8Array. Supports:
 * - Uint8Array / Buffer
 * - hex string with or without 0x prefix
 * - utf8 string (not typical for this function, but supported)
 */
function toBytes(x: BytesLike): Uint8Array {
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

/**
 * Encode 1024 coefficients (each < 2^14) into 1792 bytes (14-bit packing).
 * Layout is the exact inverse of decodePublicKeyModQPacked:
 *  - LSB-first into accumulator
 *  - Emit bytes from low 8 bits of accumulator
 *
 * If withHeader is true, a single header byte will be prefixed (length = 1793).
 */
export function encodePublicKeyModQToPacked(
  coeffs: Uint16Array | number[],
  opts?: { withHeader?: boolean; headerByte?: number }
): Uint8Array {
  const { withHeader = false, headerByte = 0x00 } = opts || {};

  if (coeffs.length !== N) {
    throw new Error(`expected ${N} coefficients, got ${coeffs.length}`);
  }

  const outLen = PACKED_LEN + (withHeader ? 1 : 0);
  const out = new Uint8Array(outLen);

  let idx = 0;
  if (withHeader) {
    out[0] = headerByte & 0xff;
    idx = 1;
  }

  let acc = 0 >>> 0;     // 32-bit accumulator
  let accBits = 0 >>> 0; // number of valid bits in acc

  for (let i = 0; i < N; i++) {
    const word = (typeof coeffs[i] === "number" ? coeffs[i] as number : coeffs[i]) & 0x3fff; // 14 bits
    acc |= word << accBits;
    accBits += 14;

    // While we have at least one full byte, emit it
    while (accBits >= 8) {
      out[idx++] = acc & 0xff;
      acc >>>= 8;
      accBits -= 8;
    }
  }

  // For 1024 * 14 bits, this should end exactly on a byte boundary
  if (accBits !== 0) {
    throw new Error("internal packing error: leftover bits after encoding");
  }
  if (idx !== out.length) {
    throw new Error(
      `internal packing error: wrote ${idx} bytes, expected ${out.length}`
    );
  }

  return out;
}

// Thin wrappers for symmetry with decodePkPacked
export function encodePkPacked(
  coeffs: Uint16Array | number[],
  withHeader = false,
  headerByte = 0x00
): Uint8Array {
  return encodePublicKeyModQToPacked(coeffs, { withHeader, headerByte });
}

function bytesToHex(bytes: Uint8Array, with0x = true): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i].toString(16).padStart(2, "0");
    hex += b;
  }
  return with0x ? "0x" + hex : hex;
}

export function encodePkPackedHex(coeffs: Uint16Array | number[], withHeader = false, headerBytes = 0x00): string {
  return bytesToHex(encodePkPacked(coeffs, withHeader, headerBytes));
}

/**
 * Decode 1792 bytes (14-bit packing) into 1024 uint16 coefficients.
 * If a 1-byte Falcon header is present (length = 1793), it will be skipped.
 *
 * Mirrors the Solidity:
 *  - LSB-first fill into an accumulator
 *  - Pop 14-bit words (mask 0x3FFF)
 *
 * Throws on malformed length or insufficient data.
 */
export function decodePublicKeyModQPacked(packed: BytesLike): Uint16Array {
  const buf = toBytes(packed);
  const start = buf.length === PACKED_LEN + 1 ? 1 : 0; // skip header if present

  if (buf.length !== PACKED_LEN + start) {
    throw new Error("bad pk length");
  }

  const h = new Uint16Array(N);
  let idx = start;
  let acc = 0 >>> 0;    // 32-bit accumulator
  let accBits = 0 >>> 0;
  let i = 0;

  while (i < N) {
    // Ensure at least 14 bits in the accumulator
    while (accBits < 14) {
      if (idx >= buf.length) throw new Error("pk too short");
      acc |= (buf[idx] as number) << accBits;
      idx++;
      accBits += 8;
    }
    // Take low 14 bits
    const word = acc & 0x3fff;
    h[i] = word;
    acc >>>= 14;
    accBits -= 14;
    i++;
  }

  return h;
}

// Optional thin wrapper (parity with your Solidity util contract)
export function decodePkPacked(pk: BytesLike): Uint16Array {
  return decodePublicKeyModQPacked(pk);
}

/* ---------- Example ----------
import { decodePublicKeyModQPacked } from "./falconPkPacked";

// Example: a 1792- or 1793-byte buffer/hex string
const pkHex = "0x" + "00".repeat(1792); // replace with real data
const coeffs = decodePublicKeyModQPacked(pkHex);

console.log(coeffs.length); // 1024
console.log(Array.from(coeffs.slice(0, 8)));
-------------------------------- */
