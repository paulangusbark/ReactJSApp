import { get, set } from "idb-keyval";
import { getCurrentUser } from "./currentUser";

// --- Schema versioning -------------------------------------------------------

function recoveryKey() { return `cointrol:recovery:v1:${getCurrentUser()}`; }
const RECOVERY_SCHEMA_VERSION_KEY = "cointrol:recovery:schemaVersion";
const CURRENT_RECOVERY_SCHEMA_VERSION = 2;

// Recovery schema v1
export type Recovery = {
  id: string;  // unique identifier
  name: string;  // account name (folio name)
  chainId: number;  // chain id (must match chain id of folio name)
  paymaster?: string;  // deprecated — no longer used for management calls
  recoverableAddress: string;  // address of recoverable
  threshold: number;  // number of recovery addresses required to recover
  status: boolean;  // recoverable status on chain
  consumed: boolean;  // true when used for recovery and pending reinitialisation
  participants: string[];  // list of wallet addresses able to recover the account
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
};


// --- In-memory subscribers for live updates ---------------------------------

type RecoveryListener = (recovery: Recovery[]) => void;
const listeners = new Set<RecoveryListener>();

function notifyRecoveryUpdated(recovery: Recovery[]) {
  for (const listener of listeners) {
    listener(recovery);
  }
}

export function subscribeToRecovery(listener: RecoveryListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- Schema migration scaffolding -------------------------------------------

async function getRecoverySchemaVersion(): Promise<number> {
  const v = await get<number | undefined>(RECOVERY_SCHEMA_VERSION_KEY);
  // If nothing stored yet, assume current version (fresh install)
  if (!v) return CURRENT_RECOVERY_SCHEMA_VERSION;
  return v;
}

async function setRecoverySchemaVersion(v: number): Promise<void> {
  await set(RECOVERY_SCHEMA_VERSION_KEY, v);
}

/**
 * Run migrations if stored schema version is older than current.
 * Right now it's a no-op because v1 is the first schema.
 * When you introduce v2, add migration steps here.
 */
async function ensureRecoverySchemaMigrated(): Promise<void> {
  const storedVersion = await getRecoverySchemaVersion();

  if (storedVersion === CURRENT_RECOVERY_SCHEMA_VERSION) {
    return;
  }

  let recovery = await get<Recovery[] | undefined>(recoveryKey());
  if (!recovery) recovery = [];

  if (storedVersion < 2) {
    const migrated = recovery.map((r: any) => {
      const { paymaster, ...rest } = r;
      return rest as Recovery;
    });
    await set(recoveryKey(), migrated);
    await setRecoverySchemaVersion(2);
  }
}

// --- Core load/save helpers --------------------------------------------------

async function loadRecoveryRaw(): Promise<Recovery[]> {
  await ensureRecoverySchemaMigrated();
  const recovery = await get<Recovery[] | undefined>(recoveryKey());
  if (!recovery) return [];
  return recovery.map((r: any) => ({ consumed: false, ...r } as Recovery));
}

async function saveRecoveryRaw(recovery: Recovery[]): Promise<void> {
  await set(recoveryKey(), recovery);
  notifyRecoveryUpdated(recovery);
}

// --- Public API --------------------------------------------------------------

export async function getAllRecoveries(): Promise<Recovery[]> {
  return loadRecoveryRaw();
}

export async function addRecovery(input: {
  name: string;
  paymaster?: string | null;
  recoverableAddress: string | null;
  participants: string[]|null;
  threshold: number | null;
  chainId: number | null;
  status: boolean | null;
}): Promise<Recovery[]> {
  const now = Date.now();
  const recoveries = await loadRecoveryRaw();

  const newRecovery: Recovery = {
    id: `recovery:${crypto.randomUUID?.() ?? `${now}:${recoveries.length}`}`,
    name: input.name,
    recoverableAddress: input.recoverableAddress ?? "",
    participants: input.participants ?? [],
    threshold: input.threshold ?? 1,
    chainId: input.chainId ?? 0,
    status: input.status ?? false,
    consumed: false,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [...recoveries, newRecovery];
  await saveRecoveryRaw(updated);
  return updated;
}

export async function updateRecovery(
  id: string,
  patch: Partial<Omit<Recovery, "id" | "createdAt" | "paymaster" | "chainId" | "name">>
): Promise<Recovery[]> {
  const recoveries = await loadRecoveryRaw();
  const now = Date.now();
  const updated = recoveries.map(r =>
    r.id === id
      ? {
          ...r,
          ...patch,
          updatedAt: now,
        }
      : r
  );

  await saveRecoveryRaw(updated);
  return updated;
}

export async function deleteRecovery(id: string): Promise<Recovery[]> {
  const recoveries = await loadRecoveryRaw();
  const updated = recoveries.filter(r => r.id !== id);
  await saveRecoveryRaw(updated);
  return updated;
}

export async function clearRecovery(): Promise<void> {
  await saveRecoveryRaw([]);
}
