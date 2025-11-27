import { hashToPointCT } from "./hashMessage";
//import { UserOperation, calculateUserOpHash } from "./userOpHash";
import { Address } from "viem";
import { tx } from "@/db";
import { decodePkPacked } from "./falconPKPacked";
import { verify_signature } from "./falcon";

export type BytesLike = Uint8Array | Buffer | string;

/** Convert hex/string/buffer into Uint8Array */
function toBytes(x: BytesLike): Uint8Array {
  if (x instanceof Uint8Array) return x;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(x)) return new Uint8Array(x);
  if (typeof x === "string") {
    const hex = x.startsWith("0x") ? x.slice(2) : x;
    if (hex.length % 2) throw new Error("Hex string must have even length");
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
    }
    return out;
  }
  throw new Error("Unsupported input type");
}

/**
 * Extracts a Falcon signature (after the salt) into an array of uint16 values.
 * - Starts reading from byte offset 82 (to skip 40-byte salt + 1 byte for '0x' prefix)
 * - Each uint16 is formed as (byte1 * 256 + byte2)
 */
function extractSignatureToUint16Array(userSignature: BytesLike): Uint16Array {
  const bytes = toBytes(userSignature);

  // Slice off the first 82 bytes
  const sigBytes = bytes.slice(82);
  if (sigBytes.length % 2 !== 0) {
    throw new Error("Signature byte length must be even");
  }

  const result = new Uint16Array(sigBytes.length / 2);

  for (let i = 0; i < sigBytes.length; i += 2) {
    result[i / 2] = (sigBytes[i] << 8) | sigBytes[i + 1]; // big-endian pair
  }

  return result;
}

/* ---------- Example ----------
import { extractSignatureToUint16Array } from "./extractSignature";

const userOp = {
  signature: "0x" + "11".repeat(82) + "abcd12345678", // example hex
};

const sigArray = extractSignatureToUint16Array(userOp.signature);
console.log(sigArray.length, sigArray.slice(0, 8));
-------------------------------- */

/* export function verifySignature(acc_id: number, user_op: UserOperation, entry_point: Address, domain: string, chain_id: number): [boolean, string] {
    const salt = user_op.signature.slice(0, 2 + 40 * 2);
    const signature = extractSignatureToUint16Array(user_op.signature);  
    const userOpHash = calculateUserOpHash(user_op, entry_point, chain_id);
    const messageArray = hashToPointCT(domain, salt, userOpHash);
    const publicKey = getPublicKeyArray(acc_id);
    return [verify_signature(messageArray, signature, publicKey), userOpHash];
} */

export function verifyRequest(acc_id: number, domain: string, signature: BytesLike, request: BytesLike): boolean {
  const salt = signature.slice(0, 2 + 40 * 2);
  const sig = extractSignatureToUint16Array(signature);  
  const message = hashToPointCT(domain, salt, request);
  const publicKey = getPublicKeyArray(acc_id);
   return verify_signature(message, sig, publicKey);
}

export function verifyRequestNew(public_key: BytesLike, domain: string, signature: BytesLike, request: BytesLike): boolean {
  const salt = signature.slice(0, 2 + 40 * 2);
  const sig = extractSignatureToUint16Array(signature);  
  const message = hashToPointCT(domain, salt, request);
  return verify_signature(message, sig, decodePkPacked(public_key));
}

function hexToBuffer(hex: string) {
  return Buffer.from(hex.replace(/^0x/, ""), "hex");
}

function getPublicKeyArray(acc_id: number): Uint16Array {
    return tx(() => {
        const rawKey = hexToBuffer("11"); // need to replace with actual key as some point
        if (!rawKey) throw new Error(`Failed to find key for ${acc_id}`);
        const keyArray = decodePkPacked(rawKey);
        return keyArray
    });
}