import * as React from "react";
import { useContacts } from "@/hooks/useContacts";
import { sortContacts, ContactSortMode } from "@/lib/contactSorting";

type UseContactsListOptions = {
  query?: string;
  tags?: string[];
  tagMode?: boolean; // true = "any" | false = "all"
  sortMode?: ContactSortMode;
};

export function useContactsList(options: UseContactsListOptions = {}) {
  const { contacts, loading, error, addContact, updateContact, deleteContact, clearContacts } =
    useContacts();

  const { query = "", sortMode = "nameAsc", tags=[], tagMode = true } = options;

  const filteredAndSorted = React.useMemo(() => {
    let list = contacts;

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.surname?.toLowerCase().includes(q)
      );
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

    return sortContacts(list, sortMode);
  }, [contacts, query, sortMode]);

  return {
    contacts: filteredAndSorted,
    loading,
    error,
    addContact,
    updateContact,
    deleteContact,
    clearContacts,
  };
}
