import { get, set, del } from "idb-keyval";
import { createFalconWorkerClient } from "@/crypto/falconInterface";
import { predictQuantumAccountAddress } from "@/lib/predictQuantumAccountAddress";
import { Hex } from "viem";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FalconLevel = 512 | 1024 | "ECC";

/** Public metadata for a keypair — safe to expose to the UI. */
export type KeypairMeta = {
  id: string;           // crypto.randomUUID()
  level: FalconLevel;
  label?: string;
  folioName?: string;   // name of the QuantumAccount folio this key controls; set once on first assignment
  createdAt: number;
  archivedAt?: number;  // set when keypair is retired after key rotation
};

type CipherRecord = {
  alg: "falcon";
  level: FalconLevel;
  cipherText: ArrayBuffer;
  iv: ArrayBuffer;      // 12 bytes for AES-GCM
  createdAt: number;
};

/** Full stored record (never exposed; only pk/sk CipherRecords are decrypted). */
type StoredKeypair = KeypairMeta & {
  pk: CipherRecord;
  sk: CipherRecord;
};

// ---------------------------------------------------------------------------
// IDB keys
// ---------------------------------------------------------------------------

const LEGACY_WRAPPING_KEY_ID = "cointrol:wrappingKey:v1";
const WRAPPING_SALT_ID       = "cointrol:wrappingSalt:v2";

function keypoolKey(uid: string) {
  return `cointrol:keypairs:v1:${uid}`;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let _uid: string | null = null;

export function isKeyStoreInitialised(): boolean {
  return _uid !== null;
}

// ---------------------------------------------------------------------------
// Init / teardown
// ---------------------------------------------------------------------------

/**
 * Must be called once when the user logs in (from AuthContext.onAuthStateChanged).
 * Runs legacy key migrations and sets the active UID.
 */
export async function initKeyStore(uid: string): Promise<void> {
  _uid = uid;

  // Migration 1: insecure stored raw wrapping key → wipe all old individual key records
  const legacy = await get(LEGACY_WRAPPING_KEY_ID);
  if (legacy !== undefined) {
    await Promise.all([
      del(LEGACY_WRAPPING_KEY_ID),
      del("cointrol:falcon:512:pk:v1"),
      del("cointrol:falcon:512:sk:v1"),
      del("cointrol:falcon:1024:pk:v1"),
      del("cointrol:falcon:1024:sk:v1"),
    ]);
  }

  // Migration 2: old non-namespaced keys (before UID namespacing)
  const OLD_PK_512 = "cointrol:falcon:512:pk:v1";
  const oldPk = await get(OLD_PK_512);
  if (oldPk !== undefined) {
    await Promise.all([
      del(OLD_PK_512),
      del("cointrol:falcon:512:sk:v1"),
      del("cointrol:falcon:1024:pk:v1"),
      del("cointrol:falcon:1024:sk:v1"),
    ]);
  }

  // Migration 3: old UID-namespaced individual keys → no-op, they'll just be
  // orphaned (pool is the source of truth). Nothing to delete since the new
  // pool key `keypoolKey(uid)` is entirely separate.
}

/** Call on sign-out to prevent key access after the session ends. */
export function clearKeyStore(): void {
  _uid = null;
}

// ---------------------------------------------------------------------------
// Wrapping key (AES-GCM derived from uid via PBKDF2)
// ---------------------------------------------------------------------------

function requireUid(): string {
  if (!_uid) throw new Error("keyStore not initialised — call initKeyStore(uid) first");
  return _uid;
}

async function loadOrCreateWrappingKey(): Promise<CryptoKey> {
  const uid = requireUid();

  const saltRaw = await get<ArrayBuffer | Uint8Array>(WRAPPING_SALT_ID);
  let salt: Uint8Array<ArrayBuffer>;
  if (!saltRaw || (saltRaw as { byteLength: number }).byteLength === 0) {
    salt = crypto.getRandomValues(new Uint8Array(32));
    await set(WRAPPING_SALT_ID, salt);
  } else if (saltRaw instanceof Uint8Array) {
    salt = saltRaw.slice();
  } else {
    salt = new Uint8Array(saltRaw as ArrayBuffer);
  }

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(uid),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: 300_000 },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ---------------------------------------------------------------------------
// Encrypt / decrypt helpers
// ---------------------------------------------------------------------------

function toArrayBuffer(u8: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(u8.byteLength);
  new Uint8Array(buf).set(u8);
  return buf;
}

async function encryptBytes(level: FalconLevel, bytes: Uint8Array): Promise<CipherRecord> {
  const wrappingKey = await loadOrCreateWrappingKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cipherText = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    toArrayBuffer(bytes)
  );

  return { alg: "falcon", level, cipherText, iv: toArrayBuffer(iv), createdAt: Date.now() };
}

