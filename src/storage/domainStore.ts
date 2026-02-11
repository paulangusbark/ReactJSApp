import { get, set } from "idb-keyval";

// --- Schema versioning -------------------------------------------------------

const DOMAIN_KEY = "cointrol:domains:v1";
const DOMAIN_SCHEMA_VERSION_KEY = "cointrol:domains:schemaVersion";
const CURRENT_DOMAIN_SCHEMA_VERSION = 1;

// Domain schema v1

export type Domain = {
  name: string;  // label for the folio
  chainId: number;  // blockchain network ID
  entryPoint: string; //  entrypoint address
  paymaster: string; //  paymaster address
  bundler: string; //  bundler address
  rpcUrl: string; //  rpc url used locally by app (is not a copy of bundler/paymaster rpc urls)
  transactionUrl: string; //  etherscan url for tx (or equivalent)
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
}

const BUILTIN_DOMAINS: Domain[] = [{
  name: "ETHEREUM SEPOLIA",
  chainId: 11155111,
  entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",  // need to add proper address
  paymaster: "0x1CB61909E699bfB42dF4BF742585B4bd8AB1EEA5",
  bundler: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  rpcUrl: "https://ethereum-sepolia-rpc.publicnode.com", //
  transactionUrl: "https://sepolia.etherscan.io/tx/", 
  createdAt: 0,
  updatedAt: 0
}];


// --- In-memory subscribers for live updates ---------------------------------

type domainListener = (domain: Domain[]) => void;
const listeners = new Set<domainListener>();

function notifyDomainsUpdated(domain: Domain[]) {
  const allDomains = [...domain, ...BUILTIN_DOMAINS];
  for (const listener of listeners) {
    listener(allDomains);
  }
}

export function subscribeToDomains(listener: domainListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- Schema migration scaffolding -------------------------------------------

async function getDomainsSchemaVersion(): Promise<number> {
  const v = await get<number | undefined>(DOMAIN_SCHEMA_VERSION_KEY);
  // If nothing stored yet, assume current version (fresh install)
  if (!v) return CURRENT_DOMAIN_SCHEMA_VERSION;
  return v;
}

async function setDomainsSchemaVersion(v: number): Promise<void> {
  await set(DOMAIN_SCHEMA_VERSION_KEY, v);
}

/**
 * Run migrations if stored schema version is older than current.
 * Right now it's a no-op because v1 is the first schema.
 * When you introduce v2, add migration steps here.
 */
async function ensureDomainSchemaMigrated(): Promise<void> {
  const storedVersion = await getDomainsSchemaVersion();

  if (storedVersion === CURRENT_DOMAIN_SCHEMA_VERSION) {
    return;
  }

  let domains = await get<Domain[] | undefined>(DOMAIN_KEY);
  if (!domains) domains = [];

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

  if (storedVersion < CURRENT_DOMAIN_SCHEMA_VERSION) {
    await setDomainsSchemaVersion(CURRENT_DOMAIN_SCHEMA_VERSION);
  }
}

// --- Core load/save helpers --------------------------------------------------

async function loadDomainsRaw(): Promise<Domain[]> {
  await ensureDomainSchemaMigrated();
  const domains = await get<Domain[] | undefined>(DOMAIN_KEY);
  return domains ?? [];
}

async function saveDomainsRaw(domains: Domain[]): Promise<void> {
  await set(DOMAIN_KEY, domains);
  notifyDomainsUpdated(domains);
}

// --- Public API --------------------------------------------------------------

export async function getAllDomains(): Promise<Domain[]> {
  const domains = await loadDomainsRaw();
  return [...domains, ...BUILTIN_DOMAINS];
}

export async function addDomain(input: {
  name: string;  // label for the folio
  chainId: number;  // blockchain network ID
  entryPoint: string; //  entrypoint address
  paymaster: string; //  paymaster address
  bundler: string; //  bundler address
  rpcUrl: string; //  rpc url used locally by app (is not a copy of bundler/paymaster rpc urls)
  transactionUrl: string; //  etherscan url for tx (or equivalent)
  createdAt: number;       // ms since epoch
  updatedAt: number;       // ms since epoch
}): Promise<Domain[]> {
  const now = Date.now();
  const domains = await loadDomainsRaw();

  const newDomain: Domain = {
    chainId: input.chainId,
    name: input.name,
    entryPoint: input.entryPoint,
    paymaster: input.paymaster,
    bundler: input.bundler,
    rpcUrl: input.rpcUrl,
    transactionUrl: input.transactionUrl,
    createdAt: now,
    updatedAt: now,
  };

  const updated = [...domains, newDomain];
  await saveDomainsRaw(updated);
  return updated;
}

export async function updateDomain(
  name: string,
  patch: Partial<Omit<Domain, "name" | "chainId" | "entryPoint" | "createdAt">>
): Promise<Domain[]> {
  const domains = await loadDomainsRaw();
  const now = Date.now();
  const updated = domains.map(c =>
    c.name === name
      ? {
          ...c,
          ...patch,
          updatedAt: now,
        }
      : c
  );

  await saveDomainsRaw(updated);
  return updated;
}

export async function deleteDomain(name: string): Promise<Domain[]> {
  const folios = await loadDomainsRaw();
  const updated = folios.filter(c => c.name !== name);
  await saveDomainsRaw(updated);
  return updated;
}

export async function clearDomains(): Promise<void> {
  await saveDomainsRaw([]);
}
