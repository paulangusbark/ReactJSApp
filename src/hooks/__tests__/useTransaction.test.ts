// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------

const {
  mockGetAllTxns,
  mockSubscribeToTxns,
  mockAddTxn,
  mockUpdateTxn,
  mockDeleteTxn,
  mockClearTxns,
} = vi.hoisted(() => ({
  mockGetAllTxns: vi.fn(),
  mockSubscribeToTxns: vi.fn(),
  mockAddTxn: vi.fn(),
  mockUpdateTxn: vi.fn(),
  mockDeleteTxn: vi.fn(),
  mockClearTxns: vi.fn(),
}));

vi.mock("@/storage/transactionStore", () => ({
  getAllTxns: mockGetAllTxns,
  subscribeToTxns: mockSubscribeToTxns,
  addTxn: mockAddTxn,
  updateTxn: mockUpdateTxn,
  deleteTxn: mockDeleteTxn,
  clearTxns: mockClearTxns,
}));

import { useTxns } from "../useTransaction";

const TXN_A = { id: "t1", chainId: 1,         createdAt: 100, transactionHash: "0xaaa" };
const TXN_B = { id: "t2", chainId: 11155111,  createdAt: 200, transactionHash: "0xbbb" };

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribeToTxns.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------

describe("useTxns", () => {
  it("starts with loading=true and empty txns", () => {
    mockGetAllTxns.mockResolvedValue([]);
    const { result } = renderHook(() => useTxns());
    expect(result.current.loading).toBe(true);
    expect(result.current.txns).toEqual([]);
  });

  it("loads txns and sets loading=false", async () => {
    mockGetAllTxns.mockResolvedValue([TXN_A, TXN_B]);
    const { result } = renderHook(() => useTxns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.txns).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("sets error when getAllTxns throws", async () => {
    mockGetAllTxns.mockRejectedValue(new Error("txn load error"));
    const { result } = renderHook(() => useTxns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("txn load error");
  });

  it("updates txns when subscription fires", async () => {
    mockGetAllTxns.mockResolvedValue([TXN_A]);
    let listener: ((next: typeof TXN_A[]) => void) | null = null;
    mockSubscribeToTxns.mockImplementation((fn: (next: typeof TXN_A[]) => void) => {
      listener = fn;
      return () => {};
    });

    const { result } = renderHook(() => useTxns());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => { listener!([TXN_A, TXN_B]); });
    expect(result.current.txns).toHaveLength(2);
  });

  it("exposes CRUD functions from storage", async () => {
    mockGetAllTxns.mockResolvedValue([]);
    const { result } = renderHook(() => useTxns());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.addTxn).toBe(mockAddTxn);
    expect(result.current.updateTxn).toBe(mockUpdateTxn);
    expect(result.current.deleteTxn).toBe(mockDeleteTxn);
    expect(result.current.clearTxns).toBe(mockClearTxns);
  });

  it("calls unsubscribe on unmount", async () => {
    mockGetAllTxns.mockResolvedValue([]);
    const unsubscribe = vi.fn();
    mockSubscribeToTxns.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useTxns());
    await waitFor(() => expect(mockGetAllTxns).toHaveBeenCalled());
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
