import { get, set } from "idb-keyval";
import { ntruGen } from "@/crypto/ntrugen";
import { encodePkPacked } from "@/crypto/falconPKPacked";
import { bigPolyToUint16 } from "@/crypto/types";
import { buildFalconContext } from "@/crypto/context";
import { Poly } from "@/crypto/types";

export type FalconPrivateKey = {
    f: Uint16Array;
    F: Uint16Array;
    g: Uint16Array;
    G: Uint16Array; 
}

// --- Key Storage ---

const WRAPPING_KEY_ID = "cointrol:wrappingKey:v1";
const FALCON_KEY_ID = "cointrol:falconPrivateKey:v1";
const FALCON_PUBLIC_KEY_ID = "cointrol:falconPublicKey:v1";

type FalconKeyRecord = {
    alg: "falcon1024";
    cipherText: ArrayBuffer;  // encrypted private keys
    iv: ArrayBuffer;  // 12-byte nonce for AES-GCM
    createdAt: number;
}


// --- Wrapping key management -------------------------------------------------

/**
 * Load the AES-GCM wrapping key from IndexedDB, or create + persist a new one.
 * The key is non-exportable: you can use it but can't read the raw key bytes.
 */
async function loadOrCreateWrappingKey(): Promise<CryptoKey> {
  const existing = await get<CryptoKey>(WRAPPING_KEY_ID);
  if (existing) return existing;

  const fresh = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false, // extractable: false → cannot export raw key material
    ["encrypt", "decrypt"]
  );

  await set(WRAPPING_KEY_ID, fresh);
  return fresh;
}

// --- Falcon private key encoding/decoding ------------------------------------

/**
 * Encode Falcon private key (f, g, F, G) into a flat Uint8Array for encryption.
 * Each coefficient is stored as a 16-bit big-endian integer.
 *
 * Layout: [ f(0..1023), g(0..1023), F(0..1023), G(0..1023) ]
 */
function encodeFalconPrivateKey(pk: FalconPrivateKey): Uint8Array {
  const n = pk.f.length; // should be 1024
  if (
    pk.g.length !== n ||
    pk.F.length !== n ||
    pk.G.length !== n
  ) {
    throw new Error("Falcon polynomials have inconsistent lengths");
  }

  const polyCount = 4;
  const bytesPerCoeff = 2; // uint16
  const totalBytes = polyCount * n * bytesPerCoeff;
  const out = new Uint8Array(totalBytes);
  const view = new DataView(out.buffer);

  const writePoly = (poly: Uint16Array, polyIndex: number) => {
    const baseOffset = polyIndex * n * bytesPerCoeff;
    for (let i = 0; i < n; i++) {
      const coeff = poly[i]; // assume 0..12288 fits in uint16
      const offset = baseOffset + i * bytesPerCoeff;
      view.setUint16(offset, coeff, false); // big-endian
    }
  };

  writePoly(pk.f, 0);
  writePoly(pk.g, 1);
  writePoly(pk.F, 2);
  writePoly(pk.G, 3);

  return out;
}

/**
 * Decode Uint8Array back into Falcon private key (f, g, F, G).
 */
function decodeFalconPrivateKey(bytes: Uint8Array): FalconPrivateKey {
  const bytesPerCoeff = 2;
  const polyCount = 4;
  if (bytes.length % (polyCount * bytesPerCoeff) !== 0) {
    throw new Error("Invalid Falcon private key byte length");
  }

  const n = bytes.length / (polyCount * bytesPerCoeff);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const readPoly = (polyIndex: number): Uint16Array => {
    const poly = new Uint16Array(n);
    const baseOffset = polyIndex * n * bytesPerCoeff;
    for (let i = 0; i < n; i++) {
      const offset = baseOffset + i * bytesPerCoeff;
      poly[i] = view.getUint16(offset, false); // big-endian
    }
    return poly;
  };

  return {
    f: readPoly(0),
    g: readPoly(1),
    F: readPoly(2),
    G: readPoly(3),
  };
}


