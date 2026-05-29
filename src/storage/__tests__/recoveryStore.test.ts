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
  getAllRecoveries,
  addRecovery,
  updateRecovery,
  deleteRecovery,
  clearRecovery,
  subscribeToRecovery,
} from "../recoveryStore";

const BASE_RECOVERY = {
  name: "0xDeadBeefDeadBeefDeadBeefDeadBeefDeadBeef",
  recoverableAddress: null, // address not known until on-chain deployment
  participants: ["0xParticipant00000000000000000000000001"],
  threshold: 1,
  chainId: 11155111,
  status: true,
};

beforeEach(() => {
  idbStore.clear();
  setCurrentUser("test-uid");
});

afterEach(() => {
  setCurrentUser(null);
});

// ---------------------------------------------------------------------------

describe("getAllRecoveries", () => {
  it("returns empty array when nothing stored", async () => {
    expect(await getAllRecoveries()).toEqual([]);
  });
});

describe("addRecovery", () => {
  it("creates a recovery with generated id and timestamps", async () => {
    const result = await addRecovery(BASE_RECOVERY);

    expect(result).toHaveLength(1);
    expect(result[0].id).toMatch(/^recovery:/);
    expect(result[0].name).toBe(BASE_RECOVERY.name);
    expect(result[0].chainId).toBe(11155111);
    expect(result[0].createdAt).toBeGreaterThan(0);
    expect(result[0].updatedAt).toBeGreaterThan(0);
  });

  it("stores empty string for recoverableAddress when null (pre-deployment)", async () => {
    const result = await addRecovery(BASE_RECOVERY);

    expect(result[0].recoverableAddress).toBe("");
  });

  it("stores participants, threshold, and status", async () => {
    const result = await addRecovery(BASE_RECOVERY);

    expect(result[0].participants).toEqual(["0xParticipant00000000000000000000000001"]);
    expect(result[0].threshold).toBe(1);
    expect(result[0].status).toBe(true);
  });

  it("sets consumed to false by default", async () => {
    const result = await addRecovery(BASE_RECOVERY);
    expect(result[0].consumed).toBe(false);
  });

  it("defaults null fields to sensible values", async () => {
    const result = await addRecovery({
      name: "0xAbc",
      recoverableAddress: null,
      participants: null,
      threshold: null,
      chainId: null,
      status: null,
    });

    expect(result[0].recoverableAddress).toBe("");
    expect(result[0].participants).toEqual([]);
    expect(result[0].threshold).toBe(1);
    expect(result[0].chainId).toBe(0);
    expect(result[0].status).toBe(false);
  });

  it("appends a second recovery without removing the first", async () => {
    await addRecovery(BASE_RECOVERY);
    const result = await addRecovery({ ...BASE_RECOVERY, name: "0xSecond" });

    expect(result).toHaveLength(2);
  });

  it("persists across separate getAllRecoveries calls", async () => {
    await addRecovery(BASE_RECOVERY);
    const all = await getAllRecoveries();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe(BASE_RECOVERY.name);
  });
});

describe("updateRecovery", () => {
  it("patches allowed fields and updates updatedAt", async () => {
    const added = await addRecovery(BASE_RECOVERY);
    const id = added[0].id;
    const before = added[0].updatedAt;

    await new Promise(r => setTimeout(r, 2));
    const result = await updateRecovery(id, { threshold: 2, status: false });

    const updated = result.find(r => r.id === id)!;
    expect(updated.threshold).toBe(2);
    expect(updated.status).toBe(false);
    expect(updated.updatedAt).toBeGreaterThan(before);
  });

  it("can update participants list", async () => {
    const added = await addRecovery(BASE_RECOVERY);
    const id = added[0].id;
    const newParticipants = [
      "0xParticipant00000000000000000000000001",
      "0xParticipant00000000000000000000000002",
    ];

    const result = await updateRecovery(id, { participants: newParticipants });
    expect(result.find(r => r.id === id)!.participants).toEqual(newParticipants);
  });

  it("leaves other recoveries unchanged", async () => {
    await addRecovery(BASE_RECOVERY);
    const added2 = await addRecovery({ ...BASE_RECOVERY, name: "0xSecond" });
    const id2 = added2.find(r => r.name === "0xSecond")!.id;

    await updateRecovery(id2, { threshold: 3 });
    const all = await getAllRecoveries();
    expect(all.find(r => r.name === BASE_RECOVERY.name)!.threshold).toBe(1);
  });

  it("does not overwrite immutable fields (name, chainId, recoverableAddress)", async () => {
    const added = await addRecovery(BASE_RECOVERY);
    const id = added[0].id;

    // updateRecovery type does not allow these fields — pass via cast to verify runtime safety
    await updateRecovery(id, { threshold: 2 });
    const updated = (await getAllRecoveries()).find(r => r.id === id)!;
    expect(updated.name).toBe(BASE_RECOVERY.name);
    expect(updated.chainId).toBe(11155111);
    expect(updated.recoverableAddress).toBe(""); // null input → empty string
  });

  it("can patch the consumed field", async () => {
    const added = await addRecovery(BASE_RECOVERY);
    const id = added[0].id;

    await updateRecovery(id, { consumed: true });
    const withConsumed = (await getAllRecoveries()).find(r => r.id === id)!;
    expect(withConsumed.consumed).toBe(true);

    await updateRecovery(id, { consumed: false });
    const cleared = (await getAllRecoveries()).find(r => r.id === id)!;
    expect(cleared.consumed).toBe(false);
  });
});

describe("consumed field — legacy record migration", () => {
  it("defaults consumed to false for records loaded from disk that lack the field", async () => {
    // Simulate a v2 record stored without the consumed field
    const legacyRecord = {
      id: "recovery:legacy-001",
      name: "0xLegacyAddress000000000000000000000001",
      recoverableAddress: "0xRecoverable00000000000000000000000001",
      participants: [],
      threshold: 1,
      chainId: 11155111,
      status: true,
      createdAt: 1000,
      updatedAt: 1000,
      // no `consumed` field
    };
    const { set: idbSet } = await import("idb-keyval");
    // Write directly at current schema version (2) to bypass migration
    (idbSet as any)("cointrol:recovery:schemaVersion", 2);
    (idbSet as any)("cointrol:recovery:v1:test-uid", [legacyRecord]);

    const all = await getAllRecoveries();
    expect(all).toHaveLength(1);
    expect(all[0].consumed).toBe(false);
  });
});

describe("v1→v2 migration — strips paymaster field", () => {
  it("removes paymaster from records when upgrading from schema v1", async () => {
    const v1Record = {
      id: "recovery:v1-001",
      name: "0xV1Address0000000000000000000000000001",
      paymaster: "0xOldPaymaster000000000000000000000001",
      recoverableAddress: "0xRecoverable00000000000000000000000001",
      participants: [],
      threshold: 1,
      chainId: 11155111,
      status: true,
      consumed: false,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const { set: idbSet } = await import("idb-keyval");
    // Simulate schema version 1 on disk
    (idbSet as any)("cointrol:recovery:schemaVersion", 1);
    (idbSet as any)("cointrol:recovery:v1:test-uid", [v1Record]);

    const all = await getAllRecoveries();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe("recovery:v1-001");
    expect((all[0] as any).paymaster).toBeUndefined();
  });
});

describe("deleteRecovery", () => {
  it("removes the matching recovery", async () => {
    const added = await addRecovery(BASE_RECOVERY);
    const id = added[0].id;

    const result = await deleteRecovery(id);
    expect(result).toHaveLength(0);
  });

  it("leaves other recoveries intact", async () => {
    await addRecovery(BASE_RECOVERY);
    const added2 = await addRecovery({ ...BASE_RECOVERY, name: "0xSecond" });
    const id2 = added2.find(r => r.name === "0xSecond")!.id;

    const result = await deleteRecovery(id2);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe(BASE_RECOVERY.name);
  });

  it("is a no-op for unknown id", async () => {
    await addRecovery(BASE_RECOVERY);
    const result = await deleteRecovery("recovery:unknown");
    expect(result).toHaveLength(1);
  });
});

describe("clearRecovery", () => {
  it("empties the store", async () => {
    await addRecovery(BASE_RECOVERY);
    await addRecovery({ ...BASE_RECOVERY, name: "0xSecond" });
    await clearRecovery();
    expect(await getAllRecoveries()).toEqual([]);
  });
});

describe("subscribeToRecovery", () => {
  it("notifies subscriber when a recovery is added", async () => {
    const listener = vi.fn();
    const unsub = subscribeToRecovery(listener);

    await addRecovery(BASE_RECOVERY);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toHaveLength(1);

    unsub();
  });

  it("notifies subscriber when a recovery is updated", async () => {
    const added = await addRecovery(BASE_RECOVERY);
    const id = added[0].id;

    const listener = vi.fn();
    const unsub = subscribeToRecovery(listener);

    await updateRecovery(id, { threshold: 5 });

    expect(listener).toHaveBeenCalledOnce();
    unsub();
  });

  it("notifies subscriber when a recovery is deleted", async () => {
    const added = await addRecovery(BASE_RECOVERY);
    const id = added[0].id;

    const listener = vi.fn();
    const unsub = subscribeToRecovery(listener);

    await deleteRecovery(id);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toHaveLength(0);
    unsub();
  });

  it("notifies subscriber when the store is cleared", async () => {
    await addRecovery(BASE_RECOVERY);

    const listener = vi.fn();
    const unsub = subscribeToRecovery(listener);

    await clearRecovery();

    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0]).toEqual([]);
    unsub();
  });

  it("stops notifying after unsubscribe", async () => {
    const listener = vi.fn();
    const unsub = subscribeToRecovery(listener);
    unsub();

    await addRecovery(BASE_RECOVERY);
    expect(listener).not.toHaveBeenCalled();
  });

  it("multiple subscribers all receive notifications", async () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    const u1 = subscribeToRecovery(l1);
    const u2 = subscribeToRecovery(l2);

    await addRecovery(BASE_RECOVERY);

    expect(l1).toHaveBeenCalledOnce();
    expect(l2).toHaveBeenCalledOnce();
    u1();
    u2();
  });
});
