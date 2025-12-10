import * as React from "react";
import { useContactsList } from "../hooks/useContactList";
import { Contact, Wallet } from "@/storage/contactStore";

export function Contacts() {
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"nameAsc" | "createdDesc" | "nameDesc" | "surnameAsc" | "surnameDesc" | "createdAsc">(
    "nameAsc"
  );
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagMode, setTagSearchMode] = React.useState("any");
  const [tagSearch, setTagSearch] = React.useState<string>("");

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingContact, setEditingContact] = React.useState<Contact | null>(null);

  // Form state for modal
  const [formName, setFormName] = React.useState("");
  const [formSurname, setFormSurname] = React.useState("");
  const [formTags, setFormTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [formWallets, setFormWallets] = React.useState<Wallet[]>([]);

  const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
  const ENS_REGEX = /^[a-z0-9-]+\.eth$/i;

  const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
    31337: "Local",
  };

  const {
    contacts,
    loading,
    error,
    addContact,
    deleteContact,
    updateContact,
  } = useContactsList({ query, sortMode, tags, tagMode });

  // --- Modal helpers ---------------------------------------------------------

  function resetForm() {
    setFormName("");
    setFormSurname("");
    setFormTags([]);
    setTagInput("");
    setFormWallets([]);
  }

  function openAddModal() {
    setEditingContact(null);
    resetForm();
    setIsModalOpen(true);
  }

  function openEditModal(contact: Contact) {
    setEditingContact(contact);
    setFormName(contact.name ?? "");
    setFormSurname(contact.surname ?? "");
    setFormTags(contact.tags ?? []);
    setTagInput("");
    setFormWallets((contact as any).wallets ?? []); // adjust if your type differs
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingContact(null);
    resetForm();
  }

  function handleAddTagFromInput() {
    const raw = tagInput.trim();
    if (!raw) return;

    const newTags = raw
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    setFormTags(prev => {
      const lowerPrev = new Set(prev.map(t => t.toLowerCase()));
      const merged = [...prev];
      for (const t of newTags) {
        if (!lowerPrev.has(t.toLowerCase())) merged.push(t);
      }
      return merged;
    });

    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    setFormTags(prev => prev.filter(t => t !== tag));
  }

  function handleWalletChange(index: number, field: keyof Wallet, value: string) {
    setFormWallets(prev => {

      if (field === "address") {
      const trimmed = value.trim();
      // Allow empty value while editing; only block non-empty invalid ones
      if (trimmed !== "" && !EVM_ADDRESS_REGEX.test(trimmed) && !ENS_REGEX.test(trimmed)) {
        // Invalid address → do not update state
        return prev;
      }
    }

      const next = [...prev];
      const w = { ...next[index] };
      if (field === "chainId") {
        w.chainId = Number(value) || 0;
      } else {
        w.address = value;
      }
      next[index] = w;
      return next;
    });
  }

  function handleAddWalletRow() {
    setFormWallets(prev => [...prev, { chainId: 0, address: "" }]);
  }

  function handleRemoveWalletRow(index: number) {
    setFormWallets(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = formName.trim();
    if (!trimmedName) return; // you can show a validation message if you like

    const payload: any = {
      name: trimmedName,
      surname: formSurname.trim() || undefined,
      tags: formTags.length > 0 ? formTags : undefined,
      wallets: formWallets.filter(w => w.address.trim()), // only keep non-empty addresses
    };

    if (editingContact) {
      await updateContact(editingContact.id, payload);
    } else {
      await addContact(payload);
    }

    closeModal();
  }

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
            <option value="nameAsc">Name (A → Z)</option>
            <option value="nameDesc">Name (Z → A)</option>
            <option value="surnameAsc">Surname (A → Z)</option>
            <option value="surnameDesc">Surname (Z → A)</option>
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

      {contacts.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No contacts yet. Add one from the transaction screen or here.
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

              {(c as any).wallets && (c as any).wallets.length > 0 && (
                <div className="mt-1 text-[10px] text-neutral-500">
                  {(c as any).wallets.map((w: Wallet, idx: number) => (
                    <div key={idx}>
                      <span className="font-mono">
                        {w.chainId}: {w.address}
                      </span>
                     </div>
                  ))}
                </div>
              )}

              {c.tags && c.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-500">
                    {c.tags.map(tag => (
                      <span
                        key={tag}
                        className="rounded-full border px-2 py-0.5"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

              <div className="flex items-center gap-2 text-xs">
                <button
                  className="underline"
                  onClick={() => openEditModal(c)}
                >
                  Edit
                </button>
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

{/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h2 className="mb-3 text-base font-semibold">
              {editingContact ? "Edit contact" : "Add contact"}
            </h2>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label className="text-xs font-medium">Name</label>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Surname (optional)</label>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={formSurname}
                  onChange={e => setFormSurname(e.target.value)}
                />
              </div>

              {/* Tags input */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Tags</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-md border px-2 py-1 text-sm"
                    placeholder="Type a tag and press Enter or comma…"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        handleAddTagFromInput();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-md border px-2 py-1 text-xs"
                    onClick={handleAddTagFromInput}
                  >
                    Add
                  </button>
                </div>

                {formTags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-neutral-700">
                    {formTags.map(tag => (
                      <button
                        key={tag}
                        type="button"
                        className="flex items-center gap-1 rounded-full border px-2 py-0.5"
                        onClick={() => handleRemoveTag(tag)}
                        title="Click to remove"
                      >
                        <span>#{tag}</span>
                        <span aria-hidden>×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Wallets */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Wallets</label>

                {formWallets.length === 0 && (
                  <div className="text-[11px] text-neutral-500">
                    No wallets yet.
                  </div>
                )}

                <div className="space-y-2">
                  {formWallets.map((w, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-md border px-2 py-1"
                    >
                      <select
                        className="w-20 rounded-md border px-1 py-0.5 text-xs"
                        value={w.chainId}
                        onChange={e => handleWalletChange(idx, "chainId", e.target.value)}
                      >
                      {Object.entries(CHAIN_NAMES).map(([id, label]) => (
                        <option key={id} value={id}>
                          {label}
                        </option>
                      ))}
                      </select>
                      <input
                        className="flex-1 rounded-md border px-2 py-0.5 text-xs font-mono"
                        placeholder="0x..."
                        value={w.address}
                        onChange={e =>
                          handleWalletChange(idx, "address", e.target.value)
                        }
                      />
                      <button
                        type="button"
                        className="text-[11px] text-red-600 underline"
                        onClick={() => handleRemoveWalletRow(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-1 rounded-md border px-2 py-1 text-xs"
                  onClick={handleAddWalletRow}
                >
                  + Add wallet
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1 text-xs"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-black px-3 py-1 text-xs font-medium text-white"
                >
                  {editingContact ? "Save changes" : "Create contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
