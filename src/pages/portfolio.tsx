import * as React from "react";
import { useFolioList } from "../hooks/useFolioList";
import { PortfolioStore, Folio } from "@/storage/folioStore";
import { sortPortfolio } from "@/lib/folioSorting";
import { useCoinList } from "@/hooks/useCoinList";
import { Wallets } from "@/lib/wallets";
import { getAddress } from "@/storage/keyStore";
import { Address } from "viem";
import { useDomains } from "@/hooks/useDomains";
import { createPortal } from "react-dom";

export function Folios() {
  const [query, setQuery] = React.useState("");
  const [primarySortMode, setPrimarySortMode] = React.useState<"createdDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc" | "nameAsc" | "nameDesc" | "coinSymbolAsc" | "coinSymbolDesc" | "coinBalanceAsc" | "coinBalanceDesc">(
    "nameAsc"
  );
  const [secondarySortMode, setSecondarySortMode] = React.useState<"createdDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc" | "nameAsc" | "nameDesc" | "coinSymbolAsc" | "coinSymbolDesc" | "coinBalanceAsc" | "coinBalanceDesc">(
    "coinBalanceDesc"
  );
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagMode, setTagSearchMode] = React.useState("any");
  const [tagSearch, setTagSearch] = React.useState<string>("");
  const [chainId, setChainId] = React.useState<number>(0);

  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [editingFolio, setEditingFolio] = React.useState<Folio | null>(null);
  const [folioToDelete, setFolioToDelete] = React.useState<string | null>(null);
  const [selectDomain, setSelectDomain] = React.useState<any>(null);

  // Form state for modal
  const [formName, setFormName] = React.useState("");

  const CHAIN_NAMES: Record<number, string> = {
    1: "Ethereum",
    11155111: "Sepolia",
    31337: "Local",
  };

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

  const {
    domains,
    loading: dLoading,
    error: dError,
    addDomain,
    updateDomain,
    deleteDomain,
    clearDomain,
  } = useDomains();

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

  const sortedPortfolio = React.useMemo(() => {
    return sortPortfolio(mapPortfolio, folios, coins, primarySortMode, secondarySortMode);
  }, [mapPortfolio, folios, coins, primarySortMode, secondarySortMode]);

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

  // --- Filtering and sorting ----------------------------------------------------

  type FiltersDropdownProps = {
    primarySortMode: string;
    setPrimarySortMode: (v: any) => void;

    secondarySortMode: string;
    setSecondarySortMode: (v: any) => void;

    tagSearch: string;
    setTagSearch: (v: string) => void;

    setTags: (tags: string[]) => void;

    tagMode: "any" | "all";
    setTagSearchMode: (v: "any" | "all") => void;
  };

  function FiltersDropdown({
    primarySortMode,
    setPrimarySortMode,
    secondarySortMode,
    setSecondarySortMode,
    tagSearch,
    setTagSearch,
    setTags,
    tagMode,
    setTagSearchMode,
  }: FiltersDropdownProps) {
    const [open, setOpen] = React.useState(false);
    const btnRef = React.useRef<HTMLButtonElement | null>(null);

    const [pos, setPos] = React.useState<{ top: number; left: number; width: number }>({
      top: 0,
      left: 0,
      width: 320,
    });

    const close = () => setOpen(false);

    const updatePos = React.useCallback(() => {
      if (!btnRef.current) return;

      const r = btnRef.current.getBoundingClientRect();
      const margin = 8;

      // panel width adapts to viewport (fits small screens)
      const width = Math.min(360, window.innerWidth - margin * 2);

      const top = r.bottom + 8;

      // Prefer right-align to button, but clamp inside viewport
      const preferredLeft = r.right - width;
      const left = Math.min(
        Math.max(margin, preferredLeft),
        window.innerWidth - width - margin
      );

      setPos({ top, left, width });
    }, []);

    const toggle = () => {
      const next = !open;
      if (next) updatePos();
      setOpen(next);
    };

    // close on Escape
    React.useEffect(() => {
      if (!open) return;
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") close();
      };
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [open]);

    // keep anchored to button on resize/scroll
    React.useEffect(() => {
      if (!open) return;
      window.addEventListener("resize", updatePos);
      window.addEventListener("scroll", updatePos, true);
      return () => {
        window.removeEventListener("resize", updatePos);
        window.removeEventListener("scroll", updatePos, true);
      };
    }, [open, updatePos]);

    return (
      <>
        <button
          ref={btnRef}
          type="button"
          className="h-9 whitespace-nowrap rounded-md border border-border bg-card px-3 text-sm text-foreground"
          onClick={toggle}
        >
          &nbsp;Sort / Filter&nbsp;
        </button>

        {open &&
          typeof document !== "undefined" &&
          createPortal(
            <>
              {/* Backdrop */}
              <div
                onClick={close}
                style={{
                  position: "fixed",
                  inset: 0,
                  zIndex: 9998,
                  background: "rgba(0,0,0,0.35)",
                }}
              />

              {/* Panel */}
              <div
                className="rounded-xl border border-border bg-card shadow-lg"
                style={{
                  position: "fixed",
                  zIndex: 9999,
                  top: pos.top,
                  left: pos.left,
                  width: pos.width,
                  padding: 12,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-2 text-sm font-semibold">Sort</div>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  value={primarySortMode}
                  onChange={(e) => setPrimarySortMode(e.target.value as any)}
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

                <div className="mb-2 text-sm font-semibold">Sort</div>
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  value={secondarySortMode}
                  onChange={(e) => setSecondarySortMode(e.target.value as any)}
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

                <div className="my-3 border-t border-border" />

                <div className="mb-2 text-sm font-semibold">Filter by tags</div>
                <input
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground placeholder:text-muted"
                  placeholder="Comma-separated tags…"
                  value={tagSearch}
                  onChange={(e) => {
                    const raw = e.target.value;
                    setTagSearch(raw);

                    const tokens = raw
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean);

                    setTags(tokens);
                  }}
                />

                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-muted">Mode</span>
                  <select
                    className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                    value={tagMode}
                    onChange={(e) => setTagSearchMode(e.target.value as "any" | "all")}
                  >
                    <option value="any">Match any</option>
                    <option value="all">Match all</option>
                  </select>

                  <button
                    type="button"
                    className="h-9 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
                    onClick={() => {
                      setTagSearch("");
                      setTags([]);
                      setTagSearchMode("any");
                    }}
                  >
                    Clear
                  </button>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground"
                    onClick={close}
                  >
                    Done
                  </button>
                </div>
              </div>
            </>,
            document.body
          )}
      </>
    );
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
    setEditingFolio(folio);
    setFormName(folio.name ?? "");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    resetForm();
  }

  React.useEffect(() => {
    if (!selectDomain && domains.length) setSelectDomain(domains[0]);
  }, [selectDomain, domains]);

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
      const sender = await getAddress(`default`);  //TODO: replace with uuid from auth
      if (!sender) {
        console.error("No sender address available for new folio");
        return;
      }
      const newWallet = Wallets({
        sender: sender as Address,
        domain: selectDomain.name,
        salt: "default", // replace with actual salt
      });
      const domainDetails = {
        // fetch domain details and complete this
        address: sender,
        chainId: selectDomain.chainId,
        paymaster: selectDomain.paymaster,
        type: 0, // not currently used
        bundler: selectDomain.bundler,
        // add logic for wallet discovery using coins filtered by chainId
      }
      if (newWallet) {
        await addFolio({ ...payload, ...domainDetails });
      }
    }

    closeModal();
  }

  if (loading) return <div className="p-4">Loading coins…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="shrink-0 text-2xl leading-tight font-semibold text-foreground">
        Portfolio
      </h1>

      <div className="flex flex-col gap-2">
        <select
          className="h-9 w-[140px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
          value={chainId}
          onChange={e => setChainId(e.target.value as any)}
        >
          {Object.entries(CHAIN_NAMES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <input
          className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted sm:max-w-md"
          placeholder="Search by name or address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <FiltersDropdown
            primarySortMode={primarySortMode}
            setPrimarySortMode={setPrimarySortMode}
            secondarySortMode={secondarySortMode}
            setSecondarySortMode={setSecondarySortMode}
            tagSearch={tagSearch}
            setTagSearch={setTagSearch}
            setTags={setTags}
            tagMode={tagMode as "any" | "all"}
            setTagSearchMode={setTagSearchMode}
          />&nbsp;

          <button
            className="h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={openAddModal}
          >
            &nbsp;Create account&nbsp;
          </button>
        </div>
      </div>

      {sortedPortfolio.length === 0 ? (
        <div className="text-sm text-muted">
          No accounts created yet. Click &quot;Create account&quot; to get started.
        </div>
      ) : (
        <ul className="space-y-2 overflow-visible">
          {sortedPortfolio.map(item => {
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
                className="
    grid gap-x-6 gap-y-2 rounded-lg border px-4 py-3 text-sm
    grid-cols-1
    sm:grid-cols-[80px_80px_1fr_110px] sm:items-start sm:px-8
  "
              >
                <div className="min-w-0">

                  <span className="font-medium">{folioName}</span>
                </div>
                <div className="min-w-0">

                  <div className="text-xs text-muted">{coinSymbol}</div>


                  <div className="text-xs text-muted">
                    Balance: {balanceStr} {coinSymbol}
                  </div>
                </div>
                <div className="min-w-0">

                  <div className="text-xs text-muted">{chainName}</div>
                </div>

                {/* Actions column */}
                <div className="justify-self-start sm:justify-self-end overflow-visible">
                  <details className="relative inline-block overflow-visible">
                    <summary className="cursor-pointer list-none rounded-md border bg-background px-2 py-1 text-xs">
                      Actions
                    </summary>

                    <div className="absolute left-0 mt-1 w-40 rounded-md border border-neutral-200 bg-background shadow-lg z-50">
                      <button
                        className="block w-full px-3 py-2 text-left text-xs hover:bg-muted"
                        onClick={(e) => {
                          (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                          folio && openEditModal(folio);
                        }}
                      >
                        Edit
                      </button>
                      <div className="my-1 border-t" />

                      <button
                        className="block w-full px-3 py-2 text-left text-xs text-red-600 hover:bg-muted"
                        onClick={(e) => {
                          (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                          setFolioToDelete(item.folioId);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </details>
                </div>

              </li>
            );
          })}
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
                  &nbsp;Cancel&nbsp;
                </button>&nbsp;
                <button
                  type="submit"
                  className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-background"
                >
                  &nbsp;{editingFolio ? "Save changes" : "Create account"}&nbsp;
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      ) : null}

      {/* Modal */}
      {folioToDelete && (
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
            <h2 className="text-base font-semibold">Delete account?</h2>
            <p className="mt-2 text-sm text-muted">
              This will remove the entire portfolio account and its balances from your list.
              This action cannot be undone and you could lose access to your assets.
            </p>

            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-md border px-3 py-1 text-sm"
                onClick={() => setFolioToDelete(null)}
              >
                &nbsp;Cancel&nbsp;
              </button>&nbsp;
              <button
                className="rounded-md bg-primary px-3 py-1 text-sm text-background"
                onClick={() => {
                  if (folioToDelete) {
                    deleteFolio(folioToDelete);
                  }
                  setFolioToDelete(null);
                }}
              >
                &nbsp;Yes, delete account&nbsp;
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}
