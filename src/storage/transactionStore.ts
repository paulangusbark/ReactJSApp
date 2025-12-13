import { get, set } from "idb-keyval";
import { userInfo } from "os";

// --- Schema versioning -------------------------------------------------------

const TXN_KEY = "cointrol:txns:v1";
const TXN_SCHEMA_VERSION_KEY = "cointrol:txns:schemaVersion";
const CURRENT_TXN_SCHEMA_VERSION = 1;

// Transaction schema v1

export type Txn = {
  id: string;  // unique identifier
  userOpHash: string;  // userOp hash
  transactionHash: string;  // txn reference
  chainId: number;  // chain identifier
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
}

export type TransactionStore = {
  txnId: string; // txn id
  addressId: string; // address id
  coinId: string // coin id (use "" if not applicable)
  folioId: string // folio id
  walletId: number; // wallet identifier in folio
}

// --- In-memory subscribers for live updates ---------------------------------

type txnListener = (txn: Txn[]) => void;
const listeners = new Set<txnListener>();

function notifyTxnsUpdated(txn: Txn[]) {
  for (const listener of listeners) {
    listener(txn);
  }
}

export function subscribeToTxns(listener: txnListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- Schema migration scaffolding -------------------------------------------

async function getTxnSchemaVersion(): Promise<number> {
  const v = await get<number | undefined>(TXN_SCHEMA_VERSION_KEY);
  // If nothing stored yet, assume current version (fresh install)
  if (!v) return CURRENT_TXN_SCHEMA_VERSION;
  return v;
}

async function setTxnSchemaVersion(v: number): Promise<void> {
  await set(TXN_SCHEMA_VERSION_KEY, v);
}

/**
 * Run migrations if stored schema version is older than current.
 * Right now it's a no-op because v1 is the first schema.
 * When you introduce v2, add migration steps here.
 */
async function ensureTxnSchemaMigrated(): Promise<void> {
  const storedVersion = await getTxnSchemaVersion();

  if (storedVersion === CURRENT_TXN_SCHEMA_VERSION) {
    return;
  }

  let txns = await get<Txn[] | undefined>(TXN_KEY);
  if (!txns) txns = [];

  // Example future migration (v1 → v2):
  //
  // if (storedVersion < 2) {
  //   const migrated = contacts.map(c => 
// --- In-memory subscribers for live updates ---------------------------------
//({
  //     ...c,
  //     tags: [], // new field with default
  //   }));
  //   await set(CONTACTS_KEY, migrated);
  //   await setContactsSchemaVersion(2);
  // }
  //
  // For now we just bump the version if needed.

  if (storedVersion < CURRENT_TXN_SCHEMA_VERSION) {
    await setTxnSchemaVersion(CURRENT_TXN_SCHEMA_VERSION);
  }
}

// --- Core load/save helpers --------------------------------------------------

async function loadTxnsRaw(): Promise<Txn[]> {
  await ensureTxnSchemaMigrated();
  const txns = await get<Txn[] | undefined>(TXN_KEY);
  return txns ?? [];
}

async function saveTxnsRaw(txns: Txn[]): Promise<void> {
  await set(TXN_KEY, txns);
  notifyTxnsUpdated(txns);
}

// --- Public API --------------------------------------------------------------

export async function getAllTxns(): Promise<Txn[]> {
  return loadTxnsRaw();
}

export async function addTxn(input: {
  id: string;  // unique identifier
  userOpHash: string;  // userOp hash
  transactionHash: string;  // txn reference
  chainId: number;  // chain identifier
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
}): Promise<Txn[]> {
  const now = Date.now();
  const txns = await loadTxnsRaw();

  const newTxn: Txn = {
    id: `txn:${crypto.randomUUID?.() ?? `${now}:${txns.length}`}`,
    chainId: input.chainId,
    userOpHash: input.userOpHash,
    transactionHash: input.transactionHash,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [...txns, newTxn];
  await saveTxnsRaw(updated);
  return updated;
}

export async function updateTxn(
  id: string,
  patch: Partial<Omit<Txn, "id" | "createdAt">>
): Promise<Txn[]> {
  const txns = await loadTxnsRaw();
  const now = Date.now();
  const updated = txns.map(c =>
    c.id === id
      ? {
          ...c,
          ...patch,
          updatedAt: now,
        }
      : c
  );

  await saveTxnsRaw(updated);
  return updated;
}

export async function deleteTxn(id: string): Promise<Txn[]> {
  const txns = await loadTxnsRaw();
  const updated = txns.filter(c => c.id !== id);
  await saveTxnsRaw(updated);
  return updated;
}

export async function clearTxns(): Promise<void> {
  await saveTxnsRaw([]);
}
