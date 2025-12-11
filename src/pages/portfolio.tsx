import * as React from "react";
import { useFolioList } from "../hooks/useFolioList";
import { PortfolioStore, Folio } from "@/storage/folioStore";
import { sortPortfolio } from "@/lib/folioSorting";
import { useCoinList } from "@/hooks/useCoinList";
import { Coin } from "@/storage/coinStore"; 
import { useMemo } from "react";

export function Folios() {
  const [query, setQuery] = React.useState("");
  const [sortMode, setSortMode] = React.useState< "createdDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc" | "nameAsc" | "nameDesc" | "coinSymbolAsc" | "coinSymbolDesc" | "coinBalanceAsc" | "coinBalanceDesc" >(
    "nameAsc"
  );
  const [secondarySortMode, setSecondarySortMode] = React.useState< "createdDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc" | "nameAsc" | "nameDesc" | "coinSymbolAsc" | "coinSymbolDesc" | "coinBalanceAsc" | "coinBalanceDesc" >(
    "coinBalanceDesc"
  );
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagMode, setTagSearchMode] = React.useState("any");
  const [tagSearch, setTagSearch] = React.useState<string>("");
  const [chainId, setChainId] = React.useState<number>(0);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingFolio, setEditingFolio] = React.useState<Folio | null>(null);

  // Form state for modal
  const [formName, setFormName] = React.useState("");

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
      loading: cLoading,
      error: cError,
      addCoin,
      deleteCoin,
      updateCoin,
    } = useCoinList({ query, sortMode: "nameAsc", tags, tagMode, standard: "", chainId });
  
  const {
    folios,
    loading,
    error,
    addFolio,
    deleteFolio,
    updateFolio,
  } = useFolioList({ query, sortMode: "createdAsc", chainId });

  // Combine folios and coins into portfolio view
  const mapPortfolio = React.useMemo(() => {
    const portfolio: PortfolioStore[] = [];

    for (const folio of folios) {
      const walletCount = folio.wallet?.length ?? 0;

      if (walletCount > 0) {
        for (let i = 0; i < walletCount; i++) {
          portfolio.push({
            folioId: folio.id,
            coinId: folio.wallet?.[i]?.coin ?? "",
            walletId: i,
          });
        }
      } else {
        portfolio.push({
          folioId: folio.id,
          coinId: "",
          walletId: -1,
        });
      }
    }

    return portfolio;
  }, [folios, coins]);

  const sortedPortfolio = React.useMemo(() => {
    return sortPortfolio(mapPortfolio, folios, coins, sortMode);
  }, [mapPortfolio, folios, coins, sortMode]);

  function formatBalance(balance: bigint, decimals: number): string {
    if (decimals <= 0) return balance.toString();

    const negative = balance < 0n;
    const value = negative ? -balance : balance;

    const base = 10n;
    const factor = base ** BigInt(decimals);

    const integer = value / factor;
    const fraction = value % factor;

    let fractionStr = fraction.toString().padStart(decimals, "0");
    // trim trailing zeros in fraction part
    fractionStr = fractionStr.replace(/0+$/, "");

    const result =
      integer.toString() + (fractionStr.length > 0 ? "." + fractionStr : "");

    return negative ? "-" + result : result;
  }

  // --- Modal helpers ---------------------------------------------------------

  function resetForm() {
    setFormName("");
  }

  function openAddModal() {
    resetForm();
    setIsModalOpen(true);
  }

  function openEditModal(folio: Folio) {
    setFormName(folio.name ?? "");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = formName.trim();
    if (!trimmedName) return; // you can show a validation message if you like

    const payload: any = {
      name: trimmedName,
    };

    if (editingFolio) {
      await updateFolio(editingFolio.id, payload);
    } else {
      const domainDetails = {
        // fetch domain details and complete this
        address: "0x0000000000000000000000000000000000000000",
        chainId: 1,
        paymaster: "0x0000000000000000000000000000000000000000",
        type: 0,
        bundler: "0x0000000000000000000000000000000000000000",
        // add logic for wallet discovery using coins filtered by chainId
      } 
      await addFolio({...payload, ...domainDetails });
    }

    closeModal();
  }

  if (loading) return <div className="p-4">Loading coins…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-lg font-semibold">Portfolio</h1>

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
            onChange={e => setSortMode(e.target.value as any)} // sort by secondary and then primary so need holder
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
          <select
            className="rounded-md border px-2 py-1 text-sm"
            value={secondarySortMode}
            onChange={e => setSecondarySortMode(e.target.value as any)}  // sort by secondary and then primary so need holder
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
            placeholder="Filter by coin tags (comma-separated)…"
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

      {mapPortfolio.length === 0 ? (
        <div className="text-sm text-neutral-500">
          No accounts created yet. Click &quot;Create Account&quot; to get started.
        </div>
      ) : (
        <ul className="space-y-2">
          {mapPortfolio.map(item => {
          // Look up associated folio and coin
          const folio = folios.find(f => f.id === item.folioId);
          const coin = coins.find(c => c.id === item.coinId);
          const wallet = folio?.wallet?.[item.walletId];

          const folioName = folio?.name ?? item.folioId;
          const coinSymbol = coin?.symbol ?? "—";
          const chainName =
            folio && CHAIN_NAMES[folio.chainId]
              ? CHAIN_NAMES[folio.chainId]
              : folio
              ? `Chain ${folio.chainId}`
              : "Unknown chain";

          const balanceStr =
            wallet && coin
              ? formatBalance(wallet.balance, coin.decimals)
              : "0";

          return (
            <li
              key={`${item.folioId}-${item.coinId}-${item.walletId}`}
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  {/* Folio name */}
                  <span className="font-medium">{folioName}</span>
                </div>

                {/* Coin symbol */}
                <div className="text-xs text-neutral-500">{coinSymbol}</div>

                {/* Chain name */}
                <div className="text-xs text-neutral-500">{chainName}</div>

                {/* Wallet balance */}
                <div className="text-xs text-neutral-500">
                  Balance: {balanceStr} {coinSymbol}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 text-xs">
                {/* Keep these if you still want actions, wired to the folio */}
                <button
                  className="underline"
                  disabled={!folio}
                  onClick={() => folio && openEditModal(folio)}
                >
                  Edit Label
                </button>
                <button
                  className="text-red-600 underline"
                  onClick={() => deleteFolio(item.folioId)}
                >
                  Remove Account
                </button>

                <span className="text-[10px] text-neutral-500">
                  wallet #{item.walletId}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      )}

{/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-lg bg-white p-4 shadow-lg">
            <h2 className="mb-3 text-base font-semibold">
              {editingFolio ? "Change Label" : "Create Account"}
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
                  {editingFolio ? "Save changes" : "Create account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
