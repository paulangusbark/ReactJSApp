import * as React from "react";
import { useContracts } from "@/hooks/useContracts";
import { sortContracts, ContractSortMode } from "@/lib/contractSorting";

type UseContractsListOptions = {
  query?: string;
  tags?: string[];
  chainId?: number;
  tagMode?: boolean; // true = "any" | false = "all"
  sortMode?: ContractSortMode;
};

export function useContactsList(options: UseContractsListOptions = {}) {
  const { contracts, loading, error, addContract, updateContract, deleteContract, clearContracts } =
    useContracts();

  const { query = "", sortMode = "nameAsc", tags=[], tagMode = true, chainId = 0 } = options;

  const filteredAndSorted = React.useMemo(() => {
    let list = contracts;

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

    if (tags && tags.length > 0) {
      if (tagMode) {
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

    return sortContracts(list, sortMode);
  }, [contracts, query, sortMode]);

  return {
    contracts: filteredAndSorted,
    loading,
    error,
    addContract,
    updateContract,
    deleteContract,
    clearContracts,
  };
}