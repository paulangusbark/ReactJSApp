import { get, set } from "idb-keyval";

// --- Schema versioning -------------------------------------------------------

const COIN_KEY = "cointrol:coins:v1";
const COIN_SCHEMA_VERSION_KEY = "cointrol:coins:schemaVersion";
const CURRENT_COIN_SCHEMA_VERSION = 1;

// Contact schema v1
export type Coin = {
  id: string;  // unique identifier of the coin
  name: string;  // coin name
  symbol: string;  // coin symbol
  decimals: number; // decimal places (should be 0 for NFTs)
  chainId: number;  // blockchain network ID
  address: string;  // contract coin
  type: string; // token type (e.g., NATIVE, ERC20, ERC1155)
  tags?: string[];  // optional tags for categorization
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
};

const BUILTIN_COINS: Coin[] = [
  {
    id: "builtin:eth-sepolia",
    name: "Ether Sepolia",
    symbol: "ETH",
    decimals: 18,
    chainId: 11155111,
    address: "0x0",        // empty since there is no smart contract
    type: "NATIVE",        
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: "builtin:eth-mainnet",
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
    chainId: 1,
    address: "0x0",        // empty since there is no smart contract
    type: "NATIVE",        
    tags: [],
    createdAt: 0,
    updatedAt: 0,
  },
];



// --- In-memory subscribers for live updates ---------------------------------

type coinListener = (coin: Coin[]) => void;
const listeners = new Set<coinListener>();

function notifyCoinsUpdated(coins: Coin[]) {
  const allCoins = [...BUILTIN_COINS, ...coins];
  for (const listener of listeners) {
    listener(allCoins);
  }
}

export function subscribeToCoins(listener: coinListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- Schema migration scaffolding -------------------------------------------

async function getCoinsSchemaVersion(): Promise<number> {
  const v = await get<number | undefined>(COIN_SCHEMA_VERSION_KEY);
  // If nothing stored yet, assume current version (fresh install)
  if (!v) return CURRENT_COIN_SCHEMA_VERSION;
  return v;
}

async function setCoinsSchemaVersion(v: number): Promise<void> {
  await set(COIN_SCHEMA_VERSION_KEY, v);
}

/**
 * Run migrations if stored schema version is older than current.
 * Right now it's a no-op because v1 is the first schema.
 * When you introduce v2, add migration steps here.
 */
async function ensureCoinsSchemaMigrated(): Promise<void> {
  const storedVersion = await getCoinsSchemaVersion();

  if (storedVersion === CURRENT_COIN_SCHEMA_VERSION) {
    return;
  }

  let coins = await get<Coin[] | undefined>(COIN_KEY);
  if (!coins) coins = [];

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

  if (storedVersion < CURRENT_COIN_SCHEMA_VERSION) {
    await setCoinsSchemaVersion(CURRENT_COIN_SCHEMA_VERSION);
  }
}

// --- Core load/save helpers --------------------------------------------------

async function loadCoinsRaw(): Promise<Coin[]> {
  await ensureCoinsSchemaMigrated();
  const coins = await get<Coin[] | undefined>(COIN_KEY);
  return coins ?? [];
}

async function saveCoinsRaw(coins: Coin[]): Promise<void> {
  await set(COIN_KEY, coins);
  notifyCoinsUpdated(coins);
}

// --- Public API --------------------------------------------------------------

export async function getAllCoins(): Promise<Coin[]> {
  const coins = await loadCoinsRaw();
  return [...BUILTIN_COINS, ...coins];
}

export async function addCoin(input: {
  name: string;  // coin name
  symbol: string;  // coin symbol
  decimals: number; // decimal places (should be 0 for NFTs)
  chainId: number;  // blockchain network ID
  address: string;  // contract coin
  type: string; // token type (e.g., ERC20, BEP20)
  tags?: string[];  // optional tags for categorization
}): Promise<Coin[]> {
  const now = Date.now();
  const coins = await loadCoinsRaw();

  const newCoin: Coin = {
    id: `coin:${crypto.randomUUID?.() ?? `${now}:${coins.length}`}`,
    tags: input.tags || undefined,
    name: input.name,
    decimals: input.decimals,
    chainId: input.chainId,
    address: input.address,
    symbol: input.symbol,
    type: input.type,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [...coins, newCoin];
  await saveCoinsRaw(updated);
  return updated;
}

export async function updateCoin(
  id: string,
  patch: Partial<Omit<Coin, "id" | "createdAt">>
): Promise<Coin[]> {
  // Prevent editing built-in coins
  if (BUILTIN_COINS.some(c => c.id === id)) {
    // future option to include error
    return getAllCoins();
  }

  const coins = await loadCoinsRaw();
  const now = Date.now();
  const updated = coins.map(c =>
    c.id === id
      ? {
          ...c,
          ...patch,
          updatedAt: now,
        }
      : c
  );

  await saveCoinsRaw(updated);
  return [...BUILTIN_COINS, ...updated];
}

export async function deleteCoin(id: string): Promise<Coin[]> {
  // Do not allow deleting built-in coins
  if (BUILTIN_COINS.some(c => c.id === id)) {
    // Future option to return an error
    return getAllCoins();
  }

  const coins = await loadCoinsRaw();
  const updated = coins.filter(c => c.id !== id);
  await saveCoinsRaw(updated);
  return [...BUILTIN_COINS, ...updated];
}

export async function clearCoins(): Promise<void> {
  await saveCoinsRaw([]);
}
