// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock the recoveryStore so the hook never touches IndexedDB
// ---------------------------------------------------------------------------

const {
  mockGetAllRecoveries,
  mockSubscribeToRecovery,
  mockAddRecovery,
  mockUpdateRecovery,
  mockDeleteRecovery,
  mockClearRecovery,
} = vi.hoisted(() => ({
  mockGetAllRecoveries: vi.fn(),
  mockSubscribeToRecovery: vi.fn(),
  mockAddRecovery: vi.fn(),
  mockUpdateRecovery: vi.fn(),
  mockDeleteRecovery: vi.fn(),
  mockClearRecovery: vi.fn(),
}));

vi.mock("@/storage/recoveryStore", () => ({
  getAllRecoveries: mockGetAllRecoveries,
  subscribeToRecovery: mockSubscribeToRecovery,
  addRecovery: mockAddRecovery,
  updateRecovery: mockUpdateRecovery,
  deleteRecovery: mockDeleteRecovery,
  clearRecovery: mockClearRecovery,
}));

import { useRecovery } from "../useRecovery";

const RECOVERY_A = {
  id: "recovery:1",
  name: "0xFolioAddress0000000000000000000000001",
  chainId: 11155111,
  recoverableAddress: "0xRecoverable0000000000000000000000001",
  threshold: 1,
  status: true,
  participants: ["0xParticipant0000000000000000000000001"],
  createdAt: 100,
  updatedAt: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribeToRecovery.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------

describe("useRecovery — initial state", () => {
  it("starts with loading=true and empty recoveries", () => {
    mockGetAllRecoveries.mockResolvedValue([]);
    const { result } = renderHook(() => useRecovery());

    expect(result.current.loading).toBe(true);
    expect(result.current.recoveries).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("loads recoveries and sets loading=false", async () => {
    mockGetAllRecoveries.mockResolvedValue([RECOVERY_A]);
    const { result } = renderHook(() => useRecovery());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.recoveries).toHaveLength(1);
    expect(result.current.recoveries[0].id).toBe("recovery:1");
    expect(result.current.error).toBeNull();
  });

  it("sets error when getAllRecoveries throws", async () => {
    mockGetAllRecoveries.mockRejectedValue(new Error("storage failure"));
    const { result } = renderHook(() => useRecovery());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("storage failure");
    expect(result.current.recoveries).toEqual([]);
  });

  it("uses a generic message when the thrown error has no message", async () => {
    mockGetAllRecoveries.mockRejectedValue({});
    const { result } = renderHook(() => useRecovery());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("Failed to load recoveries");
  });
});

describe("useRecovery — subscription", () => {
  it("subscribes to store on mount", async () => {
    mockGetAllRecoveries.mockResolvedValue([]);
    renderHook(() => useRecovery());

    expect(mockSubscribeToRecovery).toHaveBeenCalledOnce();
  });

  it("unsubscribes on unmount", async () => {
    const unsubFn = vi.fn();
    mockSubscribeToRecovery.mockReturnValue(unsubFn);
    mockGetAllRecoveries.mockResolvedValue([]);

    const { unmount } = renderHook(() => useRecovery());
    await waitFor(() => {});
    unmount();

    expect(unsubFn).toHaveBeenCalledOnce();
  });

  it("updates recoveries when subscriber callback fires", async () => {
    let storedCallback: ((r: typeof RECOVERY_A[]) => void) | null = null;
    mockSubscribeToRecovery.mockImplementation((cb: (r: typeof RECOVERY_A[]) => void) => {
      storedCallback = cb;
      return () => {};
    });
    mockGetAllRecoveries.mockResolvedValue([]);

    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Simulate store push
    storedCallback!([RECOVERY_A]);
    await waitFor(() => expect(result.current.recoveries).toHaveLength(1));
    expect(result.current.recoveries[0].id).toBe("recovery:1");
  });
});

describe("useRecovery — CRUD passthrough", () => {
  it("exposes addRecovery from store", async () => {
    mockGetAllRecoveries.mockResolvedValue([]);
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.addRecovery).toBe(mockAddRecovery);
  });

  it("exposes updateRecovery from store", async () => {
    mockGetAllRecoveries.mockResolvedValue([]);
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.updateRecovery).toBe(mockUpdateRecovery);
  });

  it("exposes deleteRecovery from store", async () => {
    mockGetAllRecoveries.mockResolvedValue([]);
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.deleteRecovery).toBe(mockDeleteRecovery);
  });

  it("exposes clearRecoveries from store", async () => {
    mockGetAllRecoveries.mockResolvedValue([]);
    const { result } = renderHook(() => useRecovery());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.clearRecoveries).toBe(mockClearRecovery);
  });
});
