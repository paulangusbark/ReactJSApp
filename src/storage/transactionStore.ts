import { get, set } from "idb-keyval";

// --- Schema versioning -------------------------------------------------------

const TXN_KEY = "cointrol:txns:v1";
const TXN_SCHEMA_VERSION_KEY = "cointrol:txns:schemaVersion";
const CURRENT_TXN_SCHEMA_VERSION = 2;

// Transaction schema v2

export type Txn = {
  id: string;  // unique identifier
  userOpHash: string;  // userOp hash
  transactionHash: string;  // txn reference
  chainId: number;  // chain identifier
  addressId: string; // address
  coinId: string | ""; // coin id (can be "")
  folioId: string; //folio id
  walletId: string | ""; // wallet id if applicable
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
  // v2 fields
  direction: "outgoing" | "incoming";
  fromAddress?: string;   // sender address (for incoming; for outgoing this is the folio address)
  toAddress?: string;     // recipient address (for outgoing; for incoming this is the folio address)
  amount?: string;        // transfer amount as decimal string (e.g. "1.5")
  tokenSymbol?: string;   // cached symbol for display (e.g. "USDC")
  ensFromName?: string;   // resolved ENS name for fromAddress, if any
  ensToName?: string;     // resolved ENS name for toAddress, if any
  functionName?: string;  // ABI function name called (e.g. "transfer", "approve")
  receiverAddress?: string; // actual token recipient/spender (transfer "to", approve "spender")
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
  // If nothing stored yet, assume v1 (could be an existing install with no version key)
  if (!v) return 1;
  return v;
}

async function setTxnSchemaVersion(v: number): Promise<void> {
  await set(TXN_SCHEMA_VERSION_KEY, v);
}

/**
 * Run migrations if stored schema version is older than current.
 * v1 → v2: set direction = "outgoing" on all existing records.
 */
async function ensureTxnSchemaMigrated(): Promise<void> {
  const storedVersion = await getTxnSchemaVersion();

  if (storedVersion === CURRENT_TXN_SCHEMA_VERSION) {
    return;
  }

  let txns = await get<any[] | undefined>(TXN_KEY);
  if (!txns) txns = [];

  if (storedVersion < 2) {
    const migrated = txns.map(t => ({
      ...t,
      direction: t.direction ?? "outgoing",
    }));
    await set(TXN_KEY, migrated);
    await setTxnSchemaVersion(2);
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
  id?: string;
  userOpHash: string;
  transactionHash: string;
  chainId: number;
  addressId: string;
  coinId: string | "";
  folioId: string;
  walletId: string | "";
  createdAt?: number;
  updatedAt?: number;
  direction?: "outgoing" | "incoming";
  fromAddress?: string;
  toAddress?: string;
  amount?: string;
  tokenSymbol?: string;
  ensFromName?: string;
  ensToName?: string;
  receiverAddress?: string;
}): Promise<Txn[]> {
  const now = Date.now();
  const txns = await loadTxnsRaw();

  const newTxn: Txn = {
    id: input.id ?? `txn:${crypto.randomUUID?.() ?? `${now}:${txns.length}`}`,
    chainId: input.chainId,
    userOpHash: input.userOpHash,
    transactionHash: input.transactionHash,
    addressId: input.addressId,
    coinId: input.coinId,
    folioId: input.folioId,
    walletId: input.walletId,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    direction: input.direction ?? "outgoing",
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    amount: input.amount,
    tokenSymbol: input.tokenSymbol,
    ensFromName: input.ensFromName,
    ensToName: input.ensToName,
    receiverAddress: input.receiverAddress,
  };

  const updated = [...txns, newTxn];
  await saveTxnsRaw(updated);
  return updated;
}

export async function updateTxn(
  id: string,
  patch: Partial<Omit<Txn, "id" | "createdAt" | "userOpHash">>
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

/**
 * Merge incoming transfers by id (deduplication key = incoming:chainId:txHash:logIndex).
 * Never overwrites records with direction = "outgoing".
 */
export async function upsertIncomingTxns(incoming: Txn[]): Promise<Txn[]> {
  const txns = await loadTxnsRaw();

  const merged = [...txns];
  for (const txn of incoming) {
    const existingIdx = merged.findIndex(t => t.id === txn.id);
    if (existingIdx !== -1) {
      // Never overwrite outgoing records
      if (merged[existingIdx].direction === "outgoing") continue;
      merged[existingIdx] = txn;
    } else {
      merged.push(txn);
    }
  }

  await saveTxnsRaw(merged);
  return merged;
}
