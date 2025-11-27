// falconHashToPointKeccak.mjs
// Implements Falcon-1024 hash-to-point driven by Keccak-256 (counter-mode XOF).
// npm install @noble/hashes

import { keccak_256 } from "../../node_modules/@noble/hashes/sha3";

// ==== Falcon-1024 parameters ====
export const Q = 12289;
export const N = 1024;
export const REJ = 61445;           // 5 * Q
export const OVER_CT = 287;         // oversampling for constant-work
export const CT_BYTES = (N + OVER_CT) * 2; // 2622 bytes

// ==== Helpers ====
const textEncoder = new TextEncoder();

export type BytesLike = Uint8Array | Buffer | string;

/**
 * Convert input to Uint8Array
 * Accepts Buffer | Uint8Array | hex string | utf8 string
 */
export function toBytes(x: BytesLike): Uint8Array {
  if (x == null) throw new TypeError("Expected a value");
  if (x instanceof Uint8Array || Buffer.isBuffer(x)) return new Uint8Array(x);
  if (typeof x === "string") {
    if (/^0x[0-9a-fA-F]*$/.test(x) || /^[0-9a-fA-F]+$/.test(x)) {
      const hex = x.startsWith("0x") ? x.slice(2) : x;
      if (hex.length % 2) throw new Error("Hex string length must be even");
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i++)
        out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
      return out;
    }
    return textEncoder.encode(x); // UTF-8
  }
  throw new TypeError("Unsupported input type");
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Encode 4-byte big-endian uint32 */
export function u32be(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0 || n > 0xffffffff)
    throw new Error("counter out of range");
  const b = new Uint8Array(4);
  b[0] = (n >>> 24) & 0xff;
  b[1] = (n >>> 16) & 0xff;
  b[2] = (n >>> 8) & 0xff;
  b[3] = n & 0xff;
  return b;
}

/** Read 16-bit big-endian */
export function readU16BE(src: Uint8Array, off: number): number {
  return (src[off] << 8) | src[off + 1];
}

/** Reduce v (0..61444) modulo q=12289 via fixed subtraction chain */
export function reduceModQ(v: number): number {
  let w = v >>> 0;
  if (w >= Q) w -= Q;
  if (w >= Q) w -= Q;
  if (w >= Q) w -= Q;
  if (w >= Q) w -= Q;
  return w;
}

// ==== Keccak-256 “XOF”: counter-mode ====
/**
 * Expand to `outLen` bytes using:
 *   keccak256(domain || nonce || message || uint32(counter))
 *
 * `message` must be exactly 32 bytes (bytes32)
 */
export function keccakExpand(domain: BytesLike, nonce: BytesLike, message: BytesLike, outLen: number): Uint8Array {
  const dom = toBytes(domain);
  const non = toBytes(nonce);
  const msg = toBytes(message);
  if (msg.length !== 32) throw new Error("message must be 32 bytes (bytes32)");

  const prefix = concatBytes(dom, non, msg);
  const fullBlocks = Math.floor(outLen / 32);
  const tail = outLen % 32;

  const out = new Uint8Array(outLen);
  let offset = 0;

  for (let ctr = 0; ctr < fullBlocks; ctr++) {
    const h = keccak_256.create().update(prefix).update(u32be(ctr)).digest();
    out.set(h, offset);
    offset += 32;
  }
  if (tail !== 0) {
    const hLast = keccak_256.create().update(prefix).update(u32be(fullBlocks)).digest();
    out.set(hLast.slice(0, tail), offset);
  }
  return out;
}

// ==== Public API (constant-work hash-to-point) ====
/**
 * hashToPointKeccakCT(domain, nonce, message) → Uint16Array(1024)
 * Mirrors Falcon’s constant-work sampler.
 */
export function hashToPointKeccakCT(domain: BytesLike, nonce: BytesLike, message: BytesLike): Uint16Array {
  const stream = keccakExpand(domain, nonce, message, CT_BYTES);
  const coeffs = new Uint16Array(N);

  let outIdx = 0;
  for (let off = 0; off < CT_BYTES; off += 2) {
    const w = readU16BE(stream, off);
    if (w < REJ && outIdx < N) {
      coeffs[outIdx++] = reduceModQ(w);
      // Still scans the whole stream for constant work.
    }
  }
  if (outIdx < N) throw new Error("H2P: not enough valid samples");
  return coeffs;
}

/**
 * Optional thin wrapper (same logic as Solidity test contract)
 */
export function hashToPointCT(domain: BytesLike, nonce: BytesLike, message: BytesLike): Uint16Array {
  const msg = toBytes(message);
  if (msg.length !== 32) throw new Error("message must be 32 bytes (bytes32)");
  return hashToPointKeccakCT(domain, nonce, msg);
}

// === Example usage ===
// (Uncomment to test directly)
/*
const domain  = "ETHEREUM MAINNET";
const nonce   = "0x" + "11".repeat(40);
const message = "0x" + "ab".repeat(32);

const coeffs = hashToPointKeccakCT(domain, nonce, message);
console.log("coeffs length:", coeffs.length); // 1024
console.log("first 8 coeffs:", Array.from(coeffs.slice(0, 8)));
*/
