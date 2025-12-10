import * as React from "react";
import { useAddressList } from "../hooks/useAddressList";
import { Address } from "@/storage/addressStore";

export function Address() {
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"nameAsc" | "createdDesc" | "nameDesc" | "createdAsc" | "custom">(
    "nameAsc"
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


  if (loading) return <div className="p-4">Loading Addresss…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Addresss</h1>

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
            <option value="nameAsc">Name (A → Z)</option>
            <option value="nameDesc">Name (Z → A)</option>
            <option value="custom">Custom</option>
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

      {address.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No Addresss yet. Add one from the transaction screen or here.
        </div>
      ) : (
        <ul className="space-y-2">
          {address.map(c => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="text-xs text-neutral-500">{c.name}</div>

              </div>

              {c.group && c.group.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-500">
                    {c.group.map(tag => (
                      <span
                        key={tag}
                        className="rounded-full border px-2 py-0.5"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

            </li>
          ))}
        </ul>
      )}


    </div>
  );
}
