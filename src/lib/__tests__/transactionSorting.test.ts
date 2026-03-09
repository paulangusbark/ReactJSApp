import { describe, it, expect } from "vitest";
import { sortTxns, sortTransactions } from "../transactionSorting";
import type { Txn } from "@/storage/transactionStore";
import type { Folio } from "@/storage/folioStore";
import type { Coin } from "@/storage/coinStore";
import type { Address } from "@/storage/addressStore";

// ---------------------------------------------------------------------------
// Minimal fixture builders
// ---------------------------------------------------------------------------

function txn(id: string, createdAt: number, chainId: number, extra: Partial<Txn> = {}): Txn {
  return {
    id,
    folioId: `folio-${id}`,
    coinId: `coin-${id}`,
    addressId: `addr-${id}`,
    chainId,
    createdAt,
    transactionHash: id,
    ...extra,
  } as unknown as Txn;
}

const T1 = txn("t1", 100, 1);
const T2 = txn("t2", 200, 11155111);
const T3 = txn("t3", 50,  1);

// ---------------------------------------------------------------------------
// sortTxns — simple sort on Txn arrays
// ---------------------------------------------------------------------------

describe("sortTxns", () => {
  it("createdAsc — oldest first", () => {
    const r = sortTxns([T1, T2, T3], "createdAsc");
    expect(r.map(t => t.createdAt)).toEqual([50, 100, 200]);
  });

  it("createdDesc — newest first", () => {
    const r = sortTxns([T1, T2, T3], "createdDesc");
    expect(r.map(t => t.createdAt)).toEqual([200, 100, 50]);
  });

  it("chainIdAsc — lowest chainId first", () => {
    const r = sortTxns([T2, T1, T3], "chainIdAsc");
    expect(r[0].chainId).toBe(1);
    expect(r[2].chainId).toBe(11155111);
  });

  it("chainIdDesc — highest chainId first", () => {
    const r = sortTxns([T1, T3, T2], "chainIdDesc");
    expect(r[0].chainId).toBe(11155111);
  });

  it("default mode is createdAsc", () => {
    const r = sortTxns([T1, T2, T3]);
    expect(r.map(t => t.createdAt)).toEqual([50, 100, 200]);
  });

  it("does not mutate the input array", () => {
    const input = [T2, T1, T3];
    sortTxns(input, "createdAsc");
    expect(input[0].id).toBe("t2");
  });

  it("empty array returns empty array", () => {
    expect(sortTxns([], "createdAsc")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sortTransactions — multi-key sort with lookups
// ---------------------------------------------------------------------------

describe("sortTransactions", () => {
  const folioA: Folio = { id: "folio-t1", name: "Alpha",   chainId: 1 } as unknown as Folio;
  const folioB: Folio = { id: "folio-t2", name: "Beta",    chainId: 1 } as unknown as Folio;
  const folioC: Folio = { id: "folio-t3", name: "Charlie", chainId: 1 } as unknown as Folio;

  const coinA: Coin = { id: "coin-t1", symbol: "ETH"  } as unknown as Coin;
  const coinB: Coin = { id: "coin-t2", symbol: "USDC" } as unknown as Coin;
  const coinC: Coin = { id: "coin-t3", symbol: "LINK" } as unknown as Coin;

  const addrA: Address = { id: "addr-t1", name: "Alice"   } as unknown as Address;
  const addrB: Address = { id: "addr-t2", name: "Bob"     } as unknown as Address;
  const addrC: Address = { id: "addr-t3", name: "Charlie" } as unknown as Address;

  const folios    = [folioA, folioB, folioC];
  const coins     = [coinA, coinB, coinC];
  const addresses = [addrA, addrB, addrC];

  it("nameAsc — sorts by folio name ascending", () => {
    const r = sortTransactions([T3, T2, T1], folios, coins, addresses, "nameAsc", "createdAsc");
    expect(r.map(t => t.id)).toEqual(["t1", "t2", "t3"]); // Alpha, Beta, Charlie
  });

  it("nameDesc — sorts by folio name descending", () => {
    const r = sortTransactions([T1, T2, T3], folios, coins, addresses, "nameDesc", "createdAsc");
    expect(r.map(t => t.id)).toEqual(["t3", "t2", "t1"]); // Charlie, Beta, Alpha
  });

  it("coinSymbolAsc — sorts by coin symbol ascending", () => {
    const r = sortTransactions([T2, T1, T3], folios, coins, addresses, "coinSymbolAsc", "createdAsc");
    // ETH < LINK < USDC
    expect(r.map(t => t.id)).toEqual(["t1", "t3", "t2"]);
  });

  it("coinSymbolDesc — sorts by coin symbol descending", () => {
    const r = sortTransactions([T1, T2, T3], folios, coins, addresses, "coinSymbolDesc", "createdAsc");
    // USDC > LINK > ETH
    expect(r.map(t => t.id)).toEqual(["t2", "t3", "t1"]);
  });

  it("addressAsc — sorts by address name ascending", () => {
    const r = sortTransactions([T3, T2, T1], folios, coins, addresses, "addressAsc", "createdAsc");
    expect(r.map(t => t.id)).toEqual(["t1", "t2", "t3"]); // Alice, Bob, Charlie
  });

  it("createdDesc primary — newest first", () => {
    const r = sortTransactions([T1, T3, T2], folios, coins, addresses, "createdDesc", "chainIdAsc");
    expect(r.map(t => t.createdAt)).toEqual([200, 100, 50]);
  });

  it("secondary sort breaks ties — same folio name uses createdAsc", () => {
    // Two txns in folioA (same name), secondary by createdAsc
    const tA1 = { ...T1, id: "a1", createdAt: 300 } as Txn;
    const tA2 = { ...T1, id: "a2", createdAt: 10  } as Txn;
    const r = sortTransactions([tA1, tA2, T2], folios, coins, addresses, "nameAsc", "createdAsc");
    expect(r[0].id).toBe("a2"); // earlier in same folio
    expect(r[1].id).toBe("a1");
  });

  it("does not mutate the input array", () => {
    const input = [T2, T1, T3];
    sortTransactions(input, folios, coins, addresses, "nameAsc", "createdAsc");
    expect(input[0].id).toBe("t2");
  });

  it("handles missing folio/coin/address lookup gracefully", () => {
    const orphan = txn("orphan", 999, 1, { folioId: "no-folio", coinId: "no-coin", addressId: "no-addr" });
    // Should not throw
    expect(() =>
      sortTransactions([orphan, T1], folios, coins, addresses, "nameAsc", "createdAsc")
    ).not.toThrow();
  });
});
