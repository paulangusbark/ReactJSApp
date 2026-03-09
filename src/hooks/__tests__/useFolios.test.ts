// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------

const {
  mockGetAllFolios,
  mockSubscribeToFolios,
  mockAddFolio,
  mockUpdateFolio,
  mockDeleteFolio,
  mockClearFolios,
} = vi.hoisted(() => ({
  mockGetAllFolios: vi.fn(),
  mockSubscribeToFolios: vi.fn(),
  mockAddFolio: vi.fn(),
  mockUpdateFolio: vi.fn(),
  mockDeleteFolio: vi.fn(),
  mockClearFolios: vi.fn(),
}));

vi.mock("@/storage/folioStore", () => ({
  getAllFolios: mockGetAllFolios,
  subscribeToFolios: mockSubscribeToFolios,
  addFolio: mockAddFolio,
  updateFolio: mockUpdateFolio,
  deleteFolio: mockDeleteFolio,
  clearFolios: mockClearFolios,
}));

import { useFolios } from "../useFolios";

const FOLIO_A = { id: "f1", name: "Main",    chainId: 1,         address: "0xaaaa", createdAt: 100 };
const FOLIO_B = { id: "f2", name: "Sepolia", chainId: 11155111,  address: "0xbbbb", createdAt: 200 };

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribeToFolios.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------

describe("useFolios", () => {
  it("starts with loading=true and empty folios", () => {
    mockGetAllFolios.mockResolvedValue([]);
    const { result } = renderHook(() => useFolios());
    expect(result.current.loading).toBe(true);
    expect(result.current.folios).toEqual([]);
  });

  it("loads folios and sets loading=false", async () => {
    mockGetAllFolios.mockResolvedValue([FOLIO_A, FOLIO_B]);
    const { result } = renderHook(() => useFolios());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.folios).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("sets error when getAllFolios throws", async () => {
    mockGetAllFolios.mockRejectedValue(new Error("folio load error"));
    const { result } = renderHook(() => useFolios());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("folio load error");
  });

  it("updates folios when subscription fires", async () => {
    mockGetAllFolios.mockResolvedValue([FOLIO_A]);
    let listener: ((next: typeof FOLIO_A[]) => void) | null = null;
    mockSubscribeToFolios.mockImplementation((fn: (next: typeof FOLIO_A[]) => void) => {
      listener = fn;
      return () => {};
    });

    const { result } = renderHook(() => useFolios());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { listener!([FOLIO_A, FOLIO_B]); });
    expect(result.current.folios).toHaveLength(2);
  });

  it("exposes CRUD functions from storage", async () => {
    mockGetAllFolios.mockResolvedValue([]);
    const { result } = renderHook(() => useFolios());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.addFolio).toBe(mockAddFolio);
    expect(result.current.updateFolio).toBe(mockUpdateFolio);
    expect(result.current.deleteFolio).toBe(mockDeleteFolio);
    expect(result.current.clearFolios).toBe(mockClearFolios);
  });

  it("calls unsubscribe on unmount", async () => {
    mockGetAllFolios.mockResolvedValue([]);
    const unsubscribe = vi.fn();
    mockSubscribeToFolios.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useFolios());
    await waitFor(() => expect(mockGetAllFolios).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
