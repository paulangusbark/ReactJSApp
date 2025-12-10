import * as React from "react";
import { useCoinList } from "../hooks/useCoinList";
import { Coin } from "@/storage/coinStore";

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

  // Form state for modal
  const [formName, setFormName] = React.useState("");
  const [formSymbol, setFormSymbol] = React.useState("");   
  const [formDecimals, setFormDecimals] = React.useState<number>(18);
  const [formAddress, setFormAddress] = React.useState("");
  const [formChainId, setFormChainId] = React.useState<number>(1);
  const [formStandard, setFormStandard] = React.useState("ERC20");
  const [formTags, setFormTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");

  const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
  const ENS_REGEX = /^[a-z0-9-]+\.eth$/i;

  const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
    31337: "Local",
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

  // --- Modal helpers ---------------------------------------------------------

  function resetForm() {
    setFormName("");
    setFormAddress("");
    setFormTags([]);
    setFormChainId(1);
    setTagInput("");
    setFormSymbol("");
    setFormDecimals(18);
    setFormStandard("ERC20");
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
    if (!trimmedName) return; // you can show a validation message if you like

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
      await updateCoin(editingCoin.id, payload);
    } else {
      await addCoin(payload);
    }

    closeModal();
  }

  if (loading) return <div className="p-4">Loading coins…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Coins</h1>

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
            <option value="symbolAsc">Symbol (A → Z)</option>
            <option value="symbolDesc">Symbol (Z → A)</option>
            <option value="chainIdAsc">Chain ID (Low → High)</option>
            <option value="chainIdDesc">Chain ID (High → Low)</option>
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

      {coins.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No coins yet. Add one from the transaction screen or here.
        </div>
      ) : (
        <ul className="space-y-2">
          {coins.map(c => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{c.name}</span>
                </div>
                <div className="text-xs text-neutral-500">{c.symbol}</div>
                <div className="text-xs text-neutral-500">{c.type}</div>
                <div className="text-xs text-neutral-500">
                    {CHAIN_NAMES[c.chainId] ?? c.chainId} - {c.address}
                </div>
              </div>

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
                  onClick={() => deleteCoin(c.id)}
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
              {editingCoin ? "Edit coin" : "Add coin"}
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
                <label className="text-xs font-medium">Symbol</label>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={formSymbol}
                  onChange={e => setFormSymbol(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">decimals</label>
                <input
                  className="w-full rounded-md border px-2 py-1 text-sm"
                  value={formDecimals}
                  onChange={e => setFormDecimals(e.target.value as any)}
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Chain</label>
                <select
                    className="w-full rounded-md border px-2 py-1 text-sm"
                    value={formChainId}
                    onChange={e => setFormChainId(e.target.value as any)}
                >
                    {Object.entries(CHAIN_NAMES).map(([id, label]) => (
                        <option key={id} value={id}>
                            {label}
                        </option>
                    ))}
                </select>
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
                  {editingCoin ? "Save changes" : "Create coin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
