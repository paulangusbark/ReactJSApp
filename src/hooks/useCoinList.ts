import * as React from "react";
import { useCoins } from "@/hooks/useCoins";
import { sortCoins, CoinSortMode } from "@/lib/coinSorting";

type UseCoinListOptions = {
  query?: string;
  tags?: string[];
  standard?: string;
  chainId?: number;
  tagMode?: string; // "any" | "all"
  sortMode?: CoinSortMode;
};

export function useCoinList(options: UseCoinListOptions = {}) {
  const { coins, loading, error, addCoin, updateCoin, deleteCoin, clearCoins } =
    useCoins();

  const { query = "", sortMode = "nameAsc", tags=[], tagMode = true, chainId = 0, standard = "" } = options;

  const filteredAndSorted = React.useMemo(() => {
    let list = coins;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
      );
    }

    if (standard) {
      list = list.filter(c => c.type === standard);
    }

    if (chainId != 0) {
      list = list.filter(c => c.chainId === chainId);
    }

    if (tags && tags.length > 0) {
      if (tagMode == "any") {
        // ANY MATCH (OR)
        list = list.filter(c =>
          c.tags?.some(tag => tags.includes(tag))
        );
      } else {
        // MUST CONTAIN ALL (AND)
        list = list.filter(c =>
          tags.every(tag => c.tags?.includes(tag))
        );
      }
    }

    return sortCoins(list, sortMode);
  }, [coins, query, sortMode]);

  return {
    coins: filteredAndSorted,
    loading,
    error,
    addCoin,
    updateCoin,
    deleteCoin,
    clearCoins,
  };
}