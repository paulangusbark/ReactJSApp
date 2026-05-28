import { get, set } from "idb-keyval";
import { getCurrentUser } from "./currentUser";
import { FalconLevel } from "./keyStore";
import { Paymaster } from "./folioStore";
import { BundlerAPI, BundlerDomain } from "@/lib/submitTransaction";
// --- Schema versioning -------------------------------------------------------

function domainKey() { return `cointrol:domains:v1:${getCurrentUser()}`; }
function domainSchemaVersionKey() { return `cointrol:domains:schemaVersion:${getCurrentUser()}`; }
const CURRENT_DOMAIN_SCHEMA_VERSION = 5;

export type Domain = {
  name: string;           // label for the domain
  chainId: number;        // blockchain network ID
  entryPoint: string;     // entrypoint contract address
  falconDomain: FalconDomain[]; // falcon domain parameters
  paymaster?: Paymaster[];      // paymasters
  bundler: string;        // bundler address
  rpcUrl: string;         // rpc url used locally by app
  transactionUrl: string; // etherscan url for tx (or equivalent)
  createdAt: number;      // ms since epoch
  updatedAt: number;      // ms since epoch
}

export type FalconDomain = {
  factory: string;
  falcon: string;
  falconLevel: FalconLevel;
  initCodeHash: string;
}


// --- In-memory subscribers for live updates ---------------------------------

type domainListener = (domain: Domain[]) => void;
const listeners = new Set<domainListener>();

function notifyDomainsUpdated(domain: Domain[]) {
  const allDomains = [...domain];
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
  const v = await get<number | undefined>(domainSchemaVersionKey());
  // Default to v1 (not current) so that all migrations run on first load,
  // including for existing installs where the version key was never written.
  if (!v) return 1;
  return v;
}

async function setDomainsSchemaVersion(v: number): Promise<void> {
  await set(domainSchemaVersionKey(), v);
}

async function ensureDomainSchemaMigrated(): Promise<void> {
  let storedVersion = await getDomainsSchemaVersion();

  if (storedVersion === CURRENT_DOMAIN_SCHEMA_VERSION) {
    return;
  }

  let domains = await get<any[] | undefined>(domainKey());
  if (!domains) domains = [];

  if (storedVersion < 2) {
    // v1 → v2: add factory, falcon, accountType fields to existing user-added domains.
    const migrated = domains.map((d: any) => ({
      ...d,
      factory: d.factory ?? "",
      falcon:  d.falcon  ?? "",
      accountType: d.accountType ?? "falcon512",
    }));
    await set(domainKey(), migrated);
    storedVersion = 2;
  }

  if (storedVersion < 3) {
    // v2 → v3: replace accountType string with falconLevel number.
    const migrated = domains.map((d: any) => {
      const { accountType, ...rest } = d;
      const falconLevel: FalconLevel = accountType === "falcon1024" ? 1024 : 512;
      return { ...rest, falconLevel };
    });
    await set(domainKey(), migrated);
    storedVersion = 3;
  }

  if (storedVersion < 4) {
    // v3 → v4: add creationCode to each FalconDomain entry.
    const migrated = domains.map((d: any) => ({
      ...d,
      falconDomain: (d.falconDomain ?? []).map((fd: any) => ({
        ...fd,
        creationCode: fd.creationCode ?? "",
      })),
    }));
    await set(domainKey(), migrated);
    storedVersion = 4;
  }

  if (storedVersion < 5) {
    // v4 → v5: rename creationCode → initCodeHash on each FalconDomain entry.
    // initCodeHash = keccak256(creationCode ++ abi.encode(recoverableFactory));
    // existing entries had raw bytecode which was also incorrect, so reset to "".
    const migrated = domains.map((d: any) => ({
      ...d,
      falconDomain: (d.falconDomain ?? []).map((fd: any) => {
        const { creationCode: _, ...rest } = fd;
        return { ...rest, initCodeHash: "" };
      }),
    }));
    await set(domainKey(), migrated);
    await setDomainsSchemaVersion(5);
  }
}

// --- Core load/save helpers --------------------------------------------------

async function loadDomainsRaw(): Promise<Domain[]> {
  await ensureDomainSchemaMigrated();
  const domains = await get<Domain[] | undefined>(domainKey());
  return domains ?? [];
}

async function saveDomainsRaw(domains: Domain[]): Promise<void> {
  await set(domainKey(), domains);
  notifyDomainsUpdated(domains);
}

// --- Public API --------------------------------------------------------------

export async function getAllDomains(): Promise<Domain[]> {
  return loadDomainsRaw();
}

export async function addDomain(input: {
  name: string;
  chainId: number;
  entryPoint: string;
  falconDomain: FalconDomain[];
  paymaster?: Paymaster[];
  bundler: string;
  rpcUrl: string;
  transactionUrl: string;
}): Promise<Domain[]> {
  const now = Date.now();
  const domains = await loadDomainsRaw();

  const newDomain: Domain = {
    chainId:      input.chainId,
    name:         input.name,
    entryPoint:   input.entryPoint,
    falconDomain:    input.falconDomain,
    paymaster:    input.paymaster,
    bundler:      input.bundler,
    rpcUrl:       input.rpcUrl,
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
  const domains = await loadDomainsRaw();
  const updated = domains.filter(d => d.name !== name);
  await saveDomainsRaw(updated);
  return updated;
}

export async function clearDomains(): Promise<void> {
  await saveDomainsRaw([]);
}

// --- Bundler sync ------------------------------------------------------------

function bundlerDomainToLocal(bd: BundlerDomain): Domain {
  return {
    name: bd.name,
    chainId: bd.chainId,
    entryPoint: bd.entryPoint,
    falconDomain: bd.falconDomain.map(fd => ({
      factory: fd.factory,
      falcon: fd.falcon,
      falconLevel: Number(fd.falconLevel) as FalconLevel,
      initCodeHash: fd.initCodeHash,
    })),
    paymaster: bd.paymaster.map(p => ({
      address: p.address,
      name: p.name,
      chainId: p.chainId,
      type: p.type,
      bundler: p.bundler,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
    bundler: bd.bundler,
    rpcUrl: bd.rpcUrl,
    transactionUrl: bd.transactionUrl,
    createdAt: bd.createdAt,
    updatedAt: bd.updatedAt,
  };
}

/**
 * Fetch all domains from the bundler and merge into local storage.
 * Existing local domains matched by name are updated; new ones are added.
 * Local-only domains (not on the server) are preserved.
 * Errors are caught silently — BUILTIN_DOMAINS serve as fallback.
 */
export async function syncDomainsFromBundler(): Promise<void> {
  try {
    const resp = await BundlerAPI.getAllDomains();
    if (!resp.success || !resp.data) return;

    const remoteDomains = resp.data.map(bundlerDomainToLocal);
    const locals = await loadDomainsRaw();

    const merged: Domain[] = [...locals];
    for (const remote of remoteDomains) {
      const idx = merged.findIndex(l => l.name === remote.name);
      if (idx >= 0) {
        merged[idx] = { ...merged[idx], ...remote };
      } else {
        merged.push(remote);
      }
    }

    await saveDomainsRaw(merged);
  } catch (err) {
    console.warn("[Domains] Bundler sync failed, using local domains:", err);
  }
}
