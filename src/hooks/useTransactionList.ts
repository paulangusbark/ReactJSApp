import * as React from "react";
import { useTxns } from "@/hooks/useTransaction";
import { sortTxns, TxnSortMode } from "@/lib/transactionSorting";

type UseTxnListOptions = {
  query?: string;
  chainId?: number;
  sortMode?: TxnSortMode;
};

export function useTxnList(options: UseTxnListOptions = {}) {
  const { txns, loading, error, addTxn, updateTxn, deleteTxn, clearTxns } =
    useTxns();

  const { query = "", sortMode = "createdAsc", chainId = 0 } = options;

  const filteredAndSorted = React.useMemo(() => {
    let list = txns;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(c =>
        c.userOpHash.toLowerCase().includes(q) ||
        c.transactionHash.toLowerCase().includes(q) 
      );
    }

    if (chainId) {
      list = list.filter(c => c.chainId === chainId);
    }

    return sortTxns(list, sortMode);
  }, [txns, query, sortMode]);

  return {
    txns: filteredAndSorted,
    loading,
    error,
    addTxn,
    updateTxn,
    deleteTxn,
    clearTxns,
  };
}