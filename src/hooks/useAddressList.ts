import * as React from "react";
import { useAddress } from "@/hooks/useAddresses";
import { sortAddresses, AddressSortMode } from "@/lib/addressSorting";

type UseAddressListOptions = {
  query?: string;
  tags?: string[];
  tagMode?: string; // "any" | "all"
  sortMode?: AddressSortMode;
};

export function useAddressList(options: UseAddressListOptions = {}) {
  const { address, loading, error, addAddress, updateAddress, reorderAddresses, deleteAddress, clearAddress } =
    useAddress();

  const { query = "", sortMode = "createdAsc", tags=[], tagMode = "any" } = options;

  const filteredAndSorted = React.useMemo(() => {
    let list = address;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q)
      );
    }

    if (tags && tags.length > 0) {  // either need to copy tags from contracts/contacts to addresses or update this filter to use those tags
      if (tagMode == "any") {
        // ANY MATCH (OR)
        list = list.filter(c =>
          c.group?.some(tag => tags.includes(tag))
        );
      } else {
        // MUST CONTAIN ALL (AND)
        list = list.filter(c =>
          tags.every(tag => c.group?.includes(tag))
        );
      }
    }

    return sortAddresses(list, sortMode);
  }, [address, query, sortMode, tags, tagMode]);

  return {
    address: filteredAndSorted,
    loading,
    error,
    addAddress,
    updateAddress,
    reorderAddresses,
    deleteAddress,
    clearAddress,
  };
}