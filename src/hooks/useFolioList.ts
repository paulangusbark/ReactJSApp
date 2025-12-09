import * as React from "react";
import { useFolios } from "@/hooks/useFolios";
import { sortFolios, FolioSortMode } from "@/lib/folioSorting";

type UseFolioListOptions = {
  query?: string;
  chainId?: number;
  sortMode?: FolioSortMode;
};

export function useFolioList(options: UseFolioListOptions = {}) {
  const { folios, loading, error, addFolio, updateFolio, deleteFolio, clearFolios } =
    useFolios();

  const { query = "", sortMode = "createdAsc", chainId = 0 } = options;

  const filteredAndSorted = React.useMemo(() => {
    let list = folios;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) 
      );
    }

    if (chainId) {
      list = list.filter(c => c.chainId === chainId);
    }

    return sortFolios(list, sortMode);
  }, [folios, query, sortMode]);

  return {
    coins: filteredAndSorted,
    loading,
    error,
    addFolio,
    updateFolio,
    deleteFolio,
    clearFolios,
  };
}