import * as React from "react";
import { useAddressList } from "../hooks/useAddressList";
import { AddressSortableList } from "../components/ui/addressSortableList"
import { Address } from "@/storage/addressStore";

export function AddressBook() {
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"nameAsc" | "createdDesc" | "nameDesc" | "createdAsc" | "custom">(
    "custom"
  );
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagMode, setTagSearchMode] = React.useState("any");
  const [tagSearch, setTagSearch] = React.useState<string>("");

  const {
    address,
    loading,
    error,
    addAddress,
    deleteAddress,
    updateAddress,
  } = useAddressList({ query, sortMode, tags, tagMode });

  // Only display visible addresses
  const visibleAddresses = React.useMemo(
    () => address.filter((a) => a.isVisible !== false),
    [address]
  );

  async function handleReorder(updated: Address[]) {
    // updated is the *visible* list in the new order
    // assign indexOrder based on new position
    await Promise.all(
      updated.map((addr, idx) =>
        updateAddress(addr.id, { indexOrder: idx })
      )
    );
    // useAddressList should re-emit state after updates
  }

  async function handleHide(id: string) {
    await updateAddress(id, { isVisible: false });
    // On next render, visibleAddresses will filter it out
  }

  if (loading) return <div className="p-4">Loading Address…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Address Book</h1>

        <div className="flex flex-1 gap-2 sm:justify-end">
          <input
            className="w-full max-w-xs rounded-md border px-2 py-1 text-sm"
            placeholder="Search by name or address…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />

          <select
            className="rounded-md border px-2 py-1 text-sm"
            value={sortMode}
            onChange={e => setSortMode(e.target.value as any)}
          >
            <option value="custom">Template</option>
            <option value="nameAsc">Name (A → Z)</option>
            <option value="nameDesc">Name (Z → A)</option>
            <option value="createdDesc">Newest first</option>
            <option value="createdAsc">Oldest first</option>
          </select>
          <input
            className="..."
            placeholder="Filter by tags (comma-separated)…"
            value={tagSearch}
            onChange={e => {
              const raw = e.target.value;
              setTagSearch(raw);

              const tokens = raw
              .split(",")
              .map(t => t.trim())
              .filter(Boolean);

              setTags(tokens);
            }}
          />
          <select
            className="rounded-md border px-2 py-1 text-xs"
            value={tagMode}
            onChange={e => setTagSearchMode(e.target.value as "any" | "all")}
          >
            <option value="any">Match any</option>
            <option value="all">Match all</option>
          </select>
        </div>
      </div>

      {sortMode !== "custom" && (
        <p className="text-xs text-gray-500">
          Switch to <span className="font-semibold">Custom</span> to drag and
          reorder addresses manually.
        </p>
      )}

      <AddressSortableList
        items={visibleAddresses}
        sortMode={sortMode}
        onReorder={handleReorder}
        onHide={handleHide}
      />


    </div>
  );
}
