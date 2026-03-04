import * as React from "react";
import { useContractsList } from "../hooks/useContractList";
import { Contract } from "@/storage/contractStore";
import { useAddress } from "../hooks/useAddresses";
import { type Address } from "@/storage/addressStore";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { ShareQrModal } from "@/components/ui/ShareQrModal";
import { buildContractShare } from "@/lib/shareBuilders";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";

export function Contracts() {
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"nameAsc" | "createdDesc" | "nameDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc">(
    "nameAsc"
  );
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagMode, setTagSearchMode] = React.useState("any");
  const [tagSearch, setTagSearch] = React.useState<string>("");

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingContract, setEditingContract] = React.useState<Contract | null>(null);
  const [qrPayload, setQrPayload] = React.useState<any>(null);

  // Form state for modal
  const [formName, setFormName] = React.useState("");
  const [formAddress, setFormAddress] = React.useState("");
  const [formChainId, setFormChainId] = React.useState<number>(1);
  const [formTags, setFormTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [metaDataInput, setMetaDataInput] = React.useState("");
  const [itemToDelete, setItemToDelete] = React.useState<string | null>(null);

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
    contracts,
    loading,
    error,
    addContract,
    deleteContract,
    updateContract,
  } = useContractsList({ query, sortMode, tags, tagMode });

  // --- Modal helpers ---------------------------------------------------------

  function updateAddressFromContract(contract: Contract, isVisible: boolean) {
    if (addressMap[contract.id]) {
      storeUpdateAddress(contract.id, {
        name: contract.name,
        isVisible: isVisible,
        group: contract.tags ?? [],
      });
    } else {
      storeAddAddress({
        id: contract.id,
        name: contract.name,
        isVisible: isVisible,
        group: contract.tags ?? [],
        isContact: false,
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

  function resetForm() {
    setFormName("");
    setFormAddress("");
    setFormTags([]);
    setFormChainId(1);
    setTagInput("");
    setMetaDataInput("");
  }

  function openAddModal() {
    setEditingContract(null);
    resetForm();
    setIsModalOpen(true);
  }

  function openEditModal(contract: Contract) {
    setEditingContract(contract);
    setFormName(contract.name ?? "");
    setFormAddress(contract.address ?? "");
    setFormChainId(contract.chainId ?? 1);
    setFormTags(contract.tags ?? []);
    setTagInput("");
    if (contract.metadata?.ABI) {
      setMetaDataInput(JSON.stringify(contract.metadata.ABI, null, 2));
    } else {
      setMetaDataInput("");
    }
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingContract(null);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = formName.trim();
    if (!trimmedName) return; 

    const payload: any = {
      name: trimmedName,
      address: formAddress.trim() || undefined,
      chainId: formChainId || undefined,
      tags: formTags.length > 0 ? formTags : undefined,
      metadata: metaDataInput.trim() ? { ABI: JSON.parse(metaDataInput) } : undefined,
    };

    if (editingContract) {
      await updateContract(editingContract.id, payload);
    } else {
      await addContract(payload);
    }

    closeModal();
  }

  if (loading) return <div className="p-4">Loading contracts…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="shrink-0 text-2xl leading-tight font-semibold text-foreground">
        Smart Contracts
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
            &nbsp;+ Add contract&nbsp;
          </button>
        </div>
      </div>

      {contracts.length === 0 ? (
        <div className="text-sm text-muted">
          No contracts yet. Add one from the transaction screen or here.
        </div>
      ) : (
        <ul className="space-y-2">
          {contracts.map(c => (
            <li key={c.id} className="w-full">
              <div className="w-full rounded-lg border border-border bg-card px-4 py-3">
                <div className="grid gap-3 sm:gap-x-6 sm:gap-y-2 sm:grid-cols-[160px_90px_minmax(0,1fr)_110px] sm:items-start">
                  {/* Col 1: Name */}
                  <div className="min-w-0 font-medium">{c.name}</div>

                  {/* Col 2: Chain */}
                  <div className="min-w-0 text-xs text-muted-foreground sm:pt-1">
                    {CHAIN_NAMES[c.chainId] ?? c.chainId}
                  </div>

                  {/* Col 3: Address + tags */}
                  <div className="min-w-0">
                    <div
                      className="text-xs text-muted-foreground font-mono break-words sm:truncate sm:break-normal"
                      title={c.address ?? ""}
                    >
                      {c.address}
                    </div>

                    {c.tags && c.tags.length > 0 && (
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
                            updateAddressFromContract(c, !(addressMap[c.id]?.isVisible ?? true));
                          }}
                        >
                          {(addressMap[c.id]?.isVisible ?? true) ? "Hide" : "Show"}
                        </button>
                        <div className="my-1 border-t border-border" />

                        <button
                          className="block w-full px-4 py-3 text-left text-sm text-red-600 sm:px-3 sm:py-2 sm:text-xs hover:bg-muted"
                          onClick={(e) => {
                            (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                            setItemToDelete(c.id);
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
                            setQrPayload(buildContractShare(c));
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
              {editingContract ? "Edit contract" : "Add contract"}
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
                <label className="text-xs font-medium">Address or ENS</label>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={formAddress}
                  onChange={e => {
                    const trimmed = e.target.value.trim();

                    const isEthAddress = EVM_ADDRESS_REGEX.test(trimmed);
                    const isENS = ENS_REGEX.test(trimmed);

                    if (trimmed === "" || isEthAddress || isENS) {
                      setFormAddress(e.target.value);
                    }
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Chain</label>
                <select
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={formChainId}
                  onChange={e => setFormChainId(Number(e.target.value))}
                >
                  {Object.entries(CHAIN_NAMES).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Metadata input */}
              <div className="space-y-1">
                <label className="text-xs font-medium">ABI (JSON)</label>
                <textarea
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  rows={6}
                  value={metaDataInput}
                  onChange={e => {
                    const raw = e.target.value;
                    // allow clearing
                    if (raw.trim() === "") {
                      setMetaDataInput(raw);
                      return;
                    }

                    try {
                      const parsed = JSON.parse(raw);

                      // accept only if it's an object
                      if (typeof parsed === "object" && parsed !== null) {
                        setMetaDataInput(raw);
                      }
                      // else ignore (or show error)
                    } catch {
                      // invalid JSON, ignore or show error
                    }
                  }}
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



              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs"
                  onClick={closeModal}
                >
                  &nbsp;Cancel&nbsp;
                </button>&nbsp;
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs font-medium text-background"
                >
                  &nbsp;{editingContract ? "Save changes" : "Create contract"}&nbsp;
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      ) : null}

      {/* Modal */}
      {itemToDelete ? createPortal(
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
            <h2 className="text-base font-semibold">Delete contract?</h2>
            <p className="mt-2 text-sm text-muted">
              This will delete the contract and remove it from your address book. This action cannot be undone.
            </p>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1"
                onClick={() => setItemToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 text-background"
                onClick={() => {
                  if (itemToDelete) {
                    deleteContract(itemToDelete);
                  }
                  setItemToDelete(null);
                }}
              >
                Yes, delete contract
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
