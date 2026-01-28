import * as React from "react";
import { useAddressList } from "../hooks/useAddressList";
import { AddressSortableList } from "../components/ui/addressSortableList"
import { Address } from "@/storage/addressStore";
import { createPortal } from "react-dom";

export function AddressBook() {
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

  // --- Filtering and sorting ----------------------------------------------------

  type FiltersDropdownProps = {
    sortMode: string;
    setSortMode: (v: any) => void;

    tagSearch: string;
    setTagSearch: (v: string) => void;

    setTags: (tags: string[]) => void;

    tagMode: "any" | "all";
    setTagSearchMode: (v: "any" | "all") => void;
  };

  function FiltersDropdown({
    sortMode,
    setSortMode,
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
          Sort / Filter
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
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as any)}
                >
                  {/*<option value="custom">Template</option>*/}
                  <option value="nameAsc">Name (A → Z)</option>
                  <option value="nameDesc">Name (Z → A)</option>
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

  // Only display visible addresses
  const visibleAddresses = React.useMemo(
    () => address.filter((a) => a.isVisible !== false),
    [address]
  );

  async function handleReorder(updated: Address[]) {
    // updated is the *visible* list in the new order
    // assign indexOrder based on new position
    await Promise.all(
      updated.map((addr, idx) =>
        updateAddress(addr.id, { indexOrder: idx })
      )
    );
    // useAddressList should re-emit state after updates
  }

  async function handleHide(id: string) {
    await updateAddress(id, { isVisible: false });
    // On next render, visibleAddresses will filter it out
  }

  if (loading) return <div className="p-4">Loading Address…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="shrink-0 text-2xl leading-tight font-semibold text-foreground">
        Address Book
      </h1>

      <div className="flex flex-col gap-2">
        <input
          className="h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted sm:max-w-md"
          placeholder="Search by name or address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <FiltersDropdown
            sortMode={sortMode}
            setSortMode={setSortMode}
            tagSearch={tagSearch}
            setTagSearch={setTagSearch}
            setTags={setTags}
            tagMode={tagMode as "any" | "all"}
            setTagSearchMode={setTagSearchMode}
          />
        </div>
      </div>

      {/*sortMode !== "custom" && (
        <p className="text-xs text-muted">
          Switch to <span className="font-semibold">Custom</span> to drag and
          reorder addresses manually.
        </p>
      )*/}

      <AddressSortableList
        items={visibleAddresses}
        sortMode={sortMode}
        onReorder={handleReorder}
        onHide={handleHide}
      />


    </div>
  );
}
