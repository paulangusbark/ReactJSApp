import * as React from "react";
import {
  Address,
  getAllAddress,
  addAddress as storeAddAddress,
  updateAddress as storeUpdateAddress,
  deleteAddress as storeDeleteAddress,
  clearAddress as storeClearAddress,
  subscribeToAddress,
} from "../storage/addressStore";

type UseAddressResult = {
  address: Address[];
  loading: boolean;
  error: string | null;
  addAddress: typeof storeAddAddress;
  updateAddress: typeof storeUpdateAddress;
  deleteAddress: typeof storeDeleteAddress;
  clearAddress: typeof storeClearAddress;
};

export function useAddress(): UseAddressResult {
  const [address, setAddress] = React.useState<Address[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const initial = await getAllAddress();
        if (!cancelled) {
          setAddress(initial);
          setLoading(false);
        }
      } catch (e: any) {
        console.error("[address] Failed to load:", e);
        if (!cancelled) {
          setError(e?.message ?? "Failed to load addresses");
          setLoading(false);
        }
      }
    })();

    const unsubscribe = subscribeToAddress(next => {
      if (!cancelled) {
        setAddress(next);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return {
    address,
    loading,
    error,
    addAddress: storeAddAddress,
    updateAddress: storeUpdateAddress,
    deleteAddress: storeDeleteAddress,
    clearAddress: storeClearAddress,
  };
}
