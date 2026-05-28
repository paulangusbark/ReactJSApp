import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setCurrentUser } from "../currentUser";

// ---------------------------------------------------------------------------
// In-memory idb-keyval mock
// ---------------------------------------------------------------------------

const { idbStore } = vi.hoisted(() => ({ idbStore: new Map<string, unknown>() }));

vi.mock("idb-keyval", () => ({
  get: vi.fn((k: string) => Promise.resolve(idbStore.get(k))),
  set: vi.fn((k: string, v: unknown) => { idbStore.set(k, v); return Promise.resolve(); }),
  del: vi.fn((k: string) => { idbStore.delete(k); return Promise.resolve(); }),
}));

import {
  getAllDomains,
  addDomain,
  updateDomain,
  deleteDomain,
  clearDomains,
} from "../domainStore";

const BASE_DOMAIN = {
  name: "MY TESTNET",
  chainId: 31337,
  entryPoint: "0xentrypoint",
  falconDomain: [{ factory: "0xfactory", falcon: "0xfalcon", falconLevel: 512 as const, initCodeHash: "" }],
  bundler: "0xbundler",
  rpcUrl: "http://localhost:8545",
  transactionUrl: "http://localhost/tx/",
  createdAt: 0,
  updatedAt: 0,
} as const;

beforeEach(() => {
  idbStore.clear();
  setCurrentUser("test-uid");
});

afterEach(() => {
  setCurrentUser(null);
});

// ---------------------------------------------------------------------------

describe("getAllDomains", () => {
  it("returns an empty array when no domains are stored", async () => {
    const domains = await getAllDomains();
    expect(domains).toHaveLength(0);
  });

  it("returns stored domains", async () => {
    await addDomain(BASE_DOMAIN);
    const domains = await getAllDomains();
    expect(domains.some(d => d.name === "MY TESTNET")).toBe(true);
  });
});

describe("addDomain", () => {
  it("creates a user domain with correct fields", async () => {
    await addDomain(BASE_DOMAIN);

    const all = await getAllDomains();
    const mine = all.find(d => d.name === "MY TESTNET")!;
    expect(mine).toBeDefined();
    expect(mine.chainId).toBe(31337);
    expect(mine.rpcUrl).toBe("http://localhost:8545");
  });

  it("timestamps are set from Date.now(), ignoring input values", async () => {
    const result = await addDomain(BASE_DOMAIN);
    const mine = result.find(d => d.name === "MY TESTNET")!;
    expect(mine.createdAt).toBeGreaterThan(0);
    expect(mine.updatedAt).toBeGreaterThan(0);
  });

  it("appends a second domain without removing the first", async () => {
    await addDomain(BASE_DOMAIN);
    const result = await addDomain({ ...BASE_DOMAIN, name: "SECOND NET", chainId: 99 });
    expect(result).toHaveLength(2);
  });
});

describe("updateDomain", () => {
  it("patches the matching domain by name and updates updatedAt", async () => {
    const added = await addDomain(BASE_DOMAIN);
    const before = added.find(d => d.name === "MY TESTNET")!.updatedAt;

    await new Promise(r => setTimeout(r, 2));
    const result = await updateDomain("MY TESTNET", { rpcUrl: "http://localhost:9999" });

    const updated = result.find(d => d.name === "MY TESTNET")!;
    expect(updated.rpcUrl).toBe("http://localhost:9999");
    expect(updated.updatedAt).toBeGreaterThan(before);
  });

  it("leaves other domains unchanged", async () => {
    await addDomain(BASE_DOMAIN);
    await addDomain({ ...BASE_DOMAIN, name: "SECOND NET", chainId: 99 });

    await updateDomain("MY TESTNET", { rpcUrl: "http://new" });
    const all = await getAllDomains();
    expect(all.find(d => d.name === "SECOND NET")?.rpcUrl).toBe("http://localhost:8545");
  });
});

describe("deleteDomain", () => {
  it("removes a user domain by name", async () => {
    await addDomain(BASE_DOMAIN);
    const result = await deleteDomain("MY TESTNET");
    expect(result.some(d => d.name === "MY TESTNET")).toBe(false);
  });

  it("leaves other domains intact when deleting one", async () => {
    await addDomain(BASE_DOMAIN);
    await addDomain({ ...BASE_DOMAIN, name: "SECOND NET", chainId: 99 });
    const result = await deleteDomain("MY TESTNET");
    expect(result.some(d => d.name === "SECOND NET")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("is a no-op when the named domain does not exist", async () => {
    await addDomain(BASE_DOMAIN);
    const result = await deleteDomain("NONEXISTENT");
    expect(result).toHaveLength(1);
    expect(result.some(d => d.name === "MY TESTNET")).toBe(true);
  });
});

describe("clearDomains", () => {
  it("removes all user domains", async () => {
    await addDomain(BASE_DOMAIN);
    await clearDomains();

    const domains = await getAllDomains();
    expect(domains).toHaveLength(0);
  });
});
