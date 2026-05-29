// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock useRecovery so useRecoveryList gets a controlled data set
// ---------------------------------------------------------------------------

const { mockUseRecovery } = vi.hoisted(() => ({ mockUseRecovery: vi.fn() }));

vi.mock("@/hooks/useRecovery", () => ({ useRecovery: mockUseRecovery }));

import { useRecoveryList } from "../useRecoveryList";

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const ALPHA = {
  id: "r1",
  name: "Alpha",
  chainId: 1,
  status: true,
  consumed: false,
  threshold: 2,
  participants: ["0xA", "0xB"],
  createdAt: 300,
  updatedAt: 300,
  recoverableAddress: "0xRec1",
};

const BETA = {
  id: "r2",
  name: "Beta",
  chainId: 11155111,
  status: false,
  consumed: false,
  threshold: 1,
  participants: ["0xC"],
  createdAt: 100,
  updatedAt: 100,
  recoverableAddress: "0xRec2",
};

const GAMMA = {
  id: "r3",
  name: "Gamma",
  chainId: 1,
  status: true,
  consumed: false,
  threshold: 3,
  participants: ["0xD", "0xE", "0xF"],
  createdAt: 200,
  updatedAt: 200,
  recoverableAddress: "0xRec3",
};

const DELTA = {
  id: "r4",
  name: "Delta",
  chainId: 1,
  status: false,
  consumed: true,
  threshold: 1,
  participants: ["0xG"],
  createdAt: 50,
  updatedAt: 50,
  recoverableAddress: "0xRec4",
};

const baseResult = {
  loading: false,
  error: null,
  addRecovery: vi.fn(),
  updateRecovery: vi.fn(),
  deleteRecovery: vi.fn(),
  clearRecoveries: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRecovery.mockReturnValue({
    ...baseResult,
    recoveries: [ALPHA, BETA, GAMMA],
  });
});

// ---------------------------------------------------------------------------

describe("useRecoveryList — no filters", () => {
  it("returns all recoveries when no options provided", () => {
    const { result } = renderHook(() => useRecoveryList());
    expect(result.current.recoveries).toHaveLength(3);
  });
});

describe("useRecoveryList — query filter", () => {
  it("filters by name (case-insensitive)", () => {
    const { result } = renderHook(() => useRecoveryList({ query: "alpha" }));
    expect(result.current.recoveries).toHaveLength(1);
    expect(result.current.recoveries[0].id).toBe("r1");
  });

  it("filters by partial name match", () => {
    const { result } = renderHook(() => useRecoveryList({ query: "et" }));
    // matches "Beta"
    expect(result.current.recoveries).toHaveLength(1);
    expect(result.current.recoveries[0].id).toBe("r2");
  });

  it("returns empty when query matches nothing", () => {
    const { result } = renderHook(() => useRecoveryList({ query: "zzznomatch" }));
    expect(result.current.recoveries).toHaveLength(0);
  });

  it("ignores leading/trailing whitespace in query", () => {
    const { result } = renderHook(() => useRecoveryList({ query: "  Gamma  " }));
    expect(result.current.recoveries).toHaveLength(1);
    expect(result.current.recoveries[0].id).toBe("r3");
  });
});

describe("useRecoveryList — chainId filter", () => {
  it("filters by chainId", () => {
    const { result } = renderHook(() => useRecoveryList({ chainId: 1 }));
    // ALPHA and GAMMA are on chainId 1
    expect(result.current.recoveries).toHaveLength(2);
    expect(result.current.recoveries.map(r => r.id)).toContain("r1");
    expect(result.current.recoveries.map(r => r.id)).toContain("r3");
  });

  it("chainId 0 shows all", () => {
    const { result } = renderHook(() => useRecoveryList({ chainId: 0 }));
    expect(result.current.recoveries).toHaveLength(3);
  });

  it("chainId that matches no record returns empty", () => {
    const { result } = renderHook(() => useRecoveryList({ chainId: 9999 }));
    expect(result.current.recoveries).toHaveLength(0);
  });
});

describe("useRecoveryList — status filter", () => {
  it('status "enabled" shows only enabled, non-consumed recoveries', () => {
    const { result } = renderHook(() => useRecoveryList({ status: "enabled" }));
    // ALPHA and GAMMA are enabled and not consumed
    expect(result.current.recoveries).toHaveLength(2);
    expect(result.current.recoveries.every(r => r.status === true && !r.consumed)).toBe(true);
  });

  it('status "disabled" shows only disabled, non-consumed recoveries', () => {
    const { result } = renderHook(() => useRecoveryList({ status: "disabled" }));
    // BETA is disabled and not consumed
    expect(result.current.recoveries).toHaveLength(1);
    expect(result.current.recoveries[0].id).toBe("r2");
  });

  it('empty status string shows all', () => {
    const { result } = renderHook(() => useRecoveryList({ status: "" }));
    expect(result.current.recoveries).toHaveLength(3);
  });
});

