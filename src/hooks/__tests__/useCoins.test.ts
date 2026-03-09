// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------

const {
  mockGetAllCoins,
  mockSubscribeToCoins,
  mockAddCoin,
  mockUpdateCoin,
  mockDeleteCoin,
  mockClearCoins,
} = vi.hoisted(() => ({
  mockGetAllCoins: vi.fn(),
  mockSubscribeToCoins: vi.fn(),
  mockAddCoin: vi.fn(),
  mockUpdateCoin: vi.fn(),
  mockDeleteCoin: vi.fn(),
  mockClearCoins: vi.fn(),
}));

vi.mock("@/storage/coinStore", () => ({
  getAllCoins: mockGetAllCoins,
  subscribeToCoins: mockSubscribeToCoins,
  addCoin: mockAddCoin,
  updateCoin: mockUpdateCoin,
  deleteCoin: mockDeleteCoin,
  clearCoins: mockClearCoins,
}));

import { useCoins } from "../useCoins";

const COIN_A = { id: "c1", name: "Ether",    symbol: "ETH",  chainId: 1,         decimals: 18, createdAt: 100 };
const COIN_B = { id: "c2", name: "USD Coin", symbol: "USDC", chainId: 1,         decimals: 6,  createdAt: 200 };
const COIN_C = { id: "c3", name: "Chainlink","symbol": "LINK", chainId: 11155111, decimals: 18, createdAt: 50  };

beforeEach(() => {
  vi.clearAllMocks();
  mockSubscribeToCoins.mockReturnValue(() => {});
});

// ---------------------------------------------------------------------------

describe("useCoins", () => {
  it("starts with loading=true and empty coins", () => {
    mockGetAllCoins.mockResolvedValue([]);
    const { result } = renderHook(() => useCoins());
    expect(result.current.loading).toBe(true);
    expect(result.current.coins).toEqual([]);
  });

  it("loads coins and sets loading=false", async () => {
    mockGetAllCoins.mockResolvedValue([COIN_A, COIN_B]);
    const { result } = renderHook(() => useCoins());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.coins).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("sets error when getAllCoins throws", async () => {
    mockGetAllCoins.mockRejectedValue(new Error("storage error"));
    const { result } = renderHook(() => useCoins());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("storage error");
  });

  it("exposes CRUD functions from storage", async () => {
    mockGetAllCoins.mockResolvedValue([]);
    const { result } = renderHook(() => useCoins());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.addCoin).toBe(mockAddCoin);
    expect(result.current.updateCoin).toBe(mockUpdateCoin);
    expect(result.current.deleteCoin).toBe(mockDeleteCoin);
    expect(result.current.clearCoins).toBe(mockClearCoins);
  });
});
