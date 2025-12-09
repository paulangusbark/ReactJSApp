import { get, set } from "idb-keyval";

// --- Schema versioning -------------------------------------------------------

const FOLIO_KEY = "cointrol:folios:v1";
const FOLIO_SCHEMA_VERSION_KEY = "cointrol:folios:schemaVersion";
const CURRENT_FOLIO_SCHEMA_VERSION = 1;

// Contact schema v1
export type Wallet = {
  coin: string;  // id from coin listener
  balance: number;  // balance in wei
};

export type Folio = {
  id: string;  // unique identifier
  address: string;  // wallet address
  name: string;  // label for the folio
  chainId: number;  // blockchain network ID
  paymaster: string; // paymaster address
  type: number; // small number for bitchecking
  bundler: string; // bundler address
  wallet?: Wallet[];  // optional list of associated wallets
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
}



// --- In-memory subscribers for live updates ---------------------------------

type folioListener = (folio: Folio[]) => void;
const listeners = new Set<folioListener>();

function notifyFoliosUpdated(folio: Folio[]) {
  for (const listener of listeners) {
    listener(folio);
  }
}

export function subscribeToFolios(listener: folioListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- Schema migration scaffolding -------------------------------------------

async function getFoliosSchemaVersion(): Promise<number> {
  const v = await get<number | undefined>(FOLIO_SCHEMA_VERSION_KEY);
  // If nothing stored yet, assume current version (fresh install)
  if (!v) return CURRENT_FOLIO_SCHEMA_VERSION;
  return v;
}

async function setFoliosSchemaVersion(v: number): Promise<void> {
  await set(FOLIO_SCHEMA_VERSION_KEY, v);
}

/**
 * Run migrations if stored schema version is older than current.
 * Right now it's a no-op because v1 is the first schema.
 * When you introduce v2, add migration steps here.
 */
async function ensureFoliosSchemaMigrated(): Promise<void> {
  const storedVersion = await getFoliosSchemaVersion();

  if (storedVersion === CURRENT_FOLIO_SCHEMA_VERSION) {
    return;
  }

  let folios = await get<Folio[] | undefined>(FOLIO_KEY);
  if (!folios) folios = [];

  // Example future migration (v1 → v2):
  //
  // if (storedVersion < 2) {
  //   const migrated = contacts.map(c => ({
  //     ...c,
  //     tags: [], // new field with default
  //   }));
  //   await set(CONTACTS_KEY, migrated);
  //   await setContactsSchemaVersion(2);
  // }
  //
  // For now we just bump the version if needed.

  if (storedVersion < CURRENT_FOLIO_SCHEMA_VERSION) {
    await setFoliosSchemaVersion(CURRENT_FOLIO_SCHEMA_VERSION);
  }
}

// --- Core load/save helpers --------------------------------------------------

async function loadFoliosRaw(): Promise<Folio[]> {
  await ensureFoliosSchemaMigrated();
  const folios = await get<Folio[] | undefined>(FOLIO_KEY);
  return folios ?? [];
}

async function saveFoliosRaw(folios: Folio[]): Promise<void> {
  await set(FOLIO_KEY, folios);
  notifyFoliosUpdated(folios);
}

// --- Public API --------------------------------------------------------------

export async function getAllFolios(): Promise<Folio[]> {
  return loadFoliosRaw();
}

export async function addFolio(input: {
  address: string;  // wallet address
  chainId: number;  // blockchain network ID
  name: string;  // label for the folio
  paymaster: string; // paymaster address
  type: number; // small number for bitchecking
  bundler: string; // bundler address
  wallet?: Wallet[];  // optional list of associated wallets
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
}): Promise<Folio[]> {
  const now = Date.now();
  const folios = await loadFoliosRaw();

  const newFolio: Folio = {
    id: `folio:${crypto.randomUUID?.() ?? `${now}:${folios.length}`}`,
    chainId: input.chainId,
    name: input.name,
    address: input.address,
    paymaster: input.paymaster,
    type: input.type,
    bundler: input.bundler,
    wallet: input.wallet || undefined,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [...folios, newFolio];
  await saveFoliosRaw(updated);
  return updated;
}

export async function updateFolio(
  id: string,
  patch: Partial<Omit<Folio, "id" | "createdAt">>
): Promise<Folio[]> {
  const folios = await loadFoliosRaw();
  const now = Date.now();
  const updated = folios.map(c =>
    c.id === id
      ? {
          ...c,
          ...patch,
          updatedAt: now,
        }
      : c
  );

  await saveFoliosRaw(updated);
  return updated;
}

export async function deleteFolio(id: string): Promise<Folio[]> {
  const folios = await loadFoliosRaw();
  const updated = folios.filter(c => c.id !== id);
  await saveFoliosRaw(updated);
  return updated;
}

export async function clearFolios(): Promise<void> {
  await saveFoliosRaw([]);
}
