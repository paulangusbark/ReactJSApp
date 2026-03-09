// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ---------------------------------------------------------------------------

const { mockUseContacts } = vi.hoisted(() => ({ mockUseContacts: vi.fn() }));

vi.mock("@/hooks/useContacts", () => ({ useContacts: mockUseContacts }));

import { useContactsList } from "../useContactList";

const ALICE   = { id: "c1", name: "Alice",   surname: "Smith",  createdAt: 100, tags: ["vip"]            };
const BOB     = { id: "c2", name: "Bob",      surname: "Jones",  createdAt: 200, tags: ["customer"]       };
const CHARLIE = { id: "c3", name: "Charlie",  surname: undefined, createdAt: 50, tags: ["vip", "customer"] };

const baseResult = {
  loading: false, error: null,
  addContact: vi.fn(), updateContact: vi.fn(),
  deleteContact: vi.fn(), clearContacts: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseContacts.mockReturnValue({ ...baseResult, contacts: [ALICE, BOB, CHARLIE] });
});

// ---------------------------------------------------------------------------

describe("useContactsList — filtering", () => {
  it("returns all contacts when no filters", () => {
    const { result } = renderHook(() => useContactsList());
    expect(result.current.contacts).toHaveLength(3);
  });

  it("filters by query matching first name", () => {
    const { result } = renderHook(() => useContactsList({ query: "alice" }));
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].name).toBe("Alice");
  });

  it("filters by query matching surname", () => {
    const { result } = renderHook(() => useContactsList({ query: "jones" }));
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].name).toBe("Bob");
  });

  it("filters by tags (any)", () => {
    const { result } = renderHook(() =>
      useContactsList({ tags: ["vip"], tagMode: "any" })
    );
    // Alice and Charlie have "vip"
    expect(result.current.contacts).toHaveLength(2);
  });

  it("filters by tags (all — must have every tag)", () => {
    const { result } = renderHook(() =>
      useContactsList({ tags: ["vip", "customer"], tagMode: "all" })
    );
    // Only Charlie has both
    expect(result.current.contacts).toHaveLength(1);
    expect(result.current.contacts[0].name).toBe("Charlie");
  });

  it("returns empty when query matches nothing", () => {
    const { result } = renderHook(() => useContactsList({ query: "zzz" }));
    expect(result.current.contacts).toHaveLength(0);
  });
});

describe("useContactsList — sorting", () => {
  it("default sort is nameAsc", () => {
    const { result } = renderHook(() => useContactsList());
    expect(result.current.contacts.map(c => c.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("sorts by nameDesc", () => {
    const { result } = renderHook(() => useContactsList({ sortMode: "nameDesc" }));
    expect(result.current.contacts[0].name).toBe("Charlie");
  });

  it("sorts by createdDesc", () => {
    const { result } = renderHook(() => useContactsList({ sortMode: "createdDesc" }));
    expect(result.current.contacts[0].createdAt).toBe(200);
  });

  it("sorts by createdAsc", () => {
    const { result } = renderHook(() => useContactsList({ sortMode: "createdAsc" }));
    expect(result.current.contacts[0].createdAt).toBe(50);
  });
});

describe("useContactsList — passthrough", () => {
  it("passes through loading and error", () => {
    mockUseContacts.mockReturnValue({ ...baseResult, contacts: [], loading: true, error: "oops" });
    const { result } = renderHook(() => useContactsList());
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBe("oops");
  });
});
