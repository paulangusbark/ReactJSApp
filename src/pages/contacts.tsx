import * as React from "react";
import { useContactsList } from "../hooks/useContactList";
import { Contact, Wallet } from "@/storage/contactStore";
import { useAddress } from "../hooks/useAddresses";
import { type Address } from "@/storage/addressStore";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { ShareQrModal } from "../components/ui/ShareQrModal";
import { buildContactShare } from "@/lib/shareBuilders";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { useLocation } from "react-router-dom";

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
  const [qrPayload, setQrPayload] = React.useState<any>(null);

  // Form state for modal
  const [formName, setFormName] = React.useState("");
  const [formSurname, setFormSurname] = React.useState("");
  const [formTags, setFormTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [formWallets, setFormWallets] = React.useState<Wallet[]>([]);
  const [contactToDelete, setContactToDelete] = React.useState<string | null>(null);

  const location = useLocation();

  const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
  const ENS_REGEX = /^[a-z0-9-]+\.eth$/i;

  const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
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

  function updateAddressFromContact(contact: Contact, isVisible: boolean) {
    if (addressMap[contact.id]) {
      storeUpdateAddress(contact.id, {
        name: contact.name,
        isVisible: isVisible,
        group: contact.tags ?? [],
      });
    } else {
      storeAddAddress({
        id: contact.id,
        name: contact.name,
        isVisible: isVisible,
        group: contact.tags ?? [],
        isContact: true,
        indexOrder: 0,
      });
    }
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

  // Handle prefillContact from navigation state (e.g. "Add Contact" from a received transfer)
  React.useEffect(() => {
    const state = location.state?.prefillContact as
      | { prefillAddress: string; chainId: number }
      | undefined;
    if (!state) return;

    setEditingContact(null);
    setFormSurname("");
    setFormTags([]);
    setTagInput("");
    setFormWallets([{ chainId: state.chainId, address: state.prefillAddress }]);

    // Pre-fill name: strip ".eth" suffix if present, otherwise leave blank
    if (state.prefillAddress.toLowerCase().endsWith(".eth")) {
      setFormName(state.prefillAddress.slice(0, -4));
    } else {
      setFormName("");
    }

    setIsModalOpen(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!trimmedName) return; 

    const payload: any = {
      name: trimmedName,
      surname: formSurname.trim() || undefined,
      tags: formTags.length > 0 ? formTags : undefined,
      wallets: formWallets.filter(w => w.address.trim()).filter(w => w.chainId > 0), // only keep non-empty addresses
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
      <h1 className="shrink-0 text-2xl leading-tight font-semibold text-foreground">
        Contacts
      </h1>
      <div className="flex flex-col gap-2">
        <input
          className="h-11 sm:h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted sm:max-w-md"
          placeholder="Search by name or address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <FiltersDropdown
            sortOptions={[
              { value: "nameAsc", label: "Name (A \u2192 Z)" },
              { value: "nameDesc", label: "Name (Z \u2192 A)" },
              { value: "surnameAsc", label: "Surname (A \u2192 Z)" },
              { value: "surnameDesc", label: "Surname (Z \u2192 A)" },
              { value: "createdDesc", label: "Newest first" },
              { value: "createdAsc", label: "Oldest first" },
            ]}
            sortMode={sortMode}
            setSortMode={setSortMode}
            tagSearch={tagSearch}
            setTagSearch={setTagSearch}
            setTags={setTags}
            tagMode={tagMode as "any" | "all"}
            setTagSearchMode={setTagSearchMode}
          />&nbsp;

          <button
            className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={openAddModal}
          >
            &nbsp;+ Add contact&nbsp;
          </button>
        </div>
      </div>


      {contacts.length === 0 ? (
        <div className="text-sm text-muted">
          No contacts yet. Add one from the transaction screen or here.
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map(c => (
            <li key={c.id} className="w-full">
              <div className="w-full rounded-lg border border-border bg-card px-4 py-3">
                <div className="grid gap-3 sm:gap-x-6 sm:gap-y-2 sm:grid-cols-[160px_90px_minmax(0,1fr)_110px] sm:items-start">
                  {/* Col 1: Name */}
                  <div className="min-w-0 font-medium">{c.name}</div>

                  {/* Col 2: Surname */}
                  <div className="min-w-0 text-xs text-muted-foreground sm:pt-1">
                    {c.surname}
                  </div>

                  {/* Col 3: Wallets + tags */}
                  <div className="min-w-0">
                    {(c as any).wallets?.length > 0 && (
                      <div className="space-y-1">
                        {(c as any).wallets.map((w: Wallet, idx: number) => (
                          <div
                            key={idx}
                            className="text-xs text-muted-foreground font-mono break-words sm:truncate sm:break-normal"
                            title={w.address}
                          >
                            {CHAIN_NAMES[w.chainId] ?? w.chainId}: {w.address}
                          </div>
                        ))}
                      </div>
                    )}

                    {c.tags && c.tags?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                        {c.tags.map(tag => (
                          <span key={tag} className="rounded-full border border-border px-2 py-0.5">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Col 4: Actions */}
                  <div className="justify-self-start sm:justify-self-end">
                    <details className="relative inline-block">
                      <summary className="cursor-pointer list-none rounded-md border border-border bg-background px-3 py-2.5 text-sm sm:px-2 sm:py-1 sm:text-xs">
                        Actions
                      </summary>

                      <div className="absolute left-0 sm:right-0 sm:left-auto mt-1 w-40 rounded-md border border-border bg-background shadow-lg z-50">
                        <button
                          className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-muted"
                          onClick={(e) => {
                            (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                            openEditModal(c);
                          }}
                        >
                          Edit
                        </button>

                        <button
                          className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-muted"
                          onClick={(e) => {
                            (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                            updateAddressFromContact(c, !(addressMap[c.id]?.isVisible ?? true));
                          }}
                        >
                          {(addressMap[c.id]?.isVisible ?? true) ? "Hide" : "Show"}
                        </button>
                        <div className="my-1 border-t border-border" />

                        <button
                          className="block w-full px-4 py-3 text-left text-sm text-red-600 sm:px-3 sm:py-2 sm:text-xs hover:bg-muted"
                          onClick={(e) => {
                            (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                            setContactToDelete(c.id);
                          }}
                        >
                          Remove
                        </button>
                        <div className="my-1 border-t border-border" />
                        <button
                          type="button"
                          className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-muted"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setQrPayload(buildContactShare(c));
                          }}
                        >
                          Share
                        </button>
                      </div>
                    </details>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Modal */}
      {isModalOpen ? createPortal(
        <div
          className="bg-background/80 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
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
                    className="rounded-md border px-3 py-2.5 text-sm sm:px-2 sm:py-1 sm:text-xs"
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
                      className="grid gap-2 rounded-md border px-2 py-2"
                    >
                      {/* Row 1: chain + remove */}
                      <div className="flex items-center justify-between gap-2">
                        <select
                          className="h-11 sm:h-8 w-28 rounded-md border px-2 text-sm sm:text-xs"
                          value={w.chainId}
                          onChange={(e) => handleWalletChange(idx, "chainId", Number(e.target.value))}
                        >
                          {Object.entries(CHAIN_NAMES).map(([id, label]) => (
                            <option key={id} value={id}>
                              {label}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          className="shrink-0 whitespace-nowrap text-sm sm:text-[11px] text-red-600 underline"
                          onClick={() => handleRemoveWalletRow(idx)}
                        >
                          Remove
                        </button>
                      </div>

                      {/* Row 2: address */}
                      <input
                        className="w-full rounded-md border px-3 py-2.5 text-sm sm:px-2 sm:py-1 sm:text-xs font-mono"
                        placeholder="0x..."
                        value={w.address}
                        onChange={(e) => handleWalletChange(idx, "address", e.target.value)}
                      />
                    </div>
                  ))}

                </div>

                <button
                  type="button"
                  className="mt-1 rounded-md border px-3 py-2.5 text-sm sm:px-2 sm:py-1 sm:text-xs"
                  onClick={handleAddWalletRow}
                >
                  + Add wallet
                </button>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs font-medium text-background"
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
      {contactToDelete ? createPortal(
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(6px)",

            // Make the overlay scrollable and safe on mobile
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            padding: 16,

            // Use dvh to avoid mobile viewport bugs
            minHeight: "100dvh",

            // Center on desktop, bottom on mobile
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(448px, calc(100dvw - 32px))",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",

              // Ensure it’s visible even if theme classes are missing
              background: "#fff",
              color: "#111",

              // Don’t exceed viewport
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
            }}
          >
            <h2 className="text-base font-semibold">Delete contact?</h2>
            <p className="mt-2 text-sm text-muted">
              This will delete the contact and remove it from your address book. This action cannot be undone.
            </p>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-2"
                onClick={() => setContactToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-2 text-background"
                onClick={() => {
                  if (contactToDelete) {
                    deleteContact(contactToDelete);
                  }
                  setContactToDelete(null);
                }}
              >
                Yes, delete contact
              </button>
            </div>
          </div>
        </div>,
        document.body
      ) : null
      }

      {/* When qrPayload set, show QR modal */}
      {qrPayload && (
        <ShareQrModal
          payload={qrPayload}
          onClose={() => setQrPayload(null)}
        />
      )}

    </div>
  );
}
