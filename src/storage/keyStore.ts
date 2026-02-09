import { get, set } from "idb-keyval";
import { createFalconWorkerClient } from "@/crypto/falconInterface";
import { predictQuantumAccountAddress } from "@/lib/predictQuantumAccountAddress";
import { stringToHex, bytesToHex } from "viem";

export type FalconLevel = 512 | 1024;

export type FalconKeypair = {
  level: FalconLevel;
  pk: Uint8Array;
  sk: Uint8Array;
};

// --- Key Storage ---

const WRAPPING_KEY_ID = "cointrol:wrappingKey:v1";
const FALCON_512_SK_KEY_ID = "cointrol:falcon:512:sk:v1";
const FALCON_512_PK_KEY_ID = "cointrol:falcon:512:pk:v1";
const FALCON_1024_SK_KEY_ID = "cointrol:falcon:1024:sk:v1";
const FALCON_1024_PK_KEY_ID = "cointrol:falcon:1024:pk:v1";

type CipherRecord = {
  alg: "falcon";
  level: FalconLevel;
  cipherText: ArrayBuffer;
  iv: ArrayBuffer;        // 12 bytes for AES-GCM
  createdAt: number;
};

function keyId(level: FalconLevel, kind: "pk" | "sk") {
  return `cointrol:falcon:${level}:${kind}:v1`;
}

let wrappingKeyPromise: Promise<CryptoKey> | null = null;

async function loadOrCreateWrappingKey(): Promise<CryptoKey> {
  if (!wrappingKeyPromise) {
    wrappingKeyPromise = (async () => {
      const raw = await get<ArrayBuffer>(WRAPPING_KEY_ID);
      if (raw) {
        return crypto.subtle.importKey("raw", raw, "AES-GCM", true, [
          "encrypt",
          "decrypt",
        ]);
      }

      const fresh = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true, // extractable: true → export to raw bytes for IndexedDB storage
        ["encrypt", "decrypt"]
      );

      const exported = await crypto.subtle.exportKey("raw", fresh);
      await set(WRAPPING_KEY_ID, exported);
      return fresh;
    })().catch((e) => {
      wrappingKeyPromise = null; // allow retry on failure
      throw e;
    });
  }
  return wrappingKeyPromise;
}

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

function fromArrayBuffer(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

async function encryptBytes(level: FalconLevel, bytes: Uint8Array): Promise<CipherRecord> {
  const wrappingKey = await loadOrCreateWrappingKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cipherText = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    toArrayBuffer(bytes)
  );

  return {
    alg: "falcon",
    level,
    cipherText,
    iv: toArrayBuffer(iv),
    createdAt: Date.now(),
  };
}

async function decryptBytes(rec: CipherRecord): Promise<Uint8Array> {
  const wrappingKey = await loadOrCreateWrappingKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(rec.iv) },
    wrappingKey,
    rec.cipherText
  );
  return fromArrayBuffer(plain);
}

export async function getFalconPublicKey(level: FalconLevel): Promise<Uint8Array | null> {
  const rec = await get<CipherRecord>(keyId(level, "pk"));
  if (!rec) return null;
  return decryptBytes(rec);
}

export async function getFalconSecretKey(level: FalconLevel): Promise<Uint8Array | null> {
  const rec = await get<CipherRecord>(keyId(level, "sk"));
  if (!rec) return null;
  return decryptBytes(rec);
}

export async function falconKeypairExists(level: FalconLevel): Promise<boolean> {
  const [pkRec, skRec] = await Promise.all([
    get<CipherRecord>(keyId(level, "pk")),
    get<CipherRecord>(keyId(level, "sk")),
  ]);
  return !!pkRec && !!skRec;
}

/**
 * Generate a fresh Falcon private key with ntruGen(1024),
 * encrypt it, store it, and return it.
 * also store public key
 */
export async function generateAndStoreFalconKeypair(level: FalconLevel): Promise<{ pk: Uint8Array; sk: Uint8Array }> {
  const falcon = createFalconWorkerClient();

  // Generate using liboqs inside the worker
  const { pk, sk } = await falcon.generateKeypair(level);

  // Encrypt with distinct IVs (IMPORTANT)
  const [pkRec, skRec] = await Promise.all([
    encryptBytes(level, pk),
    encryptBytes(level, sk),
  ]);

  await Promise.all([
    set(keyId(level, "pk"), pkRec),
    set(keyId(level, "sk"), skRec),
  ]);

  return { pk, sk };
}

const ensureInFlight = new Map<FalconLevel, Promise<boolean>>();

export async function ensureFalconKeypair(level: FalconLevel): Promise<boolean> {
  const existing = ensureInFlight.get(level);
  if (existing) return existing;

  const p = (async () => {
    // Fast path
    if (await falconKeypairExists(level)) return true;

    // Generate/store
    const { pk, sk } = await generateAndStoreFalconKeypair(level);

    // Defensive: verify persisted state (not just returned buffers)
    const ok = pk.length > 0 && sk.length > 0;
    if (!ok) return false;

    // Re-check storage to confirm it stuck (helps if store partially failed)
    return await falconKeypairExists(level);
  })().catch((e) => {
    // allow retry after real failure
    ensureInFlight.delete(level);
    throw e;
  });

  ensureInFlight.set(level, p);
  return p.finally(() => {
    // Once complete, remove lock so future calls can just fast-path on exists()
    ensureInFlight.delete(level);
  });
}



/**
 * 
 * @returns the Falcon private key for signing
 */
export async function getSecretKey(level: FalconLevel): Promise<Uint8Array> {
  const sk = await getFalconSecretKey(level);
  if (!sk) throw new Error(`Falcon-${level} secret key not found`);
  return sk;
}


export async function getAddress(salt: string, level: FalconLevel): Promise<string> {
  const pk = await getFalconPublicKey(level);
  if (!pk) {
    throw new Error("Falcon public key not found");
  }
  const entryPointAddress = `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`; // need to replace with domain look up
  const factoryAddress = `0x7A1efaf375798B6B0df2BE94CF8A13F68c9E74eE`; // need to replace with domain look up
  const falconAddress = `0xdc8832f7bc16bE8a97E6c7cB66f912B6922246B5`; // need to replace with domain look up
  const address = predictQuantumAccountAddress({
    entryPoint: entryPointAddress,
    factory: factoryAddress,
    falcon: falconAddress,
    publicKeyBytes: bytesToHex(pk),
    salt: stringToHex(salt),
  });
  return address;
}