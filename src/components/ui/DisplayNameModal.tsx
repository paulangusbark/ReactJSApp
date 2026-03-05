import * as React from "react";
import { createPortal } from "react-dom";

export function DisplayNameModal({
  open,
  initialValue,
  onClose,
  onSave,
}: {
  open: boolean;
  initialValue: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = React.useState(initialValue ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) setName(initialValue ?? "");
  }, [open, initialValue]);

  if (!open || typeof document === "undefined") return null;

  const trimmed = (name ?? "").trim();
  const canSave = trimmed.length >= 2;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483646,
          background: "rgba(0,0,0,0.35)",
          backdropFilter: "blur(6px)",
        }}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        className="
    rounded-2xl
    border border-neutral-200
    bg-[#fffdf7]        /* soft ivory */
    text-neutral-900
    shadow-2xl
    backdrop-blur-none
  "
        style={{
          position: "fixed",
          zIndex: 2147483647,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(420px, calc(100vw - 32px))",
          padding: 20,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-lg font-semibold">Set display name</div>
        <div className="mt-1 text-sm text-neutral-600">
          Set the name used for profile sharing
        </div>

        <input
          className="mt-3 w-full rounded border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Paul Bark"
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2"></div><br/>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="h-9 rounded-md border border-border bg-card px-3 text-sm hover:bg-primary hover:text-primary-foreground" onClick={onClose} disabled={saving}>
            &nbsp;Cancel&nbsp;
          </button>&nbsp;
          <button
            type="button"
            className="h-9 rounded-md bg-primary px-3 text-sm text-primary-foreground"
            disabled={!canSave || saving}
            onClick={async () => {
              setSaving(true);
              try {
                await onSave(trimmed);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
          >
            &nbsp;{saving ? "Saving…" : "Save"}&nbsp;
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
