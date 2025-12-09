import * as React from "react";
import { useContactsList } from "../hooks/useContactList";

export function Contacts() {
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"nameAsc" | "createdDesc" | "nameDesc" | "surnameAsc" | "surnameDesc" | "createdAsc">(
    "nameAsc"
  );

  const {
    contacts,
    loading,
    error,
    addContact,
    deleteContact,
    updateContact,
  } = useContactsList({ query, sortMode });

  if (loading) return <div className="p-4">Loading contacts…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Contacts</h1>

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
            <option value="nameAsc">Favourites first</option>
            <option value="nameDesc">Name (A → Z)</option>
            <option value="createdDesc">Newest first</option>
          </select>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No contacts yet. Add one from the transfer screen or here.
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map(c => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="text-xs text-neutral-500">{c.surname}</div>
              </div>

              <div className="flex items-center gap-2 text-xs">
{/*                 <button
                  className="underline"
                  onClick={() =>
                    updateContact(c.id, { favourite: !c.favourite })
                  }
                >
                  {c.favourite ? "Unfavourite" : "Favourite"}
                </button> */}
                <button
                  className="text-red-600 underline"
                  onClick={() => deleteContact(c.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
