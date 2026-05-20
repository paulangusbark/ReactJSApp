import { get, set } from "idb-keyval";
import { getCurrentUser } from "./currentUser";

// --- Schema versioning -------------------------------------------------------

function addressKey() { return `cointrol:address:v1:${getCurrentUser()}`; }
const ADDRESS_SCHEMA_VERSION_KEY = "cointrol:address:schemaVersion";
const CURRENT_ADDRESS_SCHEMA_VERSION = 1;

// Contact schema v1
export type Address = {
  id: string;  // unique identifier of the contact or contract
  name: string;  // copy of the name from contact or contract store
  isContact: boolean; // true for contacts and false for contracts
  isVisible: boolean; // whether to show in address book
  group?: string[]; // optional group tags for categorization
  indexOrder: number; // ordering index
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
};



// --- In-memory subscribers for live updates ---------------------------------

type addressListener = (address: Address[]) => void;
const listeners = new Set<addressListener>();

function notifyAddressUpdated(address: Address[]) {
  for (const listener of listeners) {
    listener(address);
  }
}

export function subscribeToAddress(listener: addressListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- Schema migration scaffolding -------------------------------------------

async function getAddressSchemaVersion(): Promise<number> {
  const v = await get<number | undefined>(ADDRESS_SCHEMA_VERSION_KEY);
  // If nothing stored yet, assume current version (fresh install)
  if (!v) return CURRENT_ADDRESS_SCHEMA_VERSION;
  return v;
}

async function setAddressSchemaVersion(v: number): Promise<void> {
  await set(ADDRESS_SCHEMA_VERSION_KEY, v);
}

/**
 * Run migrations if stored schema version is older than current.
 * Right now it's a no-op because v1 is the first schema.
 * When you introduce v2, add migration steps here.
 */
async function ensureAddressSchemaMigrated(): Promise<void> {
  const storedVersion = await getAddressSchemaVersion();

  if (storedVersion === CURRENT_ADDRESS_SCHEMA_VERSION) {
    return;
  }

  let addresss = await get<Address[] | undefined>(addressKey());
  if (!addresss) addresss = [];

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

  if (storedVersion < CURRENT_ADDRESS_SCHEMA_VERSION) {
    await setAddressSchemaVersion(CURRENT_ADDRESS_SCHEMA_VERSION);
  }
}

// --- Core load/save helpers --------------------------------------------------

async function loadAddressRaw(): Promise<Address[]> {
  await ensureAddressSchemaMigrated();
  const addresss = await get<Address[] | undefined>(addressKey());
  return addresss ?? [];
}

async function saveAddressRaw(addresss: Address[]): Promise<void> {
  await set(addressKey(), addresss);
  notifyAddressUpdated(addresss);
}

// --- Public API --------------------------------------------------------------

export async function getAllAddress(): Promise<Address[]> {
  return loadAddressRaw();
}

export async function addAddress(input: {
  id: string;
  name: string;
  group?: string[] | null;
  isContact: boolean;
  isVisible: boolean;
  indexOrder: number;
}): Promise<Address[]> {
  const now = Date.now();
  const addresss = await loadAddressRaw();

  const newAddress: Address = {
    id: input.id,
    name: input.name,
    group: input.group || undefined,
    isContact: input.isContact,
    isVisible: input.isVisible,
    indexOrder: input.indexOrder,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [...addresss, newAddress];
  await saveAddressRaw(updated);
  return updated;
}

export async function updateAddress(
  id: string,
  patch: Partial<Omit<Address, "id" | "createdAt">>
): Promise<Address[]> {
  const addresss = await loadAddressRaw();
  const now = Date.now();
  const updated = addresss.map(c =>
    c.id === id
      ? {
          ...c,
          ...patch,
          updatedAt: now,
        }
      : c
  );

  await saveAddressRaw(updated);
  return updated;
}

export async function reorderAddresses(
  reordered: Pick<Address, "id" | "indexOrder">[]
): Promise<Address[]> {
  const addresses = await loadAddressRaw();
  const orderMap = new Map(reordered.map(r => [r.id, r.indexOrder]));
  const now = Date.now();
  const updated = addresses.map(a =>
    orderMap.has(a.id)
      ? { ...a, indexOrder: orderMap.get(a.id)!, updatedAt: now }
      : a
  );
  await saveAddressRaw(updated);
  return updated;
}

export async function deleteAddress(id: string): Promise<Address[]> {
  const addresss = await loadAddressRaw();
  const updated = addresss.filter(c => c.id !== id);
  await saveAddressRaw(updated);
  return updated;
}

export async function clearAddress(): Promise<void> {
  await saveAddressRaw([]);
}
