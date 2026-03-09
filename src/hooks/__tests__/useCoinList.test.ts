// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mock useCoins so useCoinList gets a controlled coin list
// ---------------------------------------------------------------------------

const { mockUseCoins } = vi.hoisted(() => ({ mockUseCoins: vi.fn() }));

vi.mock("@/hooks/useCoins", () => ({ useCoins: mockUseCoins }));

import { useCoinList } from "../useCoinList";

const ETH  = { id: "1", name: "Ether",     symbol: "ETH",  chainId: 1,         type: "NATIVE", tags: ["defi"],   decimals: 18, address: "0x0000", createdAt: 100 };
const USDC = { id: "2", name: "USD Coin",  symbol: "USDC", chainId: 1,         type: "ERC20",  tags: ["stable"], decimals: 6,  address: "0xusdc", createdAt: 200 };
const LINK = { id: "3", name: "Chainlink", symbol: "LINK", chainId: 11155111,  type: "ERC20",  tags: ["defi"],   decimals: 18, address: "0xlink", createdAt: 50  };

const baseResult = {
  loading: false,
  error: null,
  addCoin: vi.fn(),
  updateCoin: vi.fn(),
  deleteCoin: vi.fn(),
  clearCoins: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCoins.mockReturnValue({ ...baseResult, coins: [ETH, USDC, LINK] });
});

// ---------------------------------------------------------------------------

describe("useCoinList — filtering", () => {
  it("returns all coins when no filters", () => {
    const { result } = renderHook(() => useCoinList());
    expect(result.current.coins).toHaveLength(3);
  });

  it("filters by query matching name", () => {
    const { result } = renderHook(() => useCoinList({ query: "ether" }));
    expect(result.current.coins).toHaveLength(1);
    expect(result.current.coins[0].symbol).toBe("ETH");
  });

  it("filters by query matching symbol", () => {
    const { result } = renderHook(() => useCoinList({ query: "usdc" }));
    expect(result.current.coins).toHaveLength(1);
    expect(result.current.coins[0].name).toBe("USD Coin");
  });

  it("filters by chainId", () => {
    const { result } = renderHook(() => useCoinList({ chainId: 11155111 }));
    expect(result.current.coins).toHaveLength(1);
    expect(result.current.coins[0].symbol).toBe("LINK");
  });

  it("filters by standard (type)", () => {
    const { result } = renderHook(() => useCoinList({ standard: "NATIVE" }));
    expect(result.current.coins).toHaveLength(1);
    expect(result.current.coins[0].symbol).toBe("ETH");
  });

  it("filters by tags (any mode)", () => {
    const { result } = renderHook(() =>
      useCoinList({ tags: ["defi"], tagMode: "any" })
    );
    expect(result.current.coins).toHaveLength(2); // ETH + LINK
  });

  it("filters by tags (all mode)", () => {
    const { result } = renderHook(() =>
      useCoinList({ tags: ["defi", "stable"], tagMode: "all" })
    );
    expect(result.current.coins).toHaveLength(0); // no coin has both tags
  });

  it("returns empty when query matches nothing", () => {
    const { result } = renderHook(() => useCoinList({ query: "zzznomatch" }));
    expect(result.current.coins).toHaveLength(0);
  });
});

describe("useCoinList — sorting", () => {
  it("default sort is nameAsc", () => {
    const { result } = renderHook(() => useCoinList());
    const names = result.current.coins.map(c => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("sorts by symbolAsc", () => {
    const { result } = renderHook(() => useCoinList({ sortMode: "symbolAsc" }));
    const syms = result.current.coins.map(c => c.symbol);
    expect(syms).toEqual(["ETH", "LINK", "USDC"]);
  });

  it("sorts by createdDesc", () => {
    const { result } = renderHook(() => useCoinList({ sortMode: "createdDesc" }));
    expect(result.current.coins[0].createdAt).toBe(200);
  });
});

describe("useCoinList — loading / error passthrough", () => {
  it("passes through loading state", () => {
    mockUseCoins.mockReturnValue({ ...baseResult, coins: [], loading: true });
    const { result } = renderHook(() => useCoinList());
    expect(result.current.loading).toBe(true);
  });

  it("passes through error state", () => {
    mockUseCoins.mockReturnValue({ ...baseResult, coins: [], loading: false, error: "oops" });
    const { result } = renderHook(() => useCoinList());
    expect(result.current.error).toBe("oops");
  });
});
