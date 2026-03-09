// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock storage before importing hook
// ---------------------------------------------------------------------------

const {
  mockGetAllAddress,
  mockSubscribeToAddress,
  mockAddAddress,
  mockUpdateAddress,
  mockDeleteAddress,
  mockClearAddress,
} = vi.hoisted(() => ({
  mockGetAllAddress: vi.fn(),
  mockSubscribeToAddress: vi.fn(),
  mockAddAddress: vi.fn(),
  mockUpdateAddress: vi.fn(),
  mockDeleteAddress: vi.fn(),
  mockClearAddress: vi.fn(),
}));

vi.mock("@/storage/addressStore", () => ({
  getAllAddress: mockGetAllAddress,
  subscribeToAddress: mockSubscribeToAddress,
  addAddress: mockAddAddress,
  updateAddress: mockUpdateAddress,
  deleteAddress: mockDeleteAddress,
  clearAddress: mockClearAddress,
}));

import { useAddress } from "../useAddresses";

const ADDR_A = { id: "a1", name: "Alice", createdAt: 100, indexOrder: 0, group: [] };
const ADDR_B = { id: "a2", name: "Bob",   createdAt: 200, indexOrder: 1, group: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribeToAddress.mockReturnValue(() => {}); // unsubscribe no-op
});

// ---------------------------------------------------------------------------

describe("useAddress", () => {
  it("starts with loading=true and empty address", () => {
    mockGetAllAddress.mockResolvedValue([]);
    const { result } = renderHook(() => useAddress());
    expect(result.current.loading).toBe(true);
    expect(result.current.address).toEqual([]);
  });

  it("loads addresses and sets loading=false", async () => {
    mockGetAllAddress.mockResolvedValue([ADDR_A, ADDR_B]);
    const { result } = renderHook(() => useAddress());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.address).toEqual([ADDR_A, ADDR_B]);
    expect(result.current.error).toBeNull();
  });

  it("sets error when getAllAddress throws", async () => {
    mockGetAllAddress.mockRejectedValue(new Error("IDB failure"));
    const { result } = renderHook(() => useAddress());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("IDB failure");
    expect(result.current.address).toEqual([]);
  });

  it("updates address when subscription fires", async () => {
    mockGetAllAddress.mockResolvedValue([ADDR_A]);
    let capturedListener: ((next: typeof ADDR_A[]) => void) | null = null;
    mockSubscribeToAddress.mockImplementation((fn: (next: typeof ADDR_A[]) => void) => {
      capturedListener = fn;
      return () => {};
    });

    const { result } = renderHook(() => useAddress());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { capturedListener!([ADDR_A, ADDR_B]); });
    expect(result.current.address).toEqual([ADDR_A, ADDR_B]);
  });

  it("calls subscribeToAddress once on mount", async () => {
    mockGetAllAddress.mockResolvedValue([]);
    const { result } = renderHook(() => useAddress());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockSubscribeToAddress).toHaveBeenCalledOnce();
  });

  it("calls unsubscribe on unmount", async () => {
    mockGetAllAddress.mockResolvedValue([]);
    const unsubscribe = vi.fn();
    mockSubscribeToAddress.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useAddress());
    await waitFor(() => expect(mockGetAllAddress).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("exposes CRUD functions from storage", async () => {
    mockGetAllAddress.mockResolvedValue([]);
    const { result } = renderHook(() => useAddress());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.addAddress).toBe(mockAddAddress);
    expect(result.current.updateAddress).toBe(mockUpdateAddress);
    expect(result.current.deleteAddress).toBe(mockDeleteAddress);
    expect(result.current.clearAddress).toBe(mockClearAddress);
  });
});
