import * as React from "react";
import { createPortal } from "react-dom";

export type SortOption = { value: string; label: string };

export type FiltersDropdownProps = {
  sortOptions: SortOption[];
  sortMode: string;
  setSortMode: (v: any) => void;
  tagSearch: string;
  setTagSearch: (v: string) => void;
  setTags: (tags: string[]) => void;
  tagMode: "any" | "all";
  setTagSearchMode: (v: "any" | "all") => void;
};

export function FiltersDropdown({
  sortOptions,
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
    const width = Math.min(360, window.innerWidth - margin * 2);
    const top = r.bottom + 8;
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

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

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
        className="h-11 sm:h-9 whitespace-nowrap rounded-md border border-border bg-card px-3 text-sm text-foreground"
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
                className="h-11 sm:h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value as any)}
              >
                {sortOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <div className="my-3 border-t border-border" />

              <div className="mb-2 text-sm font-semibold">Filter by tags</div>
              <input
                className="h-11 sm:h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground placeholder:text-muted"
                placeholder="Tags separated by space or comma…"
                value={tagSearch}
                onChange={(e) => {
                  const raw = e.target.value;
                  setTagSearch(raw);
                  setTags(
                    raw
                      .split(/[\s,]+/)
                      .map((t) => t.trim())
                      .filter(Boolean)
                  );
                }}
              />

              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-muted">Mode</span>
                <select
                  className="h-11 sm:h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  value={tagMode}
                  onChange={(e) => setTagSearchMode(e.target.value as "any" | "all")}
                >
                  <option value="any">Match any</option>
                  <option value="all">Match all</option>
                </select>

                <button
                  type="button"
                  className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
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
                  className="h-11 sm:h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground"
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
