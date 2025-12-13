// src/hooks/useTxns.ts
import * as React from "react";
import {
  Txn,
  getAllTxns,
  addTxn as storeAddTxn,
  updateTxn as storeUpdateTxn,
  deleteTxn as storeDeleteTxn,
  clearTxns as storeClearTxns,
  subscribeToTxns,
} from "../storage/transactionStore";

type UseTxnsResult = {
  txns: Txn[];
  loading: boolean;
  error: string | null;
  addTxn: typeof storeAddTxn;
  updateTxn: typeof storeUpdateTxn;
  deleteTxn: typeof storeDeleteTxn;
  clearTxns: typeof storeClearTxns;
};

export function useTxns(): UseTxnsResult {
  const [txns, setTxns] = React.useState<Txn[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const initial = await getAllTxns();
        if (!cancelled) {
          setTxns(initial);
          setLoading(false);
        }
      } catch (e: any) {
        console.error("[Txns] Failed to load:", e);
        if (!cancelled) {
          setError(e?.message ?? "Failed to load Txns");
          setLoading(false);
        }
      }
    })();

    const unsubscribe = subscribeToTxns(next => {
      if (!cancelled) {
        setTxns(next);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    txns,
    loading,
    error,
    addTxn: storeAddTxn,
    updateTxn: storeUpdateTxn,
    deleteTxn: storeDeleteTxn,
    clearTxns: storeClearTxns,
  };
}
