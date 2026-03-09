// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock useAddress so useAddressList gets a controlled list
// ---------------------------------------------------------------------------

const { mockUseAddress } = vi.hoisted(() => ({ mockUseAddress: vi.fn() }));

vi.mock("@/hooks/useAddresses", () => ({ useAddress: mockUseAddress }));

import { useAddressList } from "../useAddressList";

const A = { id: "a1", name: "Alice",   createdAt: 100, indexOrder: 2, group: ["work"] };
const B = { id: "a2", name: "Bob",     createdAt: 200, indexOrder: 0, group: ["home"] };
const C = { id: "a3", name: "Charlie", createdAt: 50,  indexOrder: 1, group: ["work", "home"] };

const baseResult = {
  loading: false, error: null,
  addAddress: vi.fn(), updateAddress: vi.fn(),
  deleteAddress: vi.fn(), clearAddress: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAddress.mockReturnValue({ ...baseResult, address: [A, B, C] });
});

// ---------------------------------------------------------------------------

describe("useAddressList — filtering", () => {
  it("returns all addresses when no filters", () => {
    const { result } = renderHook(() => useAddressList());
    expect(result.current.address).toHaveLength(3);
  });

  it("filters by query (name match)", () => {
    const { result } = renderHook(() => useAddressList({ query: "alice" }));
    expect(result.current.address).toHaveLength(1);
    expect(result.current.address[0].name).toBe("Alice");
  });

  it("returns empty when query matches nothing", () => {
    const { result } = renderHook(() => useAddressList({ query: "zzz" }));
    expect(result.current.address).toHaveLength(0);
  });

  it("filters by tags (any mode)", () => {
    const { result } = renderHook(() =>
      useAddressList({ tags: ["work"], tagMode: "any" })
    );
    // Alice and Charlie have "work"
    expect(result.current.address).toHaveLength(2);
  });

  it("filters by tags (all mode — must have every tag)", () => {
    const { result } = renderHook(() =>
      useAddressList({ tags: ["work", "home"], tagMode: "all" })
    );
    // Only Charlie has both "work" and "home"
    expect(result.current.address).toHaveLength(1);
    expect(result.current.address[0].name).toBe("Charlie");
  });
});

describe("useAddressList — sorting", () => {
  it("default sort is createdAsc", () => {
    const { result } = renderHook(() => useAddressList());
    expect(result.current.address.map(a => a.createdAt)).toEqual([50, 100, 200]);
  });

  it("sorts by nameAsc", () => {
    const { result } = renderHook(() => useAddressList({ sortMode: "nameAsc" }));
    expect(result.current.address.map(a => a.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts by nameDesc", () => {
    const { result } = renderHook(() => useAddressList({ sortMode: "nameDesc" }));
    expect(result.current.address[0].name).toBe("Charlie");
  });

  it("sorts by custom (indexOrder)", () => {
    const { result } = renderHook(() => useAddressList({ sortMode: "custom" }));
    expect(result.current.address.map(a => a.indexOrder)).toEqual([0, 1, 2]);
  });
});

describe("useAddressList — passthrough", () => {
  it("passes through loading and error", () => {
    mockUseAddress.mockReturnValue({ ...baseResult, address: [], loading: true, error: "err" });
    const { result } = renderHook(() => useAddressList());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe("err");
  });
});
