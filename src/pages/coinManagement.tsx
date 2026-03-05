import * as React from "react";
import { useCoinList } from "../hooks/useCoinList";
import { Coin } from "@/storage/coinStore";
import { useFolios } from "@/hooks/useFolios";
import { useDomains } from "@/hooks/useDomains";
import { FiltersDropdown } from "@/components/ui/FiltersDropdown";
import { createPortal } from "react-dom";
import { createPublicClient, http, erc20Abi, Address } from "viem";
import { ShareQrModal } from "../components/ui/ShareQrModal";
import { buildCoinShare } from "@/lib/shareBuilders";

export function Coins() {
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState<"nameAsc" | "createdDesc" | "nameDesc" | "symbolAsc" | "symbolDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc">(
    "nameAsc"
  );
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagMode, setTagSearchMode] = React.useState("any");
  const [tagSearch, setTagSearch] = React.useState<string>("");
  const [standard, setStandard] = React.useState("");
  const [chainId, setChainId] = React.useState<number>(0);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingCoin, setEditingCoin] = React.useState<Coin | null>(null);
  const [qrPayload, setQrPayload] = React.useState<any>(null);

  // Form state for modal
  const [formName, setFormName] = React.useState("");
  const [formSymbol, setFormSymbol] = React.useState("");
  const [formDecimals, setFormDecimals] = React.useState<number>(18);
  const [formAddress, setFormAddress] = React.useState("");
  const [formChainId, setFormChainId] = React.useState<number>(1);
  const [formStandard, setFormStandard] = React.useState("ERC20");
  const [formTags, setFormTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [itemToDelete, setItemToDelete] = React.useState<string | null>(null);

  const isBuiltin = editingCoin?.id.startsWith("builtin:") ?? false;

  const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
  const ENS_REGEX = /^[a-z0-9-]+\.eth$/i;

  const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
  };

  const EVM_STANDARDS = ["NATIVE", "ERC20", "ERC721", "ERC1155", "ERC3643", "ERC7943"];

  const {
    coins,
    loading,
    error,
    addCoin,
    deleteCoin,
    updateCoin,
  } = useCoinList({ query, sortMode, tags, tagMode, standard, chainId });

  const { folios: allFolios, updateFolio } = useFolios();
  const { domains } = useDomains();

  const [lookupLoading, setLookupLoading] = React.useState(false);
  const [lookupError, setLookupError] = React.useState<string | null>(null);
  const [lookupDone, setLookupDone] = React.useState(false);

  // --- Modal helpers ---------------------------------------------------------

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
    setFormSymbol("");
    setFormDecimals(18);
    setFormStandard("ERC20");
    setLookupLoading(false);
    setLookupError(null);
    setLookupDone(false);
  }

  async function handleLookup() {
    const address = formAddress.trim();
    if (!address) return;

    const domain = domains.find(d => d.chainId === formChainId);
    if (!domain) {
      setLookupError("No domain found for this chain");
      return;
    }

    setLookupLoading(true);
    setLookupError(null);
    setLookupDone(false);

    try {
      const client = createPublicClient({
        transport: http(domain.rpcUrl),
      });

      const contractAddr = address as Address;

      const [name, symbol, decimals] = await Promise.all([
        client.readContract({ address: contractAddr, abi: erc20Abi, functionName: "name" }).catch(() => null),
        client.readContract({ address: contractAddr, abi: erc20Abi, functionName: "symbol" }).catch(() => null),
        client.readContract({ address: contractAddr, abi: erc20Abi, functionName: "decimals" }).catch(() => null),
      ]);

      if (name == null && symbol == null && decimals == null) {
        setLookupError("Could not read contract — check address and chain");
        return;
      }

      if (typeof name === "string") setFormName(name);
      if (typeof symbol === "string") setFormSymbol(symbol);
      if (typeof decimals === "number") setFormDecimals(decimals);

      setLookupDone(true);
    } catch {
      setLookupError("Lookup failed — check RPC connection");
    } finally {
      setLookupLoading(false);
    }
  }

  function openAddModal() {
    setEditingCoin(null);
    resetForm();
    setIsModalOpen(true);
  }

  function openEditModal(coin: Coin) {
    setEditingCoin(coin);
    setFormName(coin.name ?? "");
    setFormAddress(coin.address ?? "");
    setFormChainId(coin.chainId ?? 1);
    setFormTags(coin.tags ?? []);
    setTagInput("");
    setFormSymbol(coin.symbol ?? "");
    setFormDecimals(coin.decimals ?? 18);
    setFormStandard(coin.type ?? "ERC20");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingCoin(null);
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
      symbol: formSymbol.trim() || undefined,
      decimals: formDecimals,
      type: formStandard,
    };

    if (editingCoin) {
      if (editingCoin.id.startsWith("builtin:")) {
        // Built-in coins: only tags can be changed
        await updateCoin(editingCoin.id, { tags: formTags });
      } else {
        await updateCoin(editingCoin.id, payload);
      }
    } else {
      const updatedCoins = await addCoin(payload);
      const newCoin = updatedCoins[updatedCoins.length - 1];
      // Add a wallet entry for this coin to all folios with matching chainId
      for (const folio of allFolios) {
        if (folio.chainId === Number(formChainId)) {
          const existing = folio.wallet ?? [];
          await updateFolio(folio.id, {
            wallet: [...existing, { coin: newCoin.id, balance: BigInt(0) }],
          });
        }
      }
    }

    closeModal();
  }

  if (loading) return <div className="p-4">Loading coins…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="shrink-0 text-2xl leading-tight font-semibold text-foreground">
        Coins
      </h1>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <input
          className="h-11 sm:h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted sm:max-w-md"
          placeholder="Search by name or address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="h-11 sm:h-9 w-[140px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
          value={chainId}
          onChange={e => setChainId(Number(e.target.value))}
        >
          <option value={0}>All chains</option>
          {Object.entries(CHAIN_NAMES).map(([id, label]) => (
            <option key={id} value={Number(id)}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="h-11 sm:h-9 w-[100px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
          value={standard}
          onChange={(e) => setStandard(e.target.value)}
        >
          <option value="">All standards</option>
          {EVM_STANDARDS.map((std) => (
            <option key={std} value={std}>
              {std}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <FiltersDropdown
            sortOptions={[
              { value: "nameAsc", label: "Name (A → Z)" },
              { value: "nameDesc", label: "Name (Z → A)" },
              { value: "symbolAsc", label: "Symbol (A → Z)" },
              { value: "symbolDesc", label: "Symbol (Z → A)" },
              { value: "chainIdAsc", label: "Chain ID (Low → High)" },
              { value: "chainIdDesc", label: "Chain ID (High → Low)" },
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
            &nbsp;+ Add coin&nbsp;
          </button>
        </div>
      </div>

      {coins.length === 0 ? (
        <div className="text-sm text-muted">
          No coins yet. Add one from the transaction screen or here.
        </div>
      ) : (
        <ul className="space-y-2">
          {coins.map((c) => (
            <li key={c.id} className="w-full">
              <div className="w-full rounded-lg border border-border bg-card px-4 py-3">
                <div className="grid gap-3 sm:gap-x-6 sm:gap-y-2 sm:grid-cols-[160px_90px_minmax(0,1fr)_110px] sm:items-start">
                  {/* Col 1 */}
                  <div className="min-w-0 font-medium flex items-center gap-1">
                    {c.name}
                    {c.id.startsWith("builtin:") && (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-muted-foreground shrink-0"
                        title="Built-in coin — core fields are protected"
                      >
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    )}
                  </div>

                  {/* Col 2 */}
                  <div className="min-w-0 text-xs text-muted-foreground sm:pt-1">
                    {c.symbol} ({c.type}) on {CHAIN_NAMES[c.chainId] ?? c.chainId}
                  </div>

                  {/* Col 3 */}
                  <div className="min-w-0">
                    {/* Address: wrap on mobile, truncate on desktop */}
                    <div
                      className="
            mt-0.5 text-xs text-muted-foreground font-mono
            break-words
            sm:truncate sm:break-normal
          "
                      title={c.address ?? ""}
                    >
                      {c.address}
                    </div>

                    {c.tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                        {c.tags.map((tag) => (
                          <span key={tag} className="rounded-full border border-border px-2 py-0.5">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {/* Col 4 (Actions) */}
                  <div className="justify-self-start sm:justify-self-end">
                    <details className="relative inline-block">
                      <summary className="cursor-pointer list-none rounded-md border border-border bg-background px-3 py-2.5 text-sm sm:px-2 sm:py-1 sm:text-xs">
                        Actions
                      </summary>

                      <div className="absolute left-0 sm:right-0 sm:left-auto mt-1 w-40 rounded-md border border-border bg-background shadow-lg z-50">
                        <button
                          className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                          onClick={(e) => {
                            (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                            openEditModal(c);
                          }}
                        >
                          Edit
                        </button>

                        {!c.id.startsWith("builtin:") && (
                          <>
                            <div className="my-1 border-t border-border" />
                            <button
                              className="block w-full px-4 py-3 text-left text-sm text-red-600 sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                              onClick={(e) => {
                                (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                                setItemToDelete(c.id);
                              }}
                            >
                              Remove
                            </button>
                          </>
                        )}

                        <div className="my-1 border-t border-border" />

                        <button
                          type="button"
                          className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setQrPayload(buildCoinShare(c));
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
              {editingCoin ? (isBuiltin ? "Edit coin tags" : "Edit coin") : "Add coin"}
            </h2>
            {isBuiltin && (
              <p className="mb-3 text-xs text-muted-foreground">
                This is a built-in coin. Core fields are read-only — you can only add or remove tags.
              </p>
            )}

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label className="text-xs font-medium">Chain</label>
                <select
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={formChainId}
                  onChange={e => {
                    setFormChainId(Number(e.target.value));
                    if (!editingCoin) {
                      setLookupDone(false);
                      setLookupError(null);
                    }
                  }}
                  disabled={!!editingCoin}
                >
                  {Object.entries(CHAIN_NAMES).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Standard</label>
                <select
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={formStandard}
                  onChange={(e) => setFormStandard(e.target.value)}
                  disabled={!!editingCoin}
                >
                  {EVM_STANDARDS.map((std) => (
                    <option key={std} value={std}>
                      {std}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Address</label>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-md border px-2 py-1 text-sm"
                    value={formAddress}
                    onChange={e => {
                      const trimmed = e.target.value.trim();
                      const isEthAddress = EVM_ADDRESS_REGEX.test(trimmed);
                      const isENS = ENS_REGEX.test(trimmed);
                      if (trimmed === "" || isEthAddress || isENS) {
                        setFormAddress(e.target.value);
                        if (!editingCoin) {
                          setLookupDone(false);
                          setLookupError(null);
                        }
                      }
                    }}
                    disabled={!!editingCoin}
                    required
                  />
                  {!editingCoin && formStandard !== "NATIVE" && (
                    <button
                      type="button"
                      className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs disabled:opacity-50"
                      onClick={handleLookup}
                      disabled={lookupLoading || !formAddress.trim()}
                    >
                      {lookupLoading ? "Looking up…" : "Lookup"}
                    </button>
                  )}
                </div>
                {lookupError && (
                  <div className="text-xs text-red-600 mt-1">{lookupError}</div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Name</label>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm disabled:opacity-60 disabled:bg-muted"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  disabled={!editingCoin || isBuiltin}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Symbol</label>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm disabled:opacity-60 disabled:bg-muted"
                  value={formSymbol}
                  onChange={e => setFormSymbol(e.target.value)}
                  disabled={!editingCoin || isBuiltin}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Decimals</label>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm disabled:opacity-60 disabled:bg-muted"
                  value={formDecimals}
                  onChange={e => setFormDecimals(Number(e.target.value))}
                  disabled={!editingCoin || isBuiltin}
                  required
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
                  className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs font-medium text-primary-foreground"
                  disabled={!editingCoin && !lookupDone && formStandard !== "NATIVE"}
                >
                  &nbsp;{editingCoin ? "Save changes" : "Create coin"}&nbsp;
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
            <h2 className="text-base font-semibold">Delete coin?</h2>
            <p className="mt-2 text-sm text-muted">
              This will remove the coin from all pages. This action cannot be undone.
            </p>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1"
                onClick={() => setItemToDelete(null)}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 text-primary-foreground"
                onClick={async () => {
                  if (itemToDelete) {
                    const coinToDelete = coins.find(c => c.id === itemToDelete);
                    if (coinToDelete) {
                      // Remove wallet entries for this coin from all folios with matching chainId
                      for (const folio of allFolios) {
                        if (folio.chainId === coinToDelete.chainId) {
                          const existing = folio.wallet ?? [];
                          const filtered = existing.filter(w => w.coin !== coinToDelete.id);
                          if (filtered.length !== existing.length) {
                            await updateFolio(folio.id, { wallet: filtered });
                          }
                        }
                      }
                    }
                    deleteCoin(itemToDelete);
                  }
                  setItemToDelete(null);
                }}
              >
                Yes, delete coin
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