async function decryptBytes(rec: CipherRecord): Promise<Uint8Array> {
  const wrappingKey = await loadOrCreateWrappingKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(rec.iv) },
    wrappingKey,
    rec.cipherText
  );
  return new Uint8Array(plain);
}

// ---------------------------------------------------------------------------
// Pool read / write helpers
// ---------------------------------------------------------------------------

async function loadPool(): Promise<StoredKeypair[]> {
  const uid = requireUid();
  return (await get<StoredKeypair[]>(keypoolKey(uid))) ?? [];
}

async function savePool(pool: StoredKeypair[]): Promise<void> {
  const uid = requireUid();
  await set(keypoolKey(uid), pool);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Return metadata for all keypairs (no decryption). */
export async function listKeypairs(): Promise<KeypairMeta[]> {
  const pool = await loadPool();
  return pool.map(({ id, level, label, folioName, createdAt, archivedAt }) => ({ id, level, label, folioName, createdAt, archivedAt }));
}

/** Record which folio this keypair is controlling. No-op if id not found or folioName already set. */
export async function setKeypairFolioName(id: string, folioName: string): Promise<void> {
  const pool = await loadPool();
  const idx = pool.findIndex(k => k.id === id);
  if (idx === -1) return;
  if (pool[idx].folioName !== undefined) return;
  pool[idx] = { ...pool[idx], folioName };
  await savePool(pool);
}

/** Mark a keypair as archived so it can no longer be used for signing new operations. */
export async function archiveKeypair(id: string): Promise<void> {
  const pool = await loadPool();
  const idx = pool.findIndex(k => k.id === id);
  if (idx === -1) return;
  pool[idx] = { ...pool[idx], archivedAt: Date.now() };
  await savePool(pool);
}

/**
 * Generate a new Falcon keypair, encrypt it, append to the pool, and return
 * its metadata. Throws if level is "ECC" (not yet implemented).
 */
export async function generateAndStoreKeypair(level: FalconLevel, label?: string): Promise<KeypairMeta> {
  if (level === "ECC") throw new Error("ECC keys not yet implemented");

  const falcon = createFalconWorkerClient();
  // generateKeypair in the worker now returns raw uint16 format (packedToRaw applied)
  const { pk, sk } = await falcon.generateKeypair(level);
  falcon.terminate();

  // Encrypt sequentially so the first call creates the salt before the second reads it
  const pkRec = await encryptBytes(level, pk);
  const skRec = await encryptBytes(level, sk);

  const meta: KeypairMeta = {
    id: crypto.randomUUID(),
    level,
    label,
    createdAt: Date.now(),
  };

  const pool = await loadPool();
  pool.push({ ...meta, pk: pkRec, sk: skRec });
  await savePool(pool);

  return meta;
}

/** Delete a keypair from the pool by id. */
export async function deleteKeypair(id: string): Promise<void> {
  const pool = await loadPool();
  await savePool(pool.filter(kp => kp.id !== id));
}

/** Decrypt and return the public key bytes for a keypair, or null if not found. */
export async function getPublicKey(keypairId: string): Promise<Uint8Array | null> {
  const pool = await loadPool();
  const kp = pool.find(k => k.id === keypairId);
  if (!kp) return null;
  return decryptBytes(kp.pk);
}

/** Decrypt and return the secret key bytes for a keypair, or null if not found. */
export async function getSecretKey(keypairId: string): Promise<Uint8Array | null> {
  const pool = await loadPool();
  const kp = pool.find(k => k.id === keypairId);
  if (!kp) return null;
  return decryptBytes(kp.sk);
}

/**
 * Predict the QuantumAccount address for a given keypair + salt + domain
 * (no IDB write).
 */
export async function predictAddressFromKeypair(
  keypairId: string,
  salt: Hex,
  domain: { factory: string; initCodeHash: string }
): Promise<string> {
  const pk = await getPublicKey(keypairId);
  if (!pk) throw new Error(`Keypair ${keypairId} not found`);
  return predictQuantumAccountAddress({
    factory:      domain.factory as Hex,
    salt,
    initCodeHash: domain.initCodeHash as Hex,
  });
}