// --- Falcon key API ----------------------------------------------------------

/**
 * Check if a Falcon private key record exists in IndexedDB.
 */
async function falconKeyExists(): Promise<boolean> {
  const rec = await get<FalconKeyRecord>(FALCON_KEY_ID);
  return !!rec;
}


/**
 * Get the Falcon private key if it exists, otherwise return null.
 */
async function getFalconPrivateKeyOrNull(): Promise<FalconPrivateKey | null> {
  const rec = await get<FalconKeyRecord>(FALCON_KEY_ID);
  if (!rec) return null;

  const wrappingKey = await loadOrCreateWrappingKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: rec.iv },
    wrappingKey,
    rec.cipherText
  );

  const bytes = new Uint8Array(plain);
  return decodeFalconPrivateKey(bytes);
}

export async function getFalconPublicKey(): Promise<Uint8Array | null> {
  const rec = await get<FalconKeyRecord>(FALCON_PUBLIC_KEY_ID);
  if (!rec) return null;
  const wrappingKey = await loadOrCreateWrappingKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: rec.iv },
    wrappingKey,
    rec.cipherText
  );

  const bytes = new Uint8Array(plain);

  return bytes;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

/**
 * Generate a fresh Falcon private key with ntruGen(1024),
 * encrypt it, store it, and return it.
 * also store public key
 */
export async function generateAndStoreFalconPrivateKey(): Promise<FalconPrivateKey> {
  // Your ntruGen implementation should return [f, g, F, G]
    const [f, g, F, G] = ntruGen(1024);
    const pk: FalconPrivateKey = { 
        f: bigPolyToUint16(f),
        g: bigPolyToUint16(g),
        F: bigPolyToUint16(F),
        G: bigPolyToUint16(G)
    };
    const fPoly: Poly = Array.from(f, x => BigInt(x));
    const gPoly: Poly = Array.from(g, x => BigInt(x));
    const FPoly: Poly = Array.from(F, x => BigInt(x));
    const GPoly: Poly = Array.from(G, x => BigInt(x));
    const sig_bound = 70265242;
    const sigmin = 1.298280334344292;
    const sigma = 168.38857144654395;
    const ctx = buildFalconContext({f: fPoly, g: gPoly, F: FPoly, G: GPoly, q: 12289, sigma: sigma, sigmin: sigmin, signatureBound: sig_bound});
    const h: number[] = Array.from(ctx.h, x => Number(x));
    const packed = encodePkPacked(h); 
    const wrappingKey = await loadOrCreateWrappingKey();

    const plainBytes = encodeFalconPrivateKey(pk);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const cipherText = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        wrappingKey,
        toArrayBuffer(plainBytes)
    );

    const rec: FalconKeyRecord = {
        alg: "falcon1024",
        cipherText: cipherText,
        iv: toArrayBuffer(iv),
        createdAt: Date.now(),
    };

    const cipherPKText = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        wrappingKey,
        toArrayBuffer(packed)
    );

    const recPK: FalconKeyRecord = {
        alg: "falcon1024",
        cipherText: cipherPKText,
        iv: toArrayBuffer(iv),
        createdAt: Date.now(),
    };

    await set(FALCON_KEY_ID, rec);
    await set(FALCON_PUBLIC_KEY_ID, recPK);
    return pk;
}

/**
 * Ensure a Falcon private key exists:
 * - If stored: decrypt and return it.
 * - If not: generate, store, and return a new one.
 */
export async function ensureFalconPrivateKey(): Promise<Boolean> {
  const existing = await getFalconPrivateKeyOrNull();
  if (existing) return !!existing;
  const newKey = generateAndStoreFalconPrivateKey();
  return !!newKey;
}

/**
 * 
 * @returns the Falcon private key for signing
 */
export async function getPrivateKey(): Promise<FalconPrivateKey> {
    const sk = await getFalconPrivateKeyOrNull();
    if (!sk) {
        throw new Error("Falcon private key not found");
    }
    return sk;
}