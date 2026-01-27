import * as React from "react";
import { useContactsList } from "../hooks/useContactList";
import { Contact, Wallet } from "@/storage/contactStore";
import { useAddress } from "../hooks/useAddresses";
import { Address, deleteAddress } from "@/storage/addressStore";
import { useMemo } from "react";
import { createPortal } from "react-dom";

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
  const [contactToDelete, setContactToDelete] = React.useState<string | null>(null);

  const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
  const ENS_REGEX = /^[a-z0-9-]+\.eth$/i;

  const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
    31337: "Local",
  };

  const {
    address,
    loading: addLoading,
    error: addError,
    addAddress: storeAddAddress,
    updateAddress: storeUpdateAddress,
    deleteAddress: storeDeleteAddress,
    clearAddress: storeClearAddress,
  } = useAddress();

  const {
    contacts,
    loading,
    error,
    addContact,
    deleteContact,
    updateContact,
  } = useContactsList({ query, sortMode, tags, tagMode });

  // --- Modal helpers ---------------------------------------------------------

  function createAddressFromContact(contact: Contact) {
    storeAddAddress({
      id: contact.id,
      name: contact.name,
      isContact: true,
      isVisible: true,
      group: contact.tags ?? [],
      indexOrder: address.length,
    });
  }

  function updateAddressFromContact(contact: Contact, isVisible: boolean) {
    storeUpdateAddress(contact.id, {
      name: contact.name,
      isVisible: isVisible,
      group: contact.tags ?? [],
    });
  }

  const addressMap = useMemo(() => {
    const map: Record<string, Address> = {};
    address.forEach(a => { map[a.id] = a });
    return map;
  }, [address]
  );

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;

      // Ignore clicks inside any <details>
      if (target.closest("details")) return;

      // Close all open action menus
      document.querySelectorAll("details[open]").forEach(d => {
        d.removeAttribute("open");
      });
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!isModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isModalOpen]);

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

  function handleWalletChange(index: number, field: keyof Wallet, value: string | number) {
    setFormWallets(prev => {

      const next = [...prev];
      const w = { ...next[index] };
      if (field === "chainId") {
        const n = typeof value === "number" ? value : Number(value);
        if (Number.isFinite(n)) w.chainId = n;
      } else {
        w.address = String(value);
      }
      next[index] = w;
      return next;
    });
  }

  function handleAddWalletRow() {
    setFormWallets(prev => [...prev, { chainId: 1, address: "" }]);
  }

  function handleRemoveWalletRow(index: number) {
    setFormWallets(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const wallets = formWallets
      .map(w => ({ ...w, address: w.address.trim() }))
      .filter(w => w.address !== "");

    for (const w of wallets) {
      if (!EVM_ADDRESS_REGEX.test(w.address) && !ENS_REGEX.test(w.address)) {
        alert(`Invalid wallet address: ${w.address}`);
        return;
      }
    }

    const trimmedName = formName.trim();
    if (!trimmedName) return; // you can show a validation message if you like

    const payload: any = {
      name: trimmedName,
      surname: formSurname.trim() || undefined,
      tags: formTags.length > 0 ? formTags : undefined,
      wallets: formWallets.filter(w => w.address.trim()).filter(w => w.chainId > 0), // only keep non-empty addresses
    };

    if (editingContact) {
      const forAddress = await updateContact(editingContact.id, payload);
      updateAddressFromContact(forAddress.find(c => c.name === trimmedName)!, addressMap[editingContact.id]?.isVisible ?? true);
    } else {
      const forAddress = await addContact(payload);
      createAddressFromContact(forAddress.find(c => c.name === trimmedName)!);
    }

    closeModal();
  }

  if (loading) return <div className="p-4">Loading contacts…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="shrink-0 text-2xl leading-tight font-semibold text-foreground">
      Contacts
    </h1>
      <div className="flex flex-1 min-w-0 flex-nowrap items-center gap-2 sm:justify-end sm:mt-1">
        <input
          className="h-9 min-w-[160px] max-w-[260px] flex-[1_1_220px] rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted"
          placeholder="Search by name or address…"
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        <select
          className="h-9 w-[140px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
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
          className="h-9 min-w-[180px] max-w-[300px] flex-[1_1_240px] rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted"
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
          className="h-9 w-[110px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
          value={tagMode}
          onChange={e => setTagSearchMode(e.target.value as "any" | "all")}
        >
          <option value="any">Match any</option>
          <option value="all">Match all</option>
        </select>

        <button
          className="h-9 whitespace-nowrap rounded-md bg-bg px-3 text-sm font-medium text-primary hover:opacity-90"
          onClick={() => {
            console.log("Add clicked");
            openAddModal();
          }}
        >
          + Add contact
        </button>
      </div>


      {contacts.length === 0 ? (
        <div className="text-sm text-muted">
          No contacts yet. Add one from the transaction screen or here.
        </div>
      ) : (
        <ul className="space-y-2 overflow-visible">
          {contacts.map(c => (
            <li
              key={c.id}
              className="grid grid-cols-[80px_80px_1fr_110px] items-start gap-x-6 gap-y-2 rounded-lg border px-8 py-3 text-sm overflow-visible"
            >
              {/* Name / surname */}
              <div className="min-w-0">
                <div className="font-medium">{c.name}</div>
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted">{c.surname}</div>
              </div>

              {/* Wallets + tags */}
              <div className="min-w-0">
                {(c as any).wallets?.length > 0 && (
                  <div className="space-y-1 text-[11px] text-muted">
                    {(c as any).wallets.map((w: Wallet, idx: number) => (
                      <div key={idx} className="font-mono break-all">
                        {CHAIN_NAMES[w.chainId] ?? w.chainId}: {w.address}
                      </div>
                    ))}
                  </div>
                )}

                {c.tags && c.tags?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-10 text-[11px] text-muted">
                    {c.tags.map(tag => (
                      <span key={tag} className="px-10 py-0.5">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions column */}
              <div className="justify-self-start overflow-visible">
                <details className="relative inline-block overflow-visible">
                  <summary className="cursor-pointer list-none rounded-md border bg-background px-2 py-1 text-xs">
                    Actions
                  </summary>

                  <div className="absolute left-0 mt-1 w-40 rounded-md border border-neutral-200 bg-background shadow-lg z-50">
                    <button
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-muted"
                      onClick={(e) => {
                        (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                        openEditModal(c);
                      }}
                    >
                      Edit
                    </button>

                    <button
                      className="block w-full px-3 py-2 text-left text-xs hover:bg-muted"
                      onClick={(e) => {
                        (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                        updateAddressFromContact(c, !(addressMap[c.id]?.isVisible ?? true));
                      }}
                    >
                      {(addressMap[c.id]?.isVisible ?? true) ? "Hide" : "Show"}
                    </button>
                    <div className="my-1 border-t" />

                    <button
                      className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-muted"
                      onClick={(e) => {
                        (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                        setContactToDelete(c.id);
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </details>
              </div>
            </li>

          ))}
        </ul>
      )}

      {/* Modal */}
      {isModalOpen ? createPortal(
        <div
          className="bg-background/80 backdrop-blur-sm"
          onMouseDown={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div className="bg-background"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 448,
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            }}
          >
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
                  <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted">
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
                  <div className="text-[11px] text-muted">
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
                        onChange={e => handleWalletChange(idx, "chainId", Number(e.target.value))}
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
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-background"
                >
                  {editingContact ? "Save changes" : "Create contact"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      ) : null}

      {/* Modal */}
      {contactToDelete ? createPortal (
        <div
          className="bg-background/80 backdrop-blur-sm"
          onMouseDown={closeModal}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div className="bg-background"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 448,
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            }}
          >
          <h2 className="text-base font-semibold">Delete account?</h2>
          <p className="mt-2 text-sm text-muted">
          This will delete the contact and remove it from your address book. This action cannot be undone.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-md border px-3 py-1 text-sm"
              onClick={() => setContactToDelete(null)}
            >
              Cancel
            </button>
            <button
              className="rounded-md bg-primary px-3 py-1 text-sm text-background"
              onClick={() => {
                if (contactToDelete) {
                  deleteContact(contactToDelete);
                  storeDeleteAddress(contactToDelete);
                }
                setContactToDelete(null);
              }}
            >
              Yes, delete account
            </button>
          </div>
        </div>
      </div>,
      document.body
      ) : null
    }

    </div>
  );
}