describe("useRecoveryList — consumed status filter", () => {
  beforeEach(() => {
    mockUseRecovery.mockReturnValue({
      ...baseResult,
      recoveries: [ALPHA, BETA, GAMMA, DELTA],
    });
  });

  it('status "consumed" returns only consumed recoveries', () => {
    const { result } = renderHook(() => useRecoveryList({ status: "consumed" }));
    expect(result.current.recoveries).toHaveLength(1);
    expect(result.current.recoveries[0].id).toBe("r4");
  });

  it('status "enabled" excludes consumed items even when status is true', () => {
    // Add a consumed item that also has status: true to ensure the filter works
    const consumedEnabled = { ...ALPHA, id: "r5", name: "Epsilon", consumed: true, status: true };
    mockUseRecovery.mockReturnValue({
      ...baseResult,
      recoveries: [ALPHA, BETA, GAMMA, DELTA, consumedEnabled],
    });
    const { result } = renderHook(() => useRecoveryList({ status: "enabled" }));
    expect(result.current.recoveries.every(r => !r.consumed)).toBe(true);
    expect(result.current.recoveries.map(r => r.id)).not.toContain("r5");
  });

  it('status "disabled" excludes consumed items even when status is false', () => {
    // DELTA is consumed and status: false — must not appear under "disabled"
    const { result } = renderHook(() => useRecoveryList({ status: "disabled" }));
    expect(result.current.recoveries.map(r => r.id)).not.toContain("r4");
  });

  it('empty status shows all including consumed', () => {
    const { result } = renderHook(() => useRecoveryList({ status: "" }));
    expect(result.current.recoveries).toHaveLength(4);
  });
});

describe("useRecoveryList — combined filters", () => {
  it("applies query and chainId together", () => {
    const { result } = renderHook(() =>
      useRecoveryList({ query: "alpha", chainId: 1 })
    );
    expect(result.current.recoveries).toHaveLength(1);
    expect(result.current.recoveries[0].id).toBe("r1");
  });

  it("applies chainId and status together", () => {
    const { result } = renderHook(() =>
      useRecoveryList({ chainId: 1, status: "enabled" })
    );
    // ALPHA and GAMMA match both
    expect(result.current.recoveries).toHaveLength(2);
  });

  it("returns empty when combined filters match nothing", () => {
    const { result } = renderHook(() =>
      useRecoveryList({ chainId: 11155111, status: "enabled" })
    );
    // BETA is on 11155111 but disabled
    expect(result.current.recoveries).toHaveLength(0);
  });
});

describe("useRecoveryList — sorting", () => {
  it("default sort is nameAsc", () => {
    const { result } = renderHook(() => useRecoveryList());
    const names = result.current.recoveries.map(r => r.name);
    expect(names).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("nameDesc sorts Z → A", () => {
    const { result } = renderHook(() => useRecoveryList({ sortMode: "nameDesc" }));
    const names = result.current.recoveries.map(r => r.name);
    expect(names).toEqual(["Gamma", "Beta", "Alpha"]);
  });

  it("createdAsc sorts oldest first", () => {
    const { result } = renderHook(() => useRecoveryList({ sortMode: "createdAsc" }));
    expect(result.current.recoveries[0].createdAt).toBe(100);
    expect(result.current.recoveries[2].createdAt).toBe(300);
  });

  it("createdDesc sorts newest first", () => {
    const { result } = renderHook(() => useRecoveryList({ sortMode: "createdDesc" }));
    expect(result.current.recoveries[0].createdAt).toBe(300);
    expect(result.current.recoveries[2].createdAt).toBe(100);
  });

  it("thresholdAsc sorts lowest threshold first", () => {
    const { result } = renderHook(() => useRecoveryList({ sortMode: "thresholdAsc" }));
    expect(result.current.recoveries[0].threshold).toBe(1);
    expect(result.current.recoveries[2].threshold).toBe(3);
  });

  it("thresholdDesc sorts highest threshold first", () => {
    const { result } = renderHook(() => useRecoveryList({ sortMode: "thresholdDesc" }));
    expect(result.current.recoveries[0].threshold).toBe(3);
    expect(result.current.recoveries[2].threshold).toBe(1);
  });

  it("chainIdAsc sorts lowest chainId first", () => {
    const { result } = renderHook(() => useRecoveryList({ sortMode: "chainIdAsc" }));
    expect(result.current.recoveries[0].chainId).toBe(1);
    expect(result.current.recoveries[2].chainId).toBe(11155111);
  });

  it("chainIdDesc sorts highest chainId first", () => {
    const { result } = renderHook(() => useRecoveryList({ sortMode: "chainIdDesc" }));
    expect(result.current.recoveries[0].chainId).toBe(11155111);
  });
});

describe("useRecoveryList — passthrough", () => {
  it("passes through loading state", () => {
    mockUseRecovery.mockReturnValue({ ...baseResult, recoveries: [], loading: true });
    const { result } = renderHook(() => useRecoveryList());
    expect(result.current.loading).toBe(true);
  });

  it("passes through error state", () => {
    mockUseRecovery.mockReturnValue({ ...baseResult, recoveries: [], error: "oops" });
    const { result } = renderHook(() => useRecoveryList());
    expect(result.current.error).toBe("oops");
  });

  it("exposes CRUD functions from underlying hook", () => {
    const { result } = renderHook(() => useRecoveryList());
    expect(result.current.addRecovery).toBe(baseResult.addRecovery);
    expect(result.current.updateRecovery).toBe(baseResult.updateRecovery);
    expect(result.current.deleteRecovery).toBe(baseResult.deleteRecovery);
    expect(result.current.clearRecoveries).toBe(baseResult.clearRecoveries);
  });
});
