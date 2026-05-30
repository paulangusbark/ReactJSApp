import * as React from "react";
import { createPortal } from "react-dom";
import { useRecoveryList } from "@/hooks/useRecoveryList";
import { Recovery, getAllRecoveries, updateRecovery as updateRecoveryInStore } from "@/storage/recoveryStore";
import { useFolios } from "@/hooks/useFolios";
import { useDomains } from "@/hooks/useDomains";
import { useContactsList } from "@/hooks/useContactList";
import { Contact } from "@/storage/contactStore";
import { Folio } from "@/storage/folioStore";
import { Domain } from "@/storage/domainStore";
import { useLocation } from "react-router-dom";
import { resolveEnsAddress } from "@/lib/ens";
import { RecoverySortMode } from "@/lib/recoverySorting";
import { ShareQrModal } from "@/components/ui/ShareQrModal";
import { buildRecoveryShare } from "@/lib/shareBuilders";
import { useTx, ADMIN_KEY, BundlerAPI } from "@/lib/submitTransaction";
import { encodeFunctionData, createPublicClient, http, keccak256, toHex, bytesToHex, type Hex, type Address } from "viem";
import { fetchRecoverableDetails } from "@/lib/fetchRecoverableDetails";
import { quantumAccountAbi, recoverableAbi } from "@/lib/abiTypes";
import { listKeypairs, getPublicKey, generateAndStoreKeypair, setKeypairFolioName, KeypairMeta } from "@/storage/keyStore";
import { addAttestation, AttestationRecord } from "@/storage/attestationStore";
import { addFolio, Wallet as FolioWallet } from "@/storage/folioStore";
import { getAllCoins } from "@/storage/coinStore";
import { useAttestations } from "@/hooks/useAttestations";
import { encodeSharePayload } from "@/lib/sharePayload";
import { downloadShareTextFile, downloadTextFile } from "@/lib/shareTextFormat";
import type { SharePayload } from "@/lib/sharePayload";
import QRCode from "react-qr-code";

// ── Constants ─────────────────────────────────────────────────────────────────

const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const ENS_REGEX = /^[a-z0-9-]+\.eth$/i;
const ENS_MAINNET_RPC = "https://cloudflare-eth.com";

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function buildContactMap(contacts: Contact[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of contacts) {
    const displayName = [c.name, c.surname].filter(Boolean).join(" ");
    for (const w of c.wallets ?? []) {
      if (w.address) {
        const walletLabel = w.name ? ` (${w.name})` : "";
        map.set(w.address.toLowerCase(), displayName + walletLabel);
      }
    }
  }
  return map;
}

function buildRecoveryExportText(
  r: Recovery,
  folioName: string | null,
  chainName: string,
  contactMap: Map<string, string>
): string {
  const lines: string[] = ["=== Cointrol Recovery Export ===", `Account (Folio): ${r.name}`];
  if (folioName) lines.push(`Folio Name: ${folioName}`);
  lines.push(
    `Network: ${chainName} (${r.chainId})`,
    `Recoverable Contract: ${r.recoverableAddress}`,
    `Threshold: ${r.threshold} of ${r.participants.length}`,
    `Status: ${r.status ? "Enabled" : "Disabled"}`,
    "",
    "Participants:"
  );
  if (r.participants.length === 0) {
    lines.push("  (none)");
  } else {
    r.participants.forEach((addr, i) => {
      const label = contactMap.get(addr.toLowerCase());
      lines.push(`  ${i + 1}. ${label ? `${label} (${addr})` : addr}`);
    });
  }
  lines.push("", `Exported: ${new Date().toISOString().slice(0, 10)}`);
  return lines.join("\n");
}


// ── Import prefill type ───────────────────────────────────────────────────────

type ImportPrefill = {
  name: string;
  chainId: number;
  recoverableAddress: string;
  paymaster?: string;
  threshold: number;
  status: boolean;
  participants: string[];
};

// ── Participant row type ───────────────────────────────────────────────────────

type PRow = {
  key: string;
  mode: "contact" | "manual";
  contactId: string;
  contactWalletIdx: number;
  input: string;
  resolved: string | null;
  resolving: boolean;
  error: string | null;
};

function emptyRow(): PRow {
  return {
    key: crypto.randomUUID(),
    mode: "manual",
    contactId: "",
    contactWalletIdx: 0,
    input: "",
    resolved: null,
    resolving: false,
    error: null,
  };
}

// ── prefillParticipantRows ────────────────────────────────────────────────────

function prefillParticipantRows(
  addresses: string[],
  contacts: Contact[],
  chainId: number,
): PRow[] {
  return addresses.map(addr => {
    const lc = addr.toLowerCase();
    for (const c of contacts) {
      const wallets = c.wallets ?? [];
      const idx = wallets.findIndex(
        w => w.chainId === chainId && w.address.toLowerCase() === lc
      );
      if (idx >= 0) {
        return {
          key: crypto.randomUUID(),
          mode: "contact" as const,
          contactId: c.id,
          contactWalletIdx: idx,
          input: "",
          resolved: wallets[idx].address,
          resolving: false,
          error: null,
        };
      }
    }
    return {
      key: crypto.randomUUID(),
      mode: "manual" as const,
      contactId: "",
      contactWalletIdx: 0,
      input: addr,
      resolved: addr,
      resolving: false,
      error: null,
    };
  });
}

// ── ParticipantRows sub-component ─────────────────────────────────────────────
// Shared between Create and Edit modals.

type ParticipantRowsProps = {
  rows: PRow[];
  contacts: Contact[];
  chainId: number;
  existingAddresses?: string[];
  onChange: (rows: PRow[]) => void;
  disabled?: boolean;
  showRemove?: boolean;
};

function ParticipantRows({ rows, contacts, chainId, existingAddresses = [], onChange, disabled, showRemove = true }: ParticipantRowsProps) {
  function setRow(key: string, patch: Partial<PRow>) {
    onChange(rows.map(r => (r.key === key ? { ...r, ...patch } : r)));
  }

  function removeRow(key: string) {
    onChange(rows.filter(r => r.key !== key));
  }

  function addRow() {
    onChange([...rows, emptyRow()]);
  }

  async function resolveInput(key: string, raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) {
      setRow(key, { resolved: null, error: null, resolving: false });
      return;
    }
    if (EVM_ADDRESS_REGEX.test(trimmed)) {
      setRow(key, { resolved: trimmed, error: null, resolving: false });
      return;
    }
    if (ENS_REGEX.test(trimmed)) {
      setRow(key, { resolving: true, error: null, resolved: null });
      const addr = await resolveEnsAddress(trimmed, ENS_MAINNET_RPC);
      if (addr) {
        setRow(key, { resolved: addr, error: null, resolving: false });
      } else {
        setRow(key, { resolved: null, error: `Could not resolve ENS name "${trimmed}"`, resolving: false });
      }
      return;
    }
    setRow(key, { resolved: null, error: "Enter a valid 0x address or ENS name (.eth)", resolving: false });
  }

  const eligibleContacts = contacts.filter(c =>
    (c.wallets ?? []).some(w => w.chainId === chainId)
  );

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const contact = contacts.find(c => c.id === row.contactId);
        const chainWallets = (contact?.wallets ?? [])
          .filter(w => w.chainId === chainId)
          .filter(w => !existingAddresses.includes(w.address));
        return (
          <div key={row.key} className="rounded-md border border-border p-2 space-y-1">
            <div className="flex gap-2 items-center">
              <select
                className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                value={row.mode === "contact" ? `contact:${row.contactId}` : "manual"}
                disabled={disabled}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "manual") {
                    setRow(row.key, { mode: "manual", contactId: "", input: "", resolved: null, error: null });
                  } else {
                    const cid = val.replace("contact:", "");
                    setRow(row.key, {
                      mode: "contact",
                      contactId: cid,
                      contactWalletIdx: 0,
                      input: "",
                      resolved: null,
                      error: null,
                    });
                  }
                }}
              >
                <option value="manual">Manual input / ENS</option>
                {eligibleContacts.map(c => (
                  <option key={c.id} value={`contact:${c.id}`}>
                    {[c.name, c.surname].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>

              {showRemove && (
                <button
                  type="button"
                  className="h-9 rounded-md border border-border bg-card px-2 text-sm text-red-600 hover:bg-primary hover:text-primary-foreground"
                  onClick={() => removeRow(row.key)}
                  disabled={disabled}
                >
                  Remove
                </button>
              )}
            </div>

            {row.mode === "contact" && row.contactId && (() => {
              if (chainWallets.length === 0) return <p className="text-xs text-muted">This contact has no eligible wallets on this chain.</p>;
              return (
                <select
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  value={row.contactWalletIdx}
                  disabled={disabled}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setRow(row.key, {
                      contactWalletIdx: idx,
                      resolved: chainWallets[idx]?.address ?? null,
                      error: null,
                    });
                  }}
                >
                  {chainWallets.map((w, i) => (
                    <option key={i} value={i}>
                      {w.name ? `${w.name} (${shortenAddress(w.address)})` : shortenAddress(w.address)}
                    </option>
                  ))}
                </select>
              );
            })()}

            {row.mode === "manual" && (
              <input
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground placeholder:text-muted"
                placeholder="0x address or ENS name (.eth)"
                value={row.input}
                disabled={disabled || row.resolving}
                onChange={async (e) => {
                  const raw = e.target.value;
                  setRow(row.key, { input: raw, resolved: null, error: null });
                  await resolveInput(row.key, raw);
                }}
              />
            )}

            {row.resolving && <p className="text-xs text-muted">Resolving ENS…</p>}
            {row.error && <p className="text-xs text-red-600">{row.error}</p>}
            {!row.error && row.resolved && (
              <p className="text-xs text-muted font-mono">{row.resolved}</p>
            )}
            {row.mode === "contact" && row.contactId && !row.resolved && (() => {
              const addr = chainWallets[row.contactWalletIdx]?.address;
              if (addr) {
                // auto-set resolved on render if not yet set
                setTimeout(() => setRow(row.key, { resolved: addr }), 0);
              }
              return null;
            })()}
          </div>
        );
      })}
      <button
        type="button"
        className="h-9 w-full rounded-md border border-dashed border-border bg-card px-3 text-sm text-foreground hover:bg-primary hover:text-primary-foreground"
        onClick={addRow}
        disabled={disabled}
      >
        Add participant
      </button>
    </div>
  );
}

// ── RecoveryFiltersDropdown ───────────────────────────────────────────────────

type RecoveryFiltersDropdownProps = {
  sortMode: RecoverySortMode;
  setSortMode: (v: RecoverySortMode) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
};

function RecoveryFiltersDropdown({
  sortMode,
  setSortMode,
  statusFilter,
  setStatusFilter,
}: RecoveryFiltersDropdownProps) {
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
    const width = Math.min(320, window.innerWidth - margin * 2);
    const top = r.bottom + 8;
    const preferredLeft = r.right - width;
    const left = Math.min(Math.max(margin, preferredLeft), window.innerWidth - width - margin);
    setPos({ top, left, width });
  }, []);

  const toggle = () => {
    const next = !open;
    if (next) updatePos();
    setOpen(next);
  };

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
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

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div
            onClick={close}
            style={{ position: "fixed", inset: 0, zIndex: 9998, background: "rgba(0,0,0,0.35)" }}
          />
          <div
            className="rounded-xl border border-border bg-card shadow-lg"
            style={{ position: "fixed", zIndex: 9999, top: pos.top, left: pos.left, width: pos.width, padding: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 text-sm font-semibold material-gold-text">Sort</div>
            <select
              className="h-11 sm:h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as RecoverySortMode)}
            >
              <option value="nameAsc">Name (A → Z)</option>
              <option value="nameDesc">Name (Z → A)</option>
              <option value="chainIdAsc">Chain ID (Low → High)</option>
              <option value="chainIdDesc">Chain ID (High → Low)</option>
              <option value="thresholdAsc">Threshold (Low → High)</option>
              <option value="thresholdDesc">Threshold (High → Low)</option>
              <option value="createdDesc">Newest first</option>
              <option value="createdAsc">Oldest first</option>
            </select>

            <div className="my-3 border-t border-border" />

            <div className="mb-2 text-sm font-semibold material-gold-text">Status</div>
            <select
              className="h-11 sm:h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
              <option value="consumed">Consumed</option>
            </select>

            <div className="mt-3 flex justify-between">
              <button
                type="button"
                className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
                onClick={() => { setSortMode("nameAsc"); setStatusFilter(""); }}
              >
                Clear
              </button>
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

// ── CreateRecoveryModal ───────────────────────────────────────────────────────

type CreateRecoveryModalProps = {
  folios: Folio[];
  contacts: Contact[];
  chainMap: Map<number, string>;
  domains: Domain[];
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    recoverableAddress: string | null;
    participants: string[];
    threshold: number;
    chainId: number;
    status: boolean;
  }) => Promise<void>;
};

function CreateRecoveryModal({
  folios,
  contacts,
  chainMap,
  domains,
  onClose,
  onSubmit,
}: CreateRecoveryModalProps) {
  const [selectedFolioId, setSelectedFolioId] = React.useState<string>(folios[0]?.id ?? "");
  const [threshold, setThreshold] = React.useState(1);
  const [participantRows, setParticipantRows] = React.useState<PRow[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const selectedFolio = folios.find(f => f.id === selectedFolioId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFolio) {
      setError("Please select a folio account.");
      return;
    }

    const resolvedParticipants: string[] = [];
    for (const row of participantRows) {
      const addr =
        row.mode === "contact"
          ? (contacts.find(c => c.id === row.contactId)?.wallets?.[row.contactWalletIdx]?.address ?? null)
          : row.resolved;

      if (!addr || !EVM_ADDRESS_REGEX.test(addr)) {
        setError("One or more participants have an unresolved or invalid address. Please fix before submitting.");
        return;
      }
      if (resolvedParticipants.includes(addr)) {
        setError(`Duplicate participant address: ${addr}`);
        return;
      }
      resolvedParticipants.push(addr);
    }

    if (threshold < 1 || threshold > Math.max(1, resolvedParticipants.length)) {
      setError(`Threshold must be between 1 and ${Math.max(1, resolvedParticipants.length)}.`);
      return;
    }

    const domain = domains.find(d => d.chainId === selectedFolio.chainId);
    if (!domain) {
      setError("No domain/RPC found for the selected chain.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const encoded = encodeFunctionData({
        abi: quantumAccountAbi,
        functionName: "createRecoverable",
        args: [
          BigInt(threshold),
          resolvedParticipants as `0x${string}`[],
        ],
      }) as Hex;

      const { startFlow } = useTx.getState();
      await startFlow({ folio: selectedFolio, encoded, domain, nonceKey: ADMIN_KEY });

      const txStatus = useTx.getState().status;
      if (txStatus.phase === "failed") {
        setError(txStatus.message ?? "Transaction failed.");
        return;
      }

      // Discover the new recoverable address by diffing on-chain list with local store.
      // Poll with retries because the bundler reports success as soon as the tx is submitted,
      // before the block is mined and the RPC reflects the updated contract state.
      let newAddress: string | null = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 3000));
          const publicClient = createPublicClient({ transport: http(domain.rpcUrl) });
          const onChainAddresses = await publicClient.readContract({
            address: selectedFolio.address as Address,
            abi: quantumAccountAbi,
            functionName: "getRecoverables",
          }) as Address[];
          const localRecoveries = await getAllRecoveries();
          const existingAddresses = new Set(
            localRecoveries
              .filter(r => r.name.toLowerCase() === selectedFolio.address.toLowerCase() && r.chainId === selectedFolio.chainId)
              .map(r => r.recoverableAddress.toLowerCase())
          );
          const found = onChainAddresses.find(a => !existingAddresses.has(a.toLowerCase())) ?? null;
          if (found !== null) { newAddress = found; break; }
        } catch {
          // Non-fatal — keep retrying; if all attempts fail, store with empty address
        }
      }

      await onSubmit({
        name: selectedFolio.address,
        recoverableAddress: newAddress,
        participants: resolvedParticipants,
        threshold,
        chainId: selectedFolio.chainId,
        status: newAddress !== null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch" as any,
        padding: 16,
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <div
        className="bg-background text-foreground"
        onClick={(e) => e.stopPropagation()}
        style={{
          marginTop: 32,
          marginBottom: 32,
          width: "min(480px, calc(100dvw - 32px))",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
      >
        <h2 className="mb-3 text-base font-semibold material-gold-text">Create Recoverable</h2>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-600">{error}</div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Folio account</label>
            {folios.length === 0 ? (
              <p className="text-xs text-muted">No folio accounts found. Create one in Portfolio first.</p>
            ) : (
              <select
                className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
                value={selectedFolioId}
                onChange={(e) => setSelectedFolioId(e.target.value)}
                disabled={submitting}
              >
                {folios.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.name} — {shortenAddress(f.address)} ({chainMap.get(f.chainId) ?? "Unknown"} {f.chainId})
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedFolio && (
            <div className="rounded-md border border-border bg-card px-3 py-2 text-xs space-y-0.5">
              <div><span className="text-muted">Chain:</span> {chainMap.get(selectedFolio.chainId) ?? "Unknown"} ({selectedFolio.chainId})</div>
              <div><span className="text-muted">Folio address:</span> <span className="font-mono">{selectedFolio.address}</span></div>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-medium">Threshold</label>
            <input
              type="number"
              min={1}
              max={Math.max(1, participantRows.length)}
              className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
              value={threshold}
              onChange={(e) => setThreshold(Math.max(1, Number(e.target.value)))}
              disabled={submitting}
            />
            <p className="text-xs text-muted">
              Number of participants required to approve recovery ({participantRows.length} participant{participantRows.length !== 1 ? "s" : ""} added).
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium">Participants</label>
            <ParticipantRows
              rows={participantRows}
              contacts={contacts}
              chainId={selectedFolio?.chainId ?? 0}
              onChange={setParticipantRows}
              disabled={submitting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs"
              onClick={onClose}
              disabled={submitting}
            >
              &nbsp;Cancel&nbsp;
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs font-medium text-primary-foreground disabled:opacity-50"
              disabled={submitting || folios.length === 0}
            >
              &nbsp;{submitting ? "Creating…" : "Create recoverable"}&nbsp;
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── ImportRecoveryModal ───────────────────────────────────────────────────────

type ImportRecoveryModalProps = {
  folios: Folio[];
  contacts: Contact[];
  chainMap: Map<number, string>;
  prefill: ImportPrefill | null;
  onClose: () => void;
  onSubmit: (input: {
    name: string;
    recoverableAddress: string | null;
    participants: string[];
    threshold: number;
    chainId: number;
    status: boolean;
  }) => Promise<void>;
};

function ImportRecoveryModal({
  folios,
  contacts,
  chainMap,
  prefill,
  onClose,
  onSubmit,
}: ImportRecoveryModalProps) {
  // ── Determine initial account type from prefill ──
  function resolveInitial() {
    if (!prefill) {
      return {
        accountType: "manual" as "manual" | "folio" | "contact",
        selectedFolioId: folios[0]?.id ?? "",
        contactId: "",
        contactWalletIdx: 0,
        manualName: "",
        manualChainId: 0,
      };
    }
    const matchFolio = folios.find(
      f => f.address.toLowerCase() === prefill.name.toLowerCase() && f.chainId === prefill.chainId
    );
    if (matchFolio) {
      return {
        accountType: "folio" as const,
        selectedFolioId: matchFolio.id,
        contactId: "",
        contactWalletIdx: 0,
        manualName: "",
        manualChainId: 0,
      };
    }
    for (const c of contacts) {
      const idx = (c.wallets ?? []).findIndex(
        w => w.chainId === prefill.chainId && w.address.toLowerCase() === prefill.name.toLowerCase()
      );
      if (idx >= 0) {
        return {
          accountType: "contact" as const,
          selectedFolioId: "",
          contactId: c.id,
          contactWalletIdx: idx,
          manualName: "",
          manualChainId: 0,
        };
      }
    }
    return {
      accountType: "manual" as const,
      selectedFolioId: "",
      contactId: "",
      contactWalletIdx: 0,
      manualName: prefill.name,
      manualChainId: prefill.chainId,
    };
  }

  const init = React.useMemo(resolveInitial, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [accountType, setAccountType] = React.useState<"manual" | "folio" | "contact">(init.accountType);
  const [selectedFolioId, setSelectedFolioId] = React.useState(init.selectedFolioId);
  const [contactId, setContactId] = React.useState(init.contactId);
  const [contactWalletIdx, setContactWalletIdx] = React.useState(init.contactWalletIdx);
  const [manualName, setManualName] = React.useState(init.manualName);
  const [manualChainId, setManualChainId] = React.useState(init.manualChainId);
  const [recoverableAddress, setRecoverableAddress] = React.useState(prefill?.recoverableAddress ?? "");
  const [threshold, setThreshold] = React.useState(prefill?.threshold ?? 1);
  const [status, setStatus] = React.useState(prefill?.status ?? false);
  const [participantRows, setParticipantRows] = React.useState<PRow[]>(() =>
    prefill ? prefillParticipantRows(prefill.participants, contacts, prefill.chainId) : []
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // ── Derived values ──
  const derivedName = React.useMemo((): string | null => {
    if (accountType === "folio") return folios.find(f => f.id === selectedFolioId)?.address ?? null;
    if (accountType === "contact") return (contacts.find(c => c.id === contactId)?.wallets ?? [])[contactWalletIdx]?.address ?? null;
    return EVM_ADDRESS_REGEX.test(manualName.trim()) ? manualName.trim() : null;
  }, [accountType, selectedFolioId, contactId, contactWalletIdx, manualName, folios, contacts]);

  const derivedChainId = React.useMemo((): number => {
    if (accountType === "folio") return folios.find(f => f.id === selectedFolioId)?.chainId ?? 0;
    if (accountType === "contact") return (contacts.find(c => c.id === contactId)?.wallets ?? [])[contactWalletIdx]?.chainId ?? 0;
    return manualChainId;
  }, [accountType, selectedFolioId, contactId, contactWalletIdx, manualChainId, folios, contacts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!derivedName) {
      setError("A valid account address is required.");
      return;
    }
    if (derivedChainId === 0) {
      setError("Please select a chain.");
      return;
    }

    const resolvedParticipants: string[] = [];
    for (const row of participantRows) {
      const addr =
        row.mode === "contact"
          ? (contacts.find(c => c.id === row.contactId)?.wallets?.[row.contactWalletIdx]?.address ?? null)
          : row.resolved;
      if (!addr || !EVM_ADDRESS_REGEX.test(addr)) {
        setError("One or more participants have an unresolved or invalid address.");
        return;
      }
      if (resolvedParticipants.includes(addr)) {
        setError(`Duplicate participant address: ${addr}`);
        return;
      }
      resolvedParticipants.push(addr);
    }

    if (threshold < 1 || threshold > Math.max(1, resolvedParticipants.length)) {
      setError(`Threshold must be between 1 and ${Math.max(1, resolvedParticipants.length)}.`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: derivedName,
        recoverableAddress: recoverableAddress.trim() || null,
        participants: resolvedParticipants,
        threshold,
        chainId: derivedChainId,
        status,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  const contactWallets = contacts.find(c => c.id === contactId)?.wallets ?? [];

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch" as any,
        padding: 16,
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <div
        className="bg-background text-foreground"
        onClick={(e) => e.stopPropagation()}
        style={{
          marginTop: 32,
          marginBottom: 32,
          width: "min(480px, calc(100dvw - 32px))",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
      >
        <h2 className="mb-3 text-base font-semibold material-gold-text">Import Recovery</h2>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-600">{error}</div>
          )}

          {/* ── Account name section ── */}
          <div className="space-y-2">
            <label className="text-xs font-medium">Account</label>
            <select
              className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
              value={accountType}
              disabled={submitting}
              onChange={(e) => setAccountType(e.target.value as "manual" | "folio" | "contact")}
            >
              <option value="manual">Manual address</option>
              <option value="folio">Folio account</option>
              <option value="contact">Contact wallet</option>
            </select>

            {accountType === "folio" && (
              folios.length === 0 ? (
                <p className="text-xs text-muted">No folio accounts found.</p>
              ) : (
                <select
                  className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
                  value={selectedFolioId}
                  disabled={submitting}
                  onChange={(e) => setSelectedFolioId(e.target.value)}
                >
                  {folios.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {shortenAddress(f.address)} ({chainMap.get(f.chainId) ?? f.chainId})
                    </option>
                  ))}
                </select>
              )
            )}

            {accountType === "contact" && (
              <>
                <select
                  className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
                  value={contactId}
                  disabled={submitting}
                  onChange={(e) => { setContactId(e.target.value); setContactWalletIdx(0); }}
                >
                  <option value="">Select a contact…</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>
                      {[c.name, c.surname].filter(Boolean).join(" ")}
                    </option>
                  ))}
                </select>
                {contactId && (
                  contactWallets.length === 0 ? (
                    <p className="text-xs text-muted">This contact has no wallets.</p>
                  ) : (
                    <select
                      className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
                      value={contactWalletIdx}
                      disabled={submitting}
                      onChange={(e) => setContactWalletIdx(Number(e.target.value))}
                    >
                      {contactWallets.map((w, i) => (
                        <option key={i} value={i}>
                          {w.name ? `${w.name} ` : ""}{shortenAddress(w.address)} — {chainMap.get(w.chainId) ?? `Chain ${w.chainId}`}
                        </option>
                      ))}
                    </select>
                  )
                )}
              </>
            )}

            {accountType === "manual" && (
              <>
                <input
                  className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
                  placeholder="0x account address"
                  value={manualName}
                  disabled={submitting}
                  onChange={(e) => setManualName(e.target.value)}
                />
                <select
                  className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
                  value={manualChainId}
                  disabled={submitting}
                  onChange={(e) => setManualChainId(Number(e.target.value))}
                >
                  <option value={0}>Select chain…</option>
                  {[...chainMap.entries()].map(([id, label]) => (
                    <option key={id} value={id}>{label} ({id})</option>
                  ))}
                </select>
              </>
            )}

            {derivedName && (
              <div className="rounded-md border border-border bg-card px-3 py-2 text-xs space-y-0.5">
                <div><span className="text-muted">Account address:</span> <span className="font-mono">{derivedName}</span></div>
                <div><span className="text-muted">Chain:</span> {chainMap.get(derivedChainId) ?? "Unknown"} ({derivedChainId})</div>
              </div>
            )}
          </div>


          {/* ── Recoverable address ── */}
          <div className="space-y-1">
            <label className="text-xs font-medium">
              Recoverable contract address{" "}
              <span className="text-muted font-normal">(leave blank if not yet deployed)</span>
            </label>
            <input
              className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
              placeholder="0x address or leave blank"
              value={recoverableAddress}
              disabled={submitting}
              onChange={(e) => setRecoverableAddress(e.target.value)}
            />
          </div>

          {/* ── Threshold ── */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Threshold</label>
            <input
              type="number"
              min={1}
              max={Math.max(1, participantRows.length)}
              className="w-full rounded-md border bg-background text-foreground px-2 py-1 text-sm"
              value={threshold}
              onChange={(e) => setThreshold(Math.max(1, Number(e.target.value)))}
              disabled={submitting}
            />
            <p className="text-xs text-muted">
              Number of participants required to approve recovery ({participantRows.length} participant{participantRows.length !== 1 ? "s" : ""} added).
            </p>
          </div>

          {/* ── Status ── */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Status</label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={status}
                onChange={(e) => setStatus(e.target.checked)}
                disabled={submitting}
                className="rounded"
              />
              <span className="text-sm">{status ? "Enabled" : "Disabled"}</span>
            </label>
          </div>

          {/* ── Participants ── */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Participants</label>
            <ParticipantRows
              rows={participantRows}
              contacts={contacts}
              chainId={derivedChainId}
              onChange={setParticipantRows}
              disabled={submitting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs"
              onClick={onClose}
              disabled={submitting}
            >
              &nbsp;Cancel&nbsp;
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs font-medium text-primary-foreground disabled:opacity-50"
              disabled={submitting}
            >
              &nbsp;{submitting ? "Adding…" : "Add item"}&nbsp;
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── EditRecoveryModal ─────────────────────────────────────────────────────────

type EditRecoveryModalProps = {
  recovery: Recovery;
  contacts: Contact[];
  contactMap: Map<string, string>;
  folioName: string | null;
  folio: Folio | null;
  domain: Domain | null;
  onClose: () => void;
  onUpdate: (patch: Partial<Omit<Recovery, "id" | "createdAt" | "paymaster" | "chainId" | "recoverableAddress" | "name">>) => Promise<void>;
};

type EditConfirm =
  | { type: "threshold"; value: number }
  | { type: "status"; value: boolean }
  | { type: "addParticipant"; address: string }
  | { type: "removeParticipant"; address: string };

function EditRecoveryModal({
  recovery,
  contacts,
  contactMap,
  folioName,
  folio,
  domain,
  onClose,
  onUpdate,
}: EditRecoveryModalProps) {
  const [threshold, setThreshold] = React.useState(recovery.threshold);
  const [status, setStatus] = React.useState(recovery.status);
  const [participants, setParticipants] = React.useState<string[]>(recovery.participants);

  const [addRow, setAddRow] = React.useState<PRow>(emptyRow());
  const [confirm, setConfirm] = React.useState<EditConfirm | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function doUpdate(
    patch: Partial<Omit<Recovery, "id" | "createdAt" | "paymaster" | "chainId" | "recoverableAddress" | "name">>,
    encoded: Hex,
    onSuccess?: () => void
  ) {
    setSubmitting(true);
    setError(null);
    try {
      const { startFlow } = useTx.getState();
      await startFlow({ folio: folio!, encoded, domain: domain! });
      const txStatus = useTx.getState().status;
      if (txStatus.phase === "failed") {
        setError(txStatus.message ?? "Transaction failed.");
        return;
      }
      await onUpdate(patch);
      onSuccess?.();
      setConfirm(null);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmAction() {
    if (!confirm) return;

    if (!folio || !domain) {
      setError("Cannot submit: folio or domain not found for this recovery.");
      return;
    }
    if (!recovery.recoverableAddress) {
      setError("Recoverable contract address not yet known. Use 'Fetch recoverable details' to sync on-chain state.");
      return;
    }

    const recov = recovery.recoverableAddress as `0x${string}`;

    if (confirm.type === "threshold") {
      const encoded = encodeFunctionData({ abi: quantumAccountAbi, functionName: "updateRecoverableThreshold",
        args: [recov, BigInt(confirm.value)] }) as Hex;
      await doUpdate({ threshold: confirm.value }, encoded, () => setThreshold(confirm.value));

    } else if (confirm.type === "status") {
      const fnName = confirm.value ? "enableRecoverable" : "disableRecoverable";
      const encoded = encodeFunctionData({ abi: quantumAccountAbi, functionName: fnName,
        args: [recov] }) as Hex;
      await doUpdate({ status: confirm.value }, encoded, () => setStatus(confirm.value));

    } else if (confirm.type === "removeParticipant") {
      const next = participants.filter(p => p !== confirm.address);
      const nextThreshold = Math.min(threshold, Math.max(1, next.length));
      const encoded = encodeFunctionData({ abi: quantumAccountAbi, functionName: "removeAddressFromRecoverable",
        args: [recov, confirm.address as `0x${string}`] }) as Hex;
      await doUpdate({ participants: next, threshold: nextThreshold }, encoded,
        () => { setParticipants(next); setThreshold(nextThreshold); });

    } else if (confirm.type === "addParticipant") {
      const next = [...participants, confirm.address];
      const encoded = encodeFunctionData({ abi: quantumAccountAbi, functionName: "addAddressToRecoverable",
        args: [recov, confirm.address as `0x${string}`] }) as Hex;
      await doUpdate({ participants: next }, encoded,
        () => { setParticipants(next); clearAddRow(); });
    }
  }

  function clearAddRow() {
    setAddRow(emptyRow());
  }

  function handleAddSubmit() {
    const row = addRow;
    const chainWallets = (contacts.find(c => c.id === row.contactId)?.wallets ?? [])
      .filter(w => w.chainId === recovery.chainId)
      .filter(w => !participants.includes(w.address));
    const addr =
      row.mode === "contact"
        ? (chainWallets[row.contactWalletIdx]?.address ?? null)
        : row.resolved;

    if (!addr || !EVM_ADDRESS_REGEX.test(addr)) {
      setError("The participant address is not valid or could not be resolved.");
      return;
    }
    if (participants.includes(addr)) {
      setError("This address is already a participant.");
      return;
    }
    setError(null);
    setConfirm({ type: "addParticipant", address: addr });
  }

  const confirmLabel = confirm
    ? confirm.type === "threshold"
      ? `Change threshold from ${recovery.threshold} to ${confirm.value}?`
      : confirm.type === "status"
        ? `${confirm.value ? "Enable" : "Disable"} this recoverable?`
        : confirm.type === "addParticipant"
          ? `Add participant ${shortenAddress(confirm.address)}?`
          : `Remove participant ${shortenAddress(confirm.address)}?`
    : "";

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !confirm) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        overflowY: "auto",
        WebkitOverflowScrolling: "touch" as any,
        padding: 16,
        minHeight: "100dvh",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
      }}
    >
      <div
        className="bg-background text-foreground"
        onClick={(e) => e.stopPropagation()}
        style={{
          marginTop: 32,
          marginBottom: 32,
          width: "min(520px, calc(100dvw - 32px))",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold material-gold-text">
            Edit Recovery — {folioName ?? shortenAddress(recovery.name)}
          </h2>
          <button
            type="button"
            className="text-sm text-muted hover:text-foreground"
            onClick={onClose}
            disabled={submitting}
          >
            Close
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-md border border-red-300 px-3 py-2 text-xs text-red-600">{error}</div>
        )}

        {!folio && (
          <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This recovery account is not in your folios. All actions are view-only.
          </div>
        )}

        {/* Confirmation overlay */}
        {confirm && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-3 space-y-3">
            <p className="text-sm font-medium text-amber-900">{confirmLabel}</p>
            <p className="text-xs text-amber-700">
              This will submit an on-chain transaction. The record will be updated once confirmed.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border px-3 py-1 text-xs"
                onClick={() => { setConfirm(null); setError(null); }}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                onClick={confirmAction}
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Confirm"}
              </button>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {/* ── Section A: Threshold ── */}
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="text-sm font-medium">Threshold</div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={Math.max(1, participants.length)}
                className="w-24 rounded-md border px-2 py-1 text-sm"
                value={threshold}
                onChange={(e) => setThreshold(Math.max(1, Number(e.target.value)))}
                disabled={submitting || !!confirm || !folio}
              />
              <span className="text-xs text-muted">of {participants.length} participant{participants.length !== 1 ? "s" : ""}</span>
              <button
                type="button"
                className="ml-auto rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                onClick={() => {
                  if (threshold === recovery.threshold) return;
                  setConfirm({ type: "threshold", value: threshold });
                }}
                disabled={submitting || !!confirm || threshold === recovery.threshold || threshold > participants.length || !folio}
              >
                Update threshold
              </button>
            </div>
            {threshold > participants.length && (
              <p className="text-xs text-red-600">Threshold cannot exceed the number of participants ({participants.length}).</p>
            )}
            {threshold !== recovery.threshold && !confirm && threshold <= participants.length && (
              <p className="text-xs text-amber-700">Unsaved: currently {recovery.threshold} on record.</p>
            )}
          </div>

          {/* ── Section B: Status ── */}
          <div className="rounded-md border border-border p-3 space-y-2">
            <div className="text-sm font-medium">Status</div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={status}
                  onChange={(e) => setStatus(e.target.checked)}
                  disabled={submitting || !!confirm || !folio}
                  className="rounded"
                />
                <span className="text-sm">{status ? "Enabled" : "Disabled"}</span>
              </label>
              <button
                type="button"
                className="ml-auto rounded-md border border-border bg-card px-3 py-1 text-xs hover:bg-primary hover:text-primary-foreground disabled:opacity-50"
                onClick={() => {
                  if (status === recovery.status) return;
                  setConfirm({ type: "status", value: status });
                }}
                disabled={submitting || !!confirm || status === recovery.status || !folio}
              >
                Update status
              </button>
            </div>
            {status !== recovery.status && !confirm && (
              <p className="text-xs text-amber-700">
                Unsaved: currently {recovery.status ? "enabled" : "disabled"} on record.
              </p>
            )}
          </div>

          {/* ── Section C: Participants ── */}
          <div className="rounded-md border border-border p-3 space-y-3">
            <div className="text-sm font-medium">Participants</div>

            {participants.length === 0 ? (
              <p className="text-xs text-muted">No participants yet.</p>
            ) : (
              <ul className="space-y-1">
                {participants.map((addr) => {
                  const label = contactMap.get(addr.toLowerCase());
                  return (
                    <li key={addr} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
                      <span className="flex-1 text-xs font-mono">
                        {label && <span className="font-sans font-medium mr-1">{label}</span>}
                        {shortenAddress(addr)}
                      </span>
                      <button
                        type="button"
                        className="rounded border border-red-200 px-2 py-0.5 text-xs text-red-600 hover:bg-red-600 hover:text-white disabled:opacity-50"
                        onClick={() => {
                          if (participants.length - 1 < threshold) {
                            setError(`Cannot remove: would leave ${participants.length - 1} participant(s), below threshold of ${threshold}. Lower the threshold first.`);
                            return;
                          }
                          setConfirm({ type: "removeParticipant", address: addr });
                        }}
                        disabled={submitting || !!confirm || !folio}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs font-medium text-muted">Add participant</div>
              <ParticipantRows
                rows={[addRow]}
                contacts={contacts}
                chainId={recovery.chainId}
                existingAddresses={participants}
                onChange={(rows) => setAddRow(rows[0] ?? emptyRow())}
                disabled={submitting || !!confirm || !folio}
                showRemove={false}
              />
              <button
                type="button"
                className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground disabled:opacity-50"
                onClick={handleAddSubmit}
                disabled={submitting || !!confirm || !folio}
              >
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs"
            onClick={onClose}
            disabled={submitting}
          >
            &nbsp;Close&nbsp;
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Placeholder modals ────────────────────────────────────────────────────────

function PlaceholderModal({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  onClose: () => void;
}) {
  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "rgba(0,0,0,0.35)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        className="bg-background text-foreground"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, calc(100vw - 32px))",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
        }}
      >
        <h2 className="mb-2 text-base font-semibold material-gold-text">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
        {children}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1 sm:text-xs"
            onClick={onClose}
          >
            &nbsp;Close&nbsp;
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Attestation prefill type ─────────────────────────────────────────────────

type AttestationPrefill = {
  chainId: number;
  accountAddress: string;
  recoverableAddress: string;
  paymaster?: string;
};

// ── CreateAttestationModal ────────────────────────────────────────────────────

function CreateAttestationModal({
  prefill,
  folios,
  contacts,
  domains,
  onClose,
}: {
  prefill: AttestationPrefill | null;
  folios: Folio[];
  contacts: Contact[];
  domains: Domain[];
  onClose: () => void;
}) {
  const ENS_MAINNET_RPC = "https://cloudflare-eth.com";

  // Step state
  const [step, setStep] = React.useState<1 | 2 | 3>(1);

  // Step 1 state
  const [chainId, setChainId] = React.useState<number>(prefill?.chainId ?? 0);
  const [accountMode, setAccountMode] = React.useState<"manual" | "contact">("manual");
  const [accountInput, setAccountInput] = React.useState(prefill?.accountAddress ?? "");
  const [accountResolving, setAccountResolving] = React.useState(false);
  const [accountResolved, setAccountResolved] = React.useState<string | null>(prefill?.accountAddress ?? null);
  const [accountError, setAccountError] = React.useState<string | null>(null);
  const [selectedContactKey, setSelectedContactKey] = React.useState("");
  const [recoverableInput, setRecoverableInput] = React.useState(prefill?.recoverableAddress ?? "");
  const [recoverableResolving, setRecoverableResolving] = React.useState(false);
  const [recoverableResolved, setRecoverableResolved] = React.useState<string | null>(prefill?.recoverableAddress ?? null);
  const [recoverableError, setRecoverableError] = React.useState<string | null>(null);
  const [fetchingKey, setFetchingKey] = React.useState(false);
  const [step1Error, setStep1Error] = React.useState<string | null>(null);

  // Step 2 state (populated after step 1)
  const [falconLevel, setFalconLevel] = React.useState<512 | 1024>(512);
  const [keypairs, setKeypairs] = React.useState<KeypairMeta[]>([]);
  const [formKeypairId, setFormKeypairId] = React.useState("");
  const [step2Busy, setStep2Busy] = React.useState(false);
  const [step2Error, setStep2Error] = React.useState<string | null>(null);

  // Step 3 state (populated after step 2)
  const [effectiveKeypairId, setEffectiveKeypairId] = React.useState("");
  const [keyHash, setKeyHash] = React.useState<`0x${string}`>("0x");
  const [qrPayload, setQrPayload] = React.useState("");
  const [step3SharePayload, setStep3SharePayload] = React.useState<SharePayload | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const folioKeypairIds = React.useMemo(() => new Set(folios.map(f => f.keypairId)), [folios]);
  const selectedDomain = domains.find(d => d.chainId === chainId) ?? null;

  // Load keypairs on entering step 2
  React.useEffect(() => {
    if (step !== 2) return;
    listKeypairs().then(setKeypairs).catch(() => {});
  }, [step]);

  // ENS resolution for account (manual mode)
  React.useEffect(() => {
    if (accountMode !== "manual") return;
    const val = accountInput.trim();
    if (!val) { setAccountResolved(null); setAccountError(null); return; }
    if (EVM_ADDRESS_REGEX.test(val)) { setAccountResolved(val); setAccountError(null); return; }
    if (ENS_REGEX.test(val)) {
      setAccountResolving(true);
      setAccountResolved(null);
      setAccountError(null);
      resolveEnsAddress(val, ENS_MAINNET_RPC)
        .then(addr => {
          if (addr) setAccountResolved(addr);
          else setAccountError("ENS name not found");
        })
        .catch(() => setAccountError("ENS resolution failed"))
        .finally(() => setAccountResolving(false));
    } else {
      setAccountResolved(null);
      setAccountError(val.length > 0 ? "Invalid address" : null);
    }
  }, [accountInput, accountMode]);

  // ENS resolution for recoverable address
  React.useEffect(() => {
    const val = recoverableInput.trim();
    if (!val) { setRecoverableResolved(null); setRecoverableError(null); return; }
    if (EVM_ADDRESS_REGEX.test(val)) { setRecoverableResolved(val); setRecoverableError(null); return; }
    if (ENS_REGEX.test(val)) {
      setRecoverableResolving(true);
      setRecoverableResolved(null);
      setRecoverableError(null);
      resolveEnsAddress(val, ENS_MAINNET_RPC)
        .then(addr => {
          if (addr) setRecoverableResolved(addr);
          else setRecoverableError("ENS name not found");
        })
        .catch(() => setRecoverableError("ENS resolution failed"))
        .finally(() => setRecoverableResolving(false));
    } else {
      setRecoverableResolved(null);
      setRecoverableError(val.length > 0 ? "Invalid address" : null);
    }
  }, [recoverableInput]);

  // Contacts filtered to selected chain
  const contactsForChain = React.useMemo(() =>
    contacts.flatMap(c =>
      (c.wallets ?? [])
        .map((w, i) => ({ contact: c, wallet: w, walletIdx: i }))
        .filter(({ wallet }) => wallet.chainId === chainId)
    ),
    [contacts, chainId]
  );

  function getContactAddress(): string | null {
    if (!selectedContactKey) return null;
    const lastColon = selectedContactKey.lastIndexOf(":");
    const cId = selectedContactKey.slice(0, lastColon);
    const wIdxStr = selectedContactKey.slice(lastColon + 1);
    const contact = contacts.find(c => c.id === cId);
    return contact?.wallets?.[Number(wIdxStr)]?.address ?? null;
  }

  async function handleStep1Next() {
    setStep1Error(null);
    const account = accountMode === "contact" ? getContactAddress() : accountResolved;
    if (!account) { setStep1Error("Please enter a valid account address."); return; }
    if (!recoverableResolved) { setStep1Error("Please enter a valid recoverable contract address."); return; }
    if (!selectedDomain) { setStep1Error("Please select a domain."); return; }

    setFetchingKey(true);
    try {
      const client = createPublicClient({ transport: http(selectedDomain.rpcUrl) });
      const pkHex = await client.readContract({
        address: account as Address,
        abi: quantumAccountAbi,
        functionName: "getPublicKeyBytes",
      }) as `0x${string}`;

      // 1026 bytes (2052 hex chars + 2 for "0x") = Falcon-512; otherwise Falcon-1024
      const byteLen = (pkHex.length - 2) / 2;
      const level: 512 | 1024 = byteLen === 1026 ? 512 : 1024;

      setFalconLevel(level);
      setStep(2);
    } catch {
      setStep1Error("Unable to retrieve public keys — this address may not be a Quantum Account on this network.");
    } finally {
      setFetchingKey(false);
    }
  }

  async function handleStep2Next() {
    setStep2Busy(true);
    setStep2Error(null);
    try {
      let kpId = formKeypairId;
      if (!kpId) {
        // Generate and immediately persist to keyStore so it is never lost
        const meta = await generateAndStoreKeypair(falconLevel);
        kpId = meta.id;
      }

      const pkBytes = await getPublicKey(kpId);
      if (!pkBytes) throw new Error("Failed to load public key from keyStore.");

      const hash = keccak256(bytesToHex(pkBytes));
      const sp: SharePayload = {
        v: 1,
        t: "txrequest",
        data: {
          type: "contract",
          chainId,
          contractAddress: recoverableResolved!,
          contractName: "Recoverable",
          functionName: "recoverWallet",
          args: { "newKey": hash },
        },
      };

      setEffectiveKeypairId(kpId);
      setKeyHash(hash);
      setQrPayload(encodeSharePayload(sp));
      setStep3SharePayload(sp);
      setStep(3);
    } catch (e: any) {
      setStep2Error(e?.message ?? "Failed to prepare key.");
    } finally {
      setStep2Busy(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const account = accountMode === "contact" ? getContactAddress()! : accountResolved!;
      await addAttestation({
        chainId,
        accountAddress: account,
        recoverableAddress: recoverableResolved!,
        keypairId: effectiveKeypairId,
        keyHash,
        falconLevel,
        paymaster: prefill?.paymaster,
      });
      const matchedFolio = folios.find(
        f => f.address.toLowerCase() === account.toLowerCase() && f.chainId === chainId
      );
      await setKeypairFolioName(effectiveKeypairId, matchedFolio?.name ?? account);
      onClose();
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to save attestation record.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyQrData() {
    await navigator.clipboard.writeText(qrPayload).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const availableKeypairs = keypairs.filter(k => k.level === falconLevel && !folioKeypairIds.has(k.id));

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 2147483647, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-background rounded-xl border border-border shadow-xl w-full overflow-y-auto"
        style={{ maxWidth: 480, maxHeight: "calc(100dvh - 32px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold material-gold-text">Create Attestation</h2>
            <span className="text-xs text-muted">Step {step} of 3</span>
          </div>

          {/* ── Step 1: Identify account ── */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-muted">Identify the account to be recovered and the Recoverable contract that will receive the attestation.</p>

              <div className="space-y-1">
                <label className="text-xs font-medium">Domain</label>
                <select
                  className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                  value={chainId}
                  onChange={e => {
                    setChainId(Number(e.target.value));
                    setAccountResolved(null);
                    setAccountInput("");
                    setSelectedContactKey("");
                  }}
                >
                  <option value={0} disabled>Select domain…</option>
                  {domains.map(d => (
                    <option key={d.chainId} value={d.chainId}>{d.name} ({d.chainId})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Account to Recover</label>
                <select
                  className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                  value={accountMode}
                  onChange={e => {
                    setAccountMode(e.target.value as "manual" | "contact");
                    setAccountResolved(null);
                    setAccountInput("");
                    setSelectedContactKey("");
                  }}
                >
                  <option value="manual">Enter manually</option>
                  <option value="contact">Select from contacts</option>
                </select>
                {accountMode === "manual" && (
                  <>
                    <input
                      className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm font-mono"
                      placeholder="0x… or name.eth"
                      value={accountInput}
                      onChange={e => setAccountInput(e.target.value)}
                    />
                    {accountResolving && <p className="text-xs text-muted">Resolving…</p>}
                    {accountResolved && !accountResolving && (
                      <p className="text-xs text-green-600 font-mono">Resolved: {accountResolved}</p>
                    )}
                    {accountError && <p className="text-xs text-red-600">{accountError}</p>}
                  </>
                )}
                {accountMode === "contact" && (
                  <select
                    className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                    value={selectedContactKey}
                    onChange={e => setSelectedContactKey(e.target.value)}
                    disabled={!chainId}
                  >
                    <option value="">{chainId ? "Select contact wallet…" : "Select a domain first"}</option>
                    {contactsForChain.map(({ contact, wallet, walletIdx }) => (
                      <option key={`${contact.id}:${walletIdx}`} value={`${contact.id}:${walletIdx}`}>
                        {[contact.name, contact.surname].filter(Boolean).join(" ")}{wallet.name ? ` — ${wallet.name}` : ""} ({wallet.address.slice(0, 6)}…{wallet.address.slice(-4)})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium">Recoverable Contract Address</label>
                <input
                  className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm font-mono"
                  placeholder="0x… or name.eth"
                  value={recoverableInput}
                  onChange={e => setRecoverableInput(e.target.value)}
                />
                {recoverableResolving && <p className="text-xs text-muted">Resolving…</p>}
                {recoverableResolved && !recoverableResolving && (
                  <p className="text-xs text-green-600 font-mono">Resolved: {recoverableResolved}</p>
                )}
                {recoverableError && <p className="text-xs text-red-600">{recoverableError}</p>}
              </div>

              {step1Error && <p className="text-xs text-red-600">{step1Error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-md border border-border px-4 py-3 text-sm sm:px-3 sm:py-1"
                  onClick={onClose}
                  disabled={fetchingKey}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 text-primary-foreground disabled:opacity-50"
                  onClick={handleStep1Next}
                  disabled={fetchingKey || !chainId || recoverableResolving || accountResolving}
                >
                  {fetchingKey ? "Checking account…" : "Next"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Select key ── */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-muted">
                Select the Falcon-{falconLevel} key to use for this recovery. The key will be used to compute the <em>_newKey</em> hash that participants attest to.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-medium">Keypair</label>
                <select
                  className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                  value={formKeypairId}
                  onChange={e => setFormKeypairId(e.target.value)}
                  disabled={step2Busy}
                >
                  <option value="">Generate new Falcon-{falconLevel} keypair</option>
                  {availableKeypairs.map(k => (
                    <option key={k.id} value={k.id}>
                      Falcon-{k.level}{k.label ? ` — ${k.label}` : ""} ({new Date(k.createdAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                {availableKeypairs.length === 0 && (
                  <p className="text-xs text-muted">No unused Falcon-{falconLevel} keys in keystore — a new one will be generated.</p>
                )}
              </div>

              {step2Error && <p className="text-xs text-red-600">{step2Error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-md border border-border px-4 py-3 text-sm sm:px-3 sm:py-1"
                  onClick={() => { setStep(1); setStep2Error(null); }}
                  disabled={step2Busy}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 text-primary-foreground disabled:opacity-50"
                  onClick={handleStep2Next}
                  disabled={step2Busy}
                >
                  {step2Busy ? (formKeypairId ? "Loading key…" : "Generating key…") : "Next"}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: QR code ── */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-muted">
                Share this QR code with recovery participants. When scanned, it will open the <strong>recoverWallet</strong> transaction in their app.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-medium">Recovery Code (_newKey)</label>
                <p className="text-xs font-mono break-all rounded border border-border bg-muted/20 p-2 select-all">{keyHash}</p>
              </div>

              <div className="flex justify-center">
                <div className="inline-block rounded-lg border border-border p-3 bg-white">
                  <QRCode value={qrPayload} size={200} level="H" />
                </div>
              </div>

              <div className="flex justify-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="rounded-md border border-border px-4 py-3 text-sm sm:px-3 sm:py-1"
                  onClick={handleCopyQrData}
                >
                  {copied ? "Copied!" : "Copy QR data"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-border px-4 py-3 text-sm sm:px-3 sm:py-1"
                  onClick={() => step3SharePayload && downloadShareTextFile(step3SharePayload)}
                >
                  Download file
                </button>
              </div>

              {saveError && <p className="text-xs text-red-600">{saveError}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-md border border-border px-4 py-3 text-sm sm:px-3 sm:py-1"
                  onClick={() => { setStep(2); setSaveError(null); }}
                  disabled={saving}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 text-primary-foreground disabled:opacity-50"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Confirm & Save"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── RecoverAccountChooser ─────────────────────────────────────────────────────

function RecoverAccountChooser({
  onInitiate,
  onMigrate,
  onClose,
}: {
  onInitiate: () => void;
  onMigrate: () => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 2147483647, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="bg-background rounded-xl border border-border shadow-xl w-full overflow-y-auto"
        style={{ maxWidth: 420, maxHeight: "calc(100dvh - 32px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold material-gold-text">Recover Account</h2>
            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={onClose}>✕</button>
          </div>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="rounded-lg border border-border bg-card px-4 py-4 text-left hover:bg-primary/5 transition-colors"
              onClick={onInitiate}
            >
              <div className="text-sm font-medium mb-1">Initiate Recovery</div>
              <div className="text-xs text-muted-foreground">Use a stored attestation to complete threshold recovery of an account. Requires that the threshold has already been met on the Recoverable contract.</div>
            </button>
            <button
              type="button"
              className="rounded-lg border border-border bg-card px-4 py-4 text-left hover:bg-primary/5 transition-colors"
              onClick={onMigrate}
            >
              <div className="text-sm font-medium mb-1">Migrate Account</div>
              <div className="text-xs text-muted-foreground">Import an account you still control onto this device. Generate a key-update QR code for your existing device to scan.</div>
            </button>
          </div>
          <div className="flex justify-end mt-4">
            <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── InitiateRecoveryModal ─────────────────────────────────────────────────────

function InitiateRecoveryModal({
  attestations,
  domains,
  contacts,
  onClose,
}: {
  attestations: AttestationRecord[];
  domains: Domain[];
  contacts: Contact[];
  onClose: () => void;
}) {
  const txStatus = useTx(s => s.status);

  const [selectedAttestationId, setSelectedAttestationId] = React.useState("");
  const [domain, setDomain] = React.useState<Domain | null>(null);
  const [accountMode, setAccountMode] = React.useState<"manual" | "contact">("manual");
  const [accountInput, setAccountInput] = React.useState("");
  const [accountResolving, setAccountResolving] = React.useState(false);
  const [accountResolved, setAccountResolved] = React.useState<string | null>(null);
  const [accountError, setAccountError] = React.useState<string | null>(null);
  const [selectedContactKey, setSelectedContactKey] = React.useState("");
  const [recoverableInput, setRecoverableInput] = React.useState("");
  const [recoverableResolving, setRecoverableResolving] = React.useState(false);
  const [recoverableResolved, setRecoverableResolved] = React.useState<string | null>(null);
  const [recoverableError, setRecoverableError] = React.useState<string | null>(null);
  const [paymaster, setPaymaster] = React.useState("");
  const [falconLevel, setFalconLevel] = React.useState<512 | 1024>(512);
  const [keypairId, setKeypairId] = React.useState("");
  const [folioName, setFolioName] = React.useState("");
  const [keypairs, setKeypairs] = React.useState<KeypairMeta[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  type ResetPhase = null | "prompt" | "resetting" | "success" | "failed";
  const [resetPhase, setResetPhase] = React.useState<ResetPhase>(null);
  const [resetError, setResetError] = React.useState<string | null>(null);

  React.useEffect(() => {
    listKeypairs().then(setKeypairs).catch(() => {});
  }, []);

  // ENS resolution for account (manual mode)
  React.useEffect(() => {
    if (accountMode !== "manual") return;
    const val = accountInput.trim();
    if (!val) { setAccountResolved(null); setAccountError(null); return; }
    if (EVM_ADDRESS_REGEX.test(val)) { setAccountResolved(val); setAccountError(null); return; }
    if (ENS_REGEX.test(val)) {
      setAccountResolving(true);
      setAccountResolved(null);
      setAccountError(null);
      resolveEnsAddress(val, ENS_MAINNET_RPC)
        .then(addr => {
          if (addr) setAccountResolved(addr);
          else setAccountError("ENS name not found");
        })
        .catch(() => setAccountError("ENS resolution failed"))
        .finally(() => setAccountResolving(false));
    } else {
      setAccountResolved(null);
      setAccountError(val.length > 0 ? "Invalid address" : null);
    }
  }, [accountInput, accountMode]);

  // ENS resolution for recoverable address
  React.useEffect(() => {
    const val = recoverableInput.trim();
    if (!val) { setRecoverableResolved(null); setRecoverableError(null); return; }
    if (EVM_ADDRESS_REGEX.test(val)) { setRecoverableResolved(val); setRecoverableError(null); return; }
    if (ENS_REGEX.test(val)) {
      setRecoverableResolving(true);
      setRecoverableResolved(null);
      setRecoverableError(null);
      resolveEnsAddress(val, ENS_MAINNET_RPC)
        .then(addr => {
          if (addr) setRecoverableResolved(addr);
          else setRecoverableError("ENS name not found");
        })
        .catch(() => setRecoverableError("ENS resolution failed"))
        .finally(() => setRecoverableResolving(false));
    } else {
      setRecoverableResolved(null);
      setRecoverableError(val.length > 0 ? "Invalid address" : null);
    }
  }, [recoverableInput]);

  const contactsForChain = React.useMemo(() =>
    contacts.flatMap(c =>
      (c.wallets ?? [])
        .map((w, i) => ({ contact: c, wallet: w, walletIdx: i }))
        .filter(({ wallet }) => wallet.chainId === domain?.chainId)
    ),
    [contacts, domain]
  );

  // Auto-fill paymaster from the bundler whenever account + domain are both known
  React.useEffect(() => {
    if (!domain) return;
    let accountAddr: string | null = null;
    if (accountMode === "manual") {
      accountAddr = accountResolved;
    } else if (accountMode === "contact" && selectedContactKey) {
      const lastColon = selectedContactKey.lastIndexOf(":");
      const cId = selectedContactKey.slice(0, lastColon);
      const wIdxStr = selectedContactKey.slice(lastColon + 1);
      accountAddr = contacts.find(c => c.id === cId)?.wallets?.[Number(wIdxStr)]?.address ?? null;
    }
    if (!accountAddr) return;
    BundlerAPI.getAccountPaymaster(accountAddr as Address, domain.name)
      .then(res => { if (res.success) setPaymaster(res.paymaster); })
      .catch(() => { /* keep existing domain-default paymaster on any failure */ });
  }, [accountResolved, selectedContactKey, domain, accountMode]);

  const filteredKeypairs = keypairs.filter(k => k.level === falconLevel);

  function applyAttestation(id: string) {
    setSelectedAttestationId(id);
    if (!id) return;
    const a = attestations.find(att => att.id === id);
    if (!a) return;

    const d = domains.find(dom => dom.chainId === a.chainId) ?? null;
    setDomain(d);

    // Try to auto-select contact
    const contactMatch = contacts.flatMap(c =>
      (c.wallets ?? []).map((w, wi) => ({ c, w, wi }))
    ).find(({ w }) => w.chainId === a.chainId && w.address.toLowerCase() === a.accountAddress.toLowerCase());

    if (contactMatch) {
      setAccountMode("contact");
      setSelectedContactKey(`${contactMatch.c.id}:${contactMatch.wi}`);
      setFolioName(contactMatch.w.name ?? `${contactMatch.c.name}${contactMatch.c.surname ? " " + contactMatch.c.surname : ""}`);
    } else {
      setAccountMode("manual");
      setAccountInput(a.accountAddress);
      setAccountResolved(a.accountAddress);
    }

    setRecoverableInput(a.recoverableAddress);
    setRecoverableResolved(a.recoverableAddress);
    setPaymaster(a.paymaster ?? d?.paymaster?.[0]?.address ?? "");
    setFalconLevel(a.falconLevel);
    setKeypairId(a.keypairId);
  }

  function getEffectiveAccount(): string | null {
    if (accountMode === "contact") {
      if (!selectedContactKey) return null;
      const lastColon = selectedContactKey.lastIndexOf(":");
      const cId = selectedContactKey.slice(0, lastColon);
      const wIdxStr = selectedContactKey.slice(lastColon + 1);
      return contacts.find(c => c.id === cId)?.wallets?.[Number(wIdxStr)]?.address ?? null;
    }
    return accountResolved;
  }

  async function handleSubmit() {
    setError(null);
    const account = getEffectiveAccount();
    if (!account) { setError("Please enter a valid account address."); return; }
    if (!recoverableResolved) { setError("Please enter a valid recoverable contract address."); return; }
    if (!domain) { setError("Please select a domain."); return; }
    if (!paymaster.trim()) { setError("Paymaster is required."); return; }
    if (!keypairId) { setError("Please select a keypair."); return; }

    setBusy(true);
    try {
      const pkBytes = await getPublicKey(keypairId);
      if (!pkBytes) throw new Error("Keypair not found in keystore.");

      const encoded = encodeFunctionData({
        abi: quantumAccountAbi,
        functionName: "updatePublicKeyViaRecoverable",
        args: [recoverableResolved as Address, bytesToHex(pkBytes) as Hex],
      }) as Hex;

      const tempFolio: Folio = {
        id: crypto.randomUUID(),
        address: account,
        name: folioName || "Recovered Account",
        chainId: domain.chainId,
        paymaster: paymaster.trim(),
        type: 0,
        bundler: domain.bundler,
        keypairId,
        wallet: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const { startFlow } = useTx.getState();
      await startFlow({ folio: tempFolio, encoded, domain, nonceKey: ADMIN_KEY });

      const status = useTx.getState().status;
      if (status.phase === "failed") {
        setError(status.message ?? "Transaction failed.");
        return;
      }

      const allCoins = await getAllCoins();
      const walletArray: FolioWallet[] = allCoins
        .filter(c => c.chainId === domain.chainId)
        .map(c => ({ coin: c.id, balance: 0n }));

      await addFolio({
        address: account,
        name: folioName || "Recovered Account",
        chainId: domain.chainId,
        paymaster: paymaster.trim(),
        type: 0,
        bundler: domain.bundler,
        keypairId,
        wallet: walletArray,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Mark any local recovery records for this recoverable as consumed
      const allRecoveries = await getAllRecoveries();
      for (const r of allRecoveries) {
        if (r.recoverableAddress.toLowerCase() === recoverableResolved!.toLowerCase()) {
          await updateRecoveryInStore(r.id, { consumed: true });
        }
      }

      setResetPhase("prompt");
    } catch (e: any) {
      setError(e?.message ?? "Transaction failed.");
    } finally {
      setBusy(false);
    }
  }

  const isBusy = busy || (txStatus.phase !== "idle" && txStatus.phase !== "finalized" && txStatus.phase !== "failed");

  async function handleResetNow() {
    const account = getEffectiveAccount();
    if (!account || !recoverableResolved || !domain || !paymaster.trim() || !keypairId) return;
    setResetPhase("resetting");
    setResetError(null);
    try {
      const encoded = encodeFunctionData({
        abi: quantumAccountAbi,
        functionName: "reinitializeRecoverable",
        args: [recoverableResolved as Address],
      }) as Hex;
      const tempFolio: Folio = {
        id: crypto.randomUUID(),
        address: account,
        name: folioName || "Recovered Account",
        chainId: domain.chainId,
        paymaster: paymaster.trim(),
        type: 0,
        bundler: domain.bundler,
        keypairId,
        wallet: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const { startFlow } = useTx.getState();
      await startFlow({ folio: tempFolio, encoded, domain, nonceKey: ADMIN_KEY });
      const txResult = useTx.getState().status;
      if (txResult.phase === "failed") {
        setResetPhase("failed");
        setResetError(txResult.message ?? "Transaction failed.");
        return;
      }
      const allRecoveries = await getAllRecoveries();
      for (const r of allRecoveries) {
        if (r.recoverableAddress.toLowerCase() === recoverableResolved.toLowerCase()) {
          await updateRecoveryInStore(r.id, { consumed: false, status: true });
        }
      }
      setResetPhase("success");
    } catch (e: any) {
      setResetPhase("failed");
      setResetError(e?.message ?? "Transaction failed.");
    }
  }

  if (resetPhase !== null) {
    return createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 2147483647, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}>
        <div className="bg-background rounded-xl border border-border shadow-xl w-full p-5" style={{ maxWidth: 420 }}>
          {resetPhase === "prompt" && (
            <>
              <h2 className="text-base font-semibold material-gold-text mb-2">Recovery Complete</h2>
              <p className="text-sm text-muted-foreground mb-3">The account has been successfully recovered and added to your portfolio.</p>
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-4">
                The recoverable contract has been consumed and must be reset before it can be used for future recovery. This is a transaction and is not free.
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose}>Later</button>
                <button type="button" className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium" onClick={handleResetNow}>Reset Now</button>
              </div>
            </>
          )}
          {resetPhase === "resetting" && (
            <>
              <h2 className="text-base font-semibold material-gold-text mb-2">Resetting Recoverable</h2>
              <p className="text-sm text-muted-foreground">Submitting reset transaction…</p>
            </>
          )}
          {resetPhase === "success" && (
            <>
              <h2 className="text-base font-semibold material-gold-text mb-2">Recoverable Reset</h2>
              <p className="text-sm text-muted-foreground mb-4">The recoverable has been successfully reset and is ready for future use.</p>
              <div className="flex justify-end">
                <button type="button" className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium" onClick={onClose}>Done</button>
              </div>
            </>
          )}
          {resetPhase === "failed" && (
            <>
              <h2 className="text-base font-semibold material-gold-text mb-2">Reset Failed</h2>
              <div className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-600 mb-4">{resetError}</div>
              <div className="flex justify-end">
                <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose}>Later</button>
              </div>
            </>
          )}
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 2147483647, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !isBusy) onClose(); }}
    >
      <div
        className="bg-background rounded-xl border border-border shadow-xl w-full overflow-y-auto"
        style={{ maxWidth: 480, maxHeight: "calc(100dvh - 32px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <h2 className="text-base font-semibold material-gold-text">Initiate Recovery</h2>

          {/* Attestation selector */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Load from attestation</label>
            <select
              className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
              value={selectedAttestationId}
              onChange={e => applyAttestation(e.target.value)}
              disabled={isBusy}
            >
              <option value="">Enter details manually</option>
              {attestations.map(a => {
                const domainName = domains.find(d => d.chainId === a.chainId)?.name ?? String(a.chainId);
                const contactMatch = contacts.flatMap(c =>
                  (c.wallets ?? []).map((w) => ({ c, w }))
                ).find(({ w }) => w.chainId === a.chainId && w.address.toLowerCase() === a.accountAddress.toLowerCase());
                const label = contactMatch
                  ? `${contactMatch.c.name}${contactMatch.c.surname ? " " + contactMatch.c.surname : ""} / ${domainName}`
                  : `${a.accountAddress.slice(0, 10)}… / ${domainName}`;
                return <option key={a.id} value={a.id}>{label}</option>;
              })}
            </select>
          </div>

          {/* Domain */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Domain</label>
            <select
              className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
              value={domain?.chainId ?? 0}
              onChange={e => {
                const d = domains.find(dom => dom.chainId === Number(e.target.value)) ?? null;
                setDomain(d);
                setSelectedContactKey("");
                setAccountInput("");
                setAccountResolved(null);
                setPaymaster(d?.paymaster?.[0]?.address ?? "");
              }}
              disabled={isBusy}
            >
              <option value={0} disabled>Select domain…</option>
              {domains.map(d => (
                <option key={d.chainId} value={d.chainId}>{d.name} ({d.chainId})</option>
              ))}
            </select>
          </div>

          {/* Account */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Account to Recover</label>
            <select
              className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
              value={accountMode}
              onChange={e => {
                setAccountMode(e.target.value as "manual" | "contact");
                setAccountInput("");
                setAccountResolved(null);
                setSelectedContactKey("");
              }}
              disabled={isBusy}
            >
              <option value="manual">Enter manually</option>
              <option value="contact">Select from contacts</option>
            </select>
            {accountMode === "manual" && (
              <>
                <input
                  className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm font-mono"
                  placeholder="0x… or name.eth"
                  value={accountInput}
                  onChange={e => setAccountInput(e.target.value)}
                  disabled={isBusy}
                />
                {accountResolving && <p className="text-xs text-muted-foreground">Resolving…</p>}
                {accountResolved && !accountResolving && <p className="text-xs text-green-600 font-mono">Resolved: {accountResolved}</p>}
                {accountError && <p className="text-xs text-red-600">{accountError}</p>}
              </>
            )}
            {accountMode === "contact" && (
              <select
                className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                value={selectedContactKey}
                onChange={e => {
                  setSelectedContactKey(e.target.value);
                  if (e.target.value) {
                    const [cId, wIdxStr] = e.target.value.split(":");
                    const c = contacts.find(ct => ct.id === cId);
                    const w = c?.wallets?.[Number(wIdxStr)];
                    setFolioName(w?.name ?? (c ? [c.name, c.surname].filter(Boolean).join(" ") : ""));
                  }
                }}
                disabled={isBusy || !domain}
              >
                <option value="">{domain ? "Select contact wallet…" : "Select a domain first"}</option>
                {contactsForChain.map(({ contact, wallet, walletIdx }) => (
                  <option key={`${contact.id}:${walletIdx}`} value={`${contact.id}:${walletIdx}`}>
                    {[contact.name, contact.surname].filter(Boolean).join(" ")}{wallet.name ? ` — ${wallet.name}` : ""} ({wallet.address.slice(0, 6)}…{wallet.address.slice(-4)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Recoverable address */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Recoverable Contract Address</label>
            <input
              className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm font-mono"
              placeholder="0x… or name.eth"
              value={recoverableInput}
              onChange={e => setRecoverableInput(e.target.value)}
              disabled={isBusy}
            />
            {recoverableResolving && <p className="text-xs text-muted-foreground">Resolving…</p>}
            {recoverableResolved && !recoverableResolving && <p className="text-xs text-green-600 font-mono">Resolved: {recoverableResolved}</p>}
            {recoverableError && <p className="text-xs text-red-600">{recoverableError}</p>}
          </div>

          {/* Paymaster */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Paymaster <span className="text-red-500">*</span></label>
            <input
              className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm font-mono"
              placeholder="0x…"
              value={paymaster}
              onChange={e => setPaymaster(e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Falcon level */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Falcon Level</label>
            <select
              className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
              value={falconLevel}
              onChange={e => { setFalconLevel(Number(e.target.value) as 512 | 1024); setKeypairId(""); }}
              disabled={isBusy}
            >
              <option value={512}>Falcon-512</option>
              <option value={1024}>Falcon-1024</option>
            </select>
          </div>

          {/* Keypair */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Keypair (new key to sign with)</label>
            <select
              className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
              value={keypairId}
              onChange={e => setKeypairId(e.target.value)}
              disabled={isBusy}
            >
              <option value="">Select keypair…</option>
              {filteredKeypairs.map(k => (
                <option key={k.id} value={k.id}>
                  Falcon-{k.level}{k.label ? ` — ${k.label}` : ""} ({new Date(k.createdAt).toLocaleDateString()})
                </option>
              ))}
            </select>
            {filteredKeypairs.length === 0 && (
              <p className="text-xs text-muted-foreground">No Falcon-{falconLevel} keys in keystore. Generate a key first.</p>
            )}
          </div>

          {/* Folio name */}
          <div className="space-y-1">
            <label className="text-xs font-medium">Account name</label>
            <input
              className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
              placeholder="e.g. My Main Account"
              value={folioName}
              onChange={e => setFolioName(e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Warning */}
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ⚠ This assumes the attestation threshold has been met on the Recoverable contract. The transaction will fail if it has not.
          </div>

          {/* TX status */}
          {(txStatus.phase !== "idle" || error) && (
            <div className={`rounded-md border px-3 py-2 text-xs ${txStatus.phase === "failed" || error ? "border-red-300 text-red-600" : "border-border"}`}>
              {txStatus.phase === "preparing" && "Building recovery UserOp…"}
              {txStatus.phase === "submitted" && `Confirming on-chain… tx: ${(txStatus.hash ?? txStatus.userOpHash ?? "").slice(0, 12)}…`}
              {txStatus.phase === "failed" && (error ?? txStatus.message)}
              {txStatus.phase !== "failed" && error && error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose} disabled={isBusy}>Cancel</button>
            <button
              type="button"
              className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
              onClick={handleSubmit}
              disabled={isBusy}
            >
              {isBusy ? "Submitting…" : "Initiate Recovery"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── ResetRecoverableModal ─────────────────────────────────────────────────────

function ResetRecoverableModal({
  recovery,
  folios,
  domains,
  updateRecovery,
  onClose,
}: {
  recovery: Recovery;
  folios: Folio[];
  domains: Domain[];
  updateRecovery: (id: string, patch: Partial<Recovery>) => Promise<unknown>;
  onClose: () => void;
}) {
  const txStatus = useTx(s => s.status);
  const [phase, setPhase] = React.useState<"confirm" | "resetting" | "success" | "failed">("confirm");
  const [txError, setTxError] = React.useState<string | null>(null);

  const folio = folios.find(
    f => f.address.toLowerCase() === recovery.name.toLowerCase() && f.chainId === recovery.chainId
  ) ?? null;
  const domain = domains.find(d => d.chainId === recovery.chainId) ?? null;

  async function handleReset() {
    if (!folio || !domain) return;
    setPhase("resetting");
    setTxError(null);
    try {
      const encoded = encodeFunctionData({
        abi: quantumAccountAbi,
        functionName: "reinitializeRecoverable",
        args: [recovery.recoverableAddress as Address],
      }) as Hex;
      const { startFlow } = useTx.getState();
      await startFlow({ folio, encoded, domain, nonceKey: ADMIN_KEY });
      const result = useTx.getState().status;
      if (result.phase === "failed") {
        setPhase("failed");
        setTxError(result.message ?? "Transaction failed.");
        return;
      }
      await updateRecovery(recovery.id, { consumed: false, status: true });
      setPhase("success");
    } catch (e: any) {
      setPhase("failed");
      setTxError(e?.message ?? "Transaction failed.");
    }
  }

  const backdrop = { position: "fixed" as const, inset: 0, zIndex: 2147483647, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" };

  if (!folio || !domain) {
    return createPortal(
      <div style={backdrop} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="bg-background rounded-xl border border-border shadow-xl w-full p-5" style={{ maxWidth: 420 }}>
          <h2 className="text-base font-semibold material-gold-text mb-2">Reset Recoverable</h2>
          <p className="text-sm text-red-600 mb-4">Account not found in your portfolio.</p>
          <div className="flex justify-end">
            <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <div style={backdrop} onClick={(e) => { if (e.target === e.currentTarget && phase !== "resetting") onClose(); }}>
      <div className="bg-background rounded-xl border border-border shadow-xl w-full p-5" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
        {phase === "confirm" && (
          <>
            <h2 className="text-base font-semibold material-gold-text mb-2">Reset Recoverable</h2>
            <p className="text-sm text-muted-foreground mb-3">
              Resetting this recoverable will allow it to be used for future account recovery.
            </p>
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 mb-4">
              This will deduct <strong>2 transaction credits</strong>. Do you wish to proceed?
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose}>Cancel</button>
              <button type="button" className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium" onClick={handleReset}>Reset</button>
            </div>
          </>
        )}
        {phase === "resetting" && (
          <>
            <h2 className="text-base font-semibold material-gold-text mb-2">Resetting Recoverable</h2>
            <p className="text-sm text-muted-foreground">Submitting reset transaction…</p>
          </>
        )}
        {phase === "success" && (
          <>
            <h2 className="text-base font-semibold material-gold-text mb-2">Reset Successful</h2>
            <p className="text-sm text-muted-foreground mb-4">The recoverable has been successfully reset and is ready for future use.</p>
            <div className="flex justify-end">
              <button type="button" className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium" onClick={onClose}>Done</button>
            </div>
          </>
        )}
        {phase === "failed" && (
          <>
            <h2 className="text-base font-semibold material-gold-text mb-2">Reset Failed</h2>
            <div className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-600 mb-4">{txError}</div>
            <div className="flex justify-end">
              <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── MigrateAccountModal ───────────────────────────────────────────────────────

function MigrateAccountModal({
  domains,
  contacts,
  folios,
  onClose,
}: {
  domains: Domain[];
  contacts: Contact[];
  folios: Folio[];
  onClose: () => void;
}) {
  const [domain, setDomain] = React.useState<Domain | null>(null);
  const [selectedContactKey, setSelectedContactKey] = React.useState("");
  const [accountAddress, setAccountAddress] = React.useState<string | null>(null);
  const [folioName, setFolioName] = React.useState("");
  const [falconLevel, setFalconLevel] = React.useState<512 | 1024 | null>(null);
  const [manualFalconLevel, setManualFalconLevel] = React.useState<512 | 1024 | null>(null);
  const [fetchingLevel, setFetchingLevel] = React.useState(false);
  const [levelError, setLevelError] = React.useState<string | null>(null);
  const [keypairs, setKeypairs] = React.useState<KeypairMeta[]>([]);
  const [formKeypairId, setFormKeypairId] = React.useState("");
  const [generating, setGenerating] = React.useState(false);
  const [exportSharePayload, setExportSharePayload] = React.useState<SharePayload | null>(null);
  const [exportKeyHex, setExportKeyHex] = React.useState<string | null>(null);
  const [keyCopied, setKeyCopied] = React.useState(false);
  const [finishing, setFinishing] = React.useState(false);
  const [finishError, setFinishError] = React.useState<string | null>(null);
  const [bundlerSyncWarning, setBundlerSyncWarning] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    listKeypairs().then(setKeypairs).catch(() => {});
  }, []);

  const folioKeypairIds = React.useMemo(() => new Set(folios.map(f => f.keypairId)), [folios]);

  const contactsForChain = React.useMemo(() =>
    contacts.flatMap(c =>
      (c.wallets ?? [])
        .map((w, i) => ({ contact: c, wallet: w, walletIdx: i }))
        .filter(({ wallet }) => wallet.chainId === domain?.chainId)
    ),
    [contacts, domain]
  );

  async function handleContactChange(key: string) {
    setSelectedContactKey(key);
    setFalconLevel(null);
    setManualFalconLevel(null);
    setLevelError(null);
    setFormKeypairId("");
    setExportSharePayload(null);
    setExportKeyHex(null);
    setFinishError(null);

    if (!key || !domain) return;
    const lastColon = key.lastIndexOf(":");
    const cId = key.slice(0, lastColon);
    const wIdxStr = key.slice(lastColon + 1);
    const contact = contacts.find(c => c.id === cId);
    const wallet = contact?.wallets?.[Number(wIdxStr)];
    if (!wallet) return;

    const addr = wallet.address;
    setAccountAddress(addr);
    setFolioName(wallet.name ?? [contact!.name, contact!.surname].filter(Boolean).join(" "));

    setFetchingLevel(true);
    try {
      const client = createPublicClient({ transport: http(domain.rpcUrl) });
      const pkHex = await client.readContract({
        address: addr as Address,
        abi: quantumAccountAbi,
        functionName: "getPublicKeyBytes",
      }) as `0x${string}`;
      const byteLen = (pkHex.length - 2) / 2;
      if (byteLen === 1026) {
        setFalconLevel(512);
      } else if (byteLen === 2050) {
        setFalconLevel(1024);
      } else {
        setLevelError("This address does not appear to be a Falcon-512 or Falcon-1024 QuantumAccount.");
      }
    } catch {
      setLevelError("Unable to read public key from the account. Ensure the address is a QuantumAccount on this network.");
    } finally {
      setFetchingLevel(false);
    }
  }

  const effectiveFalconLevel = falconLevel ?? manualFalconLevel;
  const availableKeypairs = effectiveFalconLevel
    ? keypairs.filter(k => k.level === effectiveFalconLevel && !folioKeypairIds.has(k.id))
    : [];

  async function handleGenerateKey() {
    if (!domain || !accountAddress || !effectiveFalconLevel) return;
    setGenerating(true);
    setFinishError(null);
    try {
      let effectiveKeypairId = formKeypairId;
      if (!effectiveKeypairId) {
        const meta = await generateAndStoreKeypair(effectiveFalconLevel);
        effectiveKeypairId = meta.id;
        setFormKeypairId(meta.id);
        listKeypairs().then(setKeypairs).catch(() => {});
      }
      const pkBytes = await getPublicKey(effectiveKeypairId);
      if (!pkBytes) throw new Error("Keypair not found.");
      const keyHex = bytesToHex(pkBytes);
      const sp: SharePayload = {
        v: 1,
        t: "txrequest",
        data: {
          type: "contract",
          chainId: domain.chainId,
          contractAddress: accountAddress,
          contractName: "QuantumAccount",
          functionName: "updatePublicKey",
          args: { "publicKeyBytes": keyHex },
        },
      };
      setExportSharePayload(sp);
      setExportKeyHex(keyHex);
    } catch (e: any) {
      setFinishError(e?.message ?? "Failed to generate key.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleFinishMigration() {
    if (!domain || !accountAddress || !formKeypairId) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const client = createPublicClient({ transport: http(domain.rpcUrl) });
      const onChainHex = await client.readContract({
        address: accountAddress as Address,
        abi: quantumAccountAbi,
        functionName: "getPublicKeyBytes",
      }) as `0x${string}`;

      const localPkBytes = await getPublicKey(formKeypairId);
      if (!localPkBytes) throw new Error("Local keypair not found.");

      if (onChainHex !== bytesToHex(localPkBytes)) {
        setFinishError("Public keys don't match yet — the transaction may not have been confirmed. Wait a few minutes and try again, or cancel.");
        return;
      }

      const allCoins = await getAllCoins();
      const walletArray: FolioWallet[] = allCoins
        .filter(c => c.chainId === domain.chainId)
        .map(c => ({ coin: c.id, balance: 0n }));

      await addFolio({
        address: accountAddress,
        name: folioName || "Migrated Account",
        chainId: domain.chainId,
        paymaster: domain.paymaster?.[0]?.address ?? "",
        type: 0,
        bundler: domain.bundler,
        keypairId: formKeypairId,
        wallet: walletArray,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Notify bundler of the new key (no old-key signature needed — reads from chain)
      try {
        await BundlerAPI.syncPublicKey(accountAddress as Address, domain.name);
      } catch {
        setBundlerSyncWarning(true);
      }

      setDone(true);
    } catch (e: any) {
      if (!finishError) setFinishError(e?.message ?? "Verification failed.");
    } finally {
      setFinishing(false);
    }
  }

  const canGenerate = !!domain && !!accountAddress && !!effectiveFalconLevel && !fetchingLevel;
  const canFinish = !!exportSharePayload && !finishing;

  return createPortal(
    <div
      style={{ position: "fixed", inset: 0, zIndex: 2147483647, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget && !generating && !finishing) onClose(); }}
    >
      <div
        className="bg-background rounded-xl border border-border shadow-xl w-full overflow-y-auto"
        style={{ maxWidth: 480, maxHeight: "calc(100dvh - 32px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 space-y-4">
          <h2 className="text-base font-semibold material-gold-text">Migrate Account</h2>

          {done ? (
            <>
              <p className="text-sm text-muted-foreground">The account has been added to your portfolio. You can now use it on this device.</p>
              {bundlerSyncWarning && (
                <p className="mt-2 text-xs text-amber-600">
                  The bundler could not be notified of your new key. Use "Sync key with bundler" on the key management page to retry.
                </p>
              )}
              <div className="flex justify-end mt-3">
                <button type="button" className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium" onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <>
              {/* Domain */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Domain</label>
                <select
                  className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                  value={domain?.chainId ?? 0}
                  onChange={e => {
                    const d = domains.find(dom => dom.chainId === Number(e.target.value)) ?? null;
                    setDomain(d);
                    setSelectedContactKey("");
                    setAccountAddress(null);
                    setFalconLevel(null);
                    setLevelError(null);
                    setFormKeypairId("");
                    setExportSharePayload(null);
                    setExportKeyHex(null);
                    setFinishError(null);
                  }}
                  disabled={generating || finishing}
                >
                  <option value={0} disabled>Select domain…</option>
                  {domains.map(d => (
                    <option key={d.chainId} value={d.chainId}>{d.name} ({d.chainId})</option>
                  ))}
                </select>
              </div>

              {/* Account from contacts */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Account (from contacts)</label>
                <select
                  className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                  value={selectedContactKey}
                  onChange={e => handleContactChange(e.target.value)}
                  disabled={!domain || generating || finishing}
                >
                  <option value="">{domain ? "Select contact wallet…" : "Select a domain first"}</option>
                  {contactsForChain.map(({ contact, wallet, walletIdx }) => (
                    <option key={`${contact.id}:${walletIdx}`} value={`${contact.id}:${walletIdx}`}>
                      {[contact.name, contact.surname].filter(Boolean).join(" ")}{wallet.name ? ` — ${wallet.name}` : ""} ({wallet.address.slice(0, 6)}…{wallet.address.slice(-4)})
                    </option>
                  ))}
                </select>
                {fetchingLevel && <p className="text-xs text-muted-foreground">Checking account type…</p>}
                {falconLevel && !levelError && <p className="text-xs text-green-600">Detected: Falcon-{falconLevel}</p>}
                {levelError && <p className="text-xs text-amber-600">{levelError}</p>}
              </div>

              {/* Manual Falcon level picker — shown when auto-detection fails */}
              {levelError && accountAddress && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">Falcon level (manual)</label>
                  <select
                    className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                    value={manualFalconLevel ?? ""}
                    onChange={e => {
                      const v = e.target.value;
                      setManualFalconLevel(v === "512" ? 512 : v === "1024" ? 1024 : null);
                      setFormKeypairId("");
                      setExportSharePayload(null);
                      setExportKeyHex(null);
                    }}
                    disabled={generating || finishing}
                  >
                    <option value="">Select Falcon level…</option>
                    <option value="512">Falcon-512</option>
                    <option value="1024">Falcon-1024</option>
                  </select>
                </div>
              )}

              {/* Keypair selector */}
              {effectiveFalconLevel && (
                <div className="space-y-1">
                  <label className="text-xs font-medium">New keypair for this device</label>
                  <select
                    className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                    value={formKeypairId}
                    onChange={e => { setFormKeypairId(e.target.value); setExportSharePayload(null); setExportKeyHex(null); }}
                    disabled={generating || finishing}
                  >
                    <option value="">Generate new Falcon-{effectiveFalconLevel} keypair</option>
                    {availableKeypairs.map(k => (
                      <option key={k.id} value={k.id}>
                        Falcon-{k.level}{k.label ? ` — ${k.label}` : ""} ({new Date(k.createdAt).toLocaleDateString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Export section — shown after Generate Key */}
              {exportSharePayload && (
                <div className="rounded-md border border-border px-3 py-3 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    On your existing device, open the QR scanner → <strong>Load file</strong> and select the downloaded file.
                    The transaction form will open pre-filled. Alternatively, copy the key bytes and paste them manually into the <strong>publicKeyBytes</strong> field.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      className="flex-1 rounded-md border border-border px-3 py-1.5 text-xs"
                      onClick={async () => {
                        if (exportKeyHex) {
                          await navigator.clipboard.writeText(exportKeyHex).catch(() => {});
                          setKeyCopied(true);
                          setTimeout(() => setKeyCopied(false), 2000);
                        }
                      }}
                    >
                      {keyCopied ? "Copied!" : "Copy key bytes"}
                    </button>
                    <button
                      type="button"
                      className="flex-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium"
                      onClick={() => downloadShareTextFile(exportSharePayload)}
                    >
                      Download transaction file
                    </button>
                  </div>
                </div>
              )}

              {/* Finish error */}
              {finishError && (
                <div className="rounded-md border border-red-300 px-3 py-2 text-xs text-red-600">{finishError}</div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm" onClick={onClose} disabled={generating || finishing}>Cancel</button>
                <button
                  type="button"
                  className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
                  onClick={handleGenerateKey}
                  disabled={!canGenerate || generating || finishing}
                >
                  {generating ? "Generating…" : "Generate Key"}
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  onClick={handleFinishMigration}
                  disabled={!canFinish || finishing}
                >
                  {finishing ? "Verifying…" : "Finish Migration"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── FetchRecoverableModal ─────────────────────────────────────────────────────

type FetchRecoverableTarget =
  | { kind: "folio"; folio: Folio }
  | { kind: "contact"; contactName: string; address: string; chainId: number };

type SyncResult = {
  address: string;
  isActive: boolean;
  threshold: number;
  participantCount: number;
  action: "updated" | "addressPatched" | "created";
};

function FetchRecoverableModal({
  folios,
  contacts,
  domains,
  recoveries,
  updateRecovery,
  addRecovery,
  onClose,
}: {
  folios: Folio[];
  contacts: Contact[];
  domains: Domain[];
  recoveries: Recovery[];
  updateRecovery: (id: string, patch: Partial<Recovery>) => Promise<unknown>;
  addRecovery: (input: {
    name: string; recoverableAddress: string | null;
    participants: string[] | null; threshold: number | null; chainId: number | null; status: boolean | null;
  }) => Promise<unknown>;
  onClose: () => void;
}) {
  const [selectedKey, setSelectedKey] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<SyncResult[] | null>(null);

  // Build combined option list: folios + contact wallets
  const options = React.useMemo(() => {
    const items: Array<{ key: string; label: string; target: FetchRecoverableTarget }> = [];
    for (const folio of folios) {
      const domain = domains.find(d => d.chainId === folio.chainId);
      if (!domain) continue;
      items.push({
        key: `folio:${folio.id}`,
        label: `${folio.name || folio.address.slice(0, 10)} (${folio.address.slice(0, 8)}…) — ${domain.name}`,
        target: { kind: "folio", folio },
      });
    }
    for (const contact of contacts) {
      for (const wallet of contact.wallets ?? []) {
        const domain = domains.find(d => d.chainId === wallet.chainId);
        if (!domain) continue;
        const contactName = [contact.name, contact.surname].filter(Boolean).join(" ");
        items.push({
          key: `contact:${contact.id}:${wallet.address}`,
          label: `${contactName} (${wallet.address.slice(0, 8)}…) — ${domain.name}`,
          target: { kind: "contact", contactName, address: wallet.address, chainId: wallet.chainId },
        });
      }
    }
    return items;
  }, [folios, contacts, domains]);

  const selectedOption = options.find(o => o.key === selectedKey) ?? null;

  async function handleFetch() {
    if (!selectedOption) return;
    setBusy(true);
    setError(null);
    setResults(null);

    const target = selectedOption.target;
    const accountAddress = target.kind === "folio" ? target.folio.address : target.address;
    const chainId = target.kind === "folio" ? target.folio.chainId : target.chainId;
    const domain = domains.find(d => d.chainId === chainId);
    if (!domain) { setError("No domain found for this chain."); setBusy(false); return; }

    // Determine keypair level for folios; default to 512 for contact wallets
    let keypairLevel: 512 | 1024 = 512;
    if (target.kind === "folio") {
      try {
        const kps = await listKeypairs();
        const kp = kps.find(k => k.id === target.folio.keypairId);
        keypairLevel = kp?.level === 1024 ? 1024 : 512;
      } catch { /* default 512 */ }
    }

    try {
      const onChainEntries = await fetchRecoverableDetails({
        accountAddress: accountAddress as Address,
        rpcUrl: domain.rpcUrl,
        entryPoint: domain.entryPoint as Address,
        keypairLevel,
      });

      if (onChainEntries.length === 0) {
        setResults([]);
        setBusy(false);
        return;
      }

      const synced: SyncResult[] = [];

      for (const entry of onChainEntries) {
        const addrLower = entry.recoverableAddress.toLowerCase();

        // 1. Find a local record that already has this recoverable address
        const matched = recoveries.find(
          r => r.name.toLowerCase() === accountAddress.toLowerCase()
            && r.chainId === chainId
            && r.recoverableAddress.toLowerCase() === addrLower
        );
        if (matched) {
          await updateRecovery(matched.id, {
            status: entry.isActive,
            consumed: entry.isActive ? false : matched.consumed,
            ...(entry.threshold    !== null && { threshold:    entry.threshold }),
            ...(entry.participants !== null && { participants: entry.participants }),
          });
          synced.push({ address: entry.recoverableAddress, isActive: entry.isActive, threshold: entry.threshold ?? matched.threshold, participantCount: (entry.participants ?? matched.participants).length, action: "updated" });
          continue;
        }

        // 2. Find a local record for this account with no address yet
        const unaddressed = recoveries.find(
          r => r.name.toLowerCase() === accountAddress.toLowerCase()
            && r.chainId === chainId
            && !r.recoverableAddress
        );
        if (unaddressed) {
          await updateRecovery(unaddressed.id, {
            recoverableAddress: entry.recoverableAddress,
            status: entry.isActive,
            consumed: entry.isActive ? false : unaddressed.consumed,
            ...(entry.threshold    !== null && { threshold:    entry.threshold }),
            ...(entry.participants !== null && { participants: entry.participants }),
          });
          synced.push({ address: entry.recoverableAddress, isActive: entry.isActive, threshold: entry.threshold ?? unaddressed.threshold, participantCount: (entry.participants ?? unaddressed.participants).length, action: "addressPatched" });
          continue;
        }

        // 3. Create a new minimal record
        await addRecovery({
          name: accountAddress,
          recoverableAddress: entry.recoverableAddress,
          participants: entry.participants ?? [],
          threshold: entry.threshold ?? 1,
          chainId,
          status: entry.isActive,
        });
        synced.push({ address: entry.recoverableAddress, isActive: entry.isActive, threshold: entry.threshold ?? 1, participantCount: (entry.participants ?? []).length, action: "created" });
      }

      setResults(synced);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch on-chain details.");
    } finally {
      setBusy(false);
    }
  }

  const actionLabel: Record<SyncResult["action"], string> = {
    updated: "Status updated",
    addressPatched: "Address discovered",
    created: "New record created",
  };

  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 2147483647,
        background: "rgba(0,0,0,0.35)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        className="bg-background text-foreground"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(480px, calc(100vw - 32px))", borderRadius: 12, padding: 16, boxShadow: "0 10px 30px rgba(0,0,0,0.3)" }}
      >
        <h2 className="mb-3 text-base font-semibold material-gold-text">Fetch Recoverable Details</h2>

        {results === null ? (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Select an account to query. The on-chain recoverable list will be synced into your local store.
            </p>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Account</label>
                <select
                  className="w-full rounded-md border border-border bg-background text-foreground px-2 py-1.5 text-sm"
                  value={selectedKey}
                  onChange={e => setSelectedKey(e.target.value)}
                  disabled={busy}
                >
                  <option value="">— Select account —</option>
                  {options.map(o => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  className="rounded-md border px-3 py-1.5 text-sm"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium disabled:opacity-50"
                  onClick={handleFetch}
                  disabled={!selectedKey || busy}
                >
                  {busy ? "Fetching…" : "Fetch"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {results.length === 0 ? (
              <p className="text-sm text-muted-foreground mb-4">No recoverables found on-chain for this account.</p>
            ) : (
              <div className="mb-4 space-y-2">
                <p className="text-sm font-medium">{results.length} recoverable{results.length !== 1 ? "s" : ""} synced:</p>
                {results.map(r => (
                  <div key={r.address} className="rounded-md border border-border px-3 py-2 text-xs font-mono">
                    <div className="truncate text-muted-foreground">{r.address}</div>
                    <div className="mt-0.5 flex gap-2 flex-wrap">
                      <span className={r.isActive ? "text-green-600" : "text-gray-500"}>
                        {r.isActive ? "Enabled" : "Disabled"}
                      </span>
                      {r.participantCount > 0 && (
                        <span className="text-muted-foreground">
                          {r.participantCount} guardian{r.participantCount !== 1 ? "s" : ""}, threshold {r.threshold}
                        </span>
                      )}
                      <span className="text-muted-foreground">— {actionLabel[r.action]}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium"
                onClick={onClose}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Main page component ───────────────────────────────────────────────────────

export function RecoveryPage() {
  // ── Filter / sort state ──────────────────────────────────────────────────
  const [query, setQuery] = React.useState("");
  const [chainIdFilter, setChainIdFilter] = React.useState<number>(0);
  const [statusFilter, setStatusFilter] = React.useState<string>("");
  const [sortMode, setSortMode] = React.useState<RecoverySortMode>("nameAsc");

  const location = useLocation();

  // ── Modal state ──────────────────────────────────────────────────────────
  const [recoveryToDelete, setRecoveryToDelete] = React.useState<Recovery | null>(null);
  const [editingRecovery, setEditingRecovery] = React.useState<Recovery | null>(null);
  const [qrRecovery, setQrRecovery] = React.useState<Recovery | null>(null);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isImportOpen, setIsImportOpen] = React.useState(
    !!(location.state as any)?.importRecovery
  );
  const [importPrefill, setImportPrefill] = React.useState<ImportPrefill | null>(
    (location.state as any)?.importRecovery ?? null
  );
  const [isRecoverOpen, setIsRecoverOpen] = React.useState(false);
  const [isInitiateOpen, setIsInitiateOpen] = React.useState(false);
  const [isMigrateOpen, setIsMigrateOpen] = React.useState(false);
  const [isAttestationOpen, setIsAttestationOpen] = React.useState(false);
  const [attestationPrefill, setAttestationPrefill] = React.useState<AttestationPrefill | null>(null);
  const [isFetchOpen, setIsFetchOpen] = React.useState(false);
  const [resettingRecovery, setResettingRecovery] = React.useState<Recovery | null>(null);

  // ── Data hooks ───────────────────────────────────────────────────────────
  const {
    recoveries,
    loading,
    error,
    addRecovery,
    updateRecovery,
    deleteRecovery,
  } = useRecoveryList({ query, chainId: chainIdFilter, sortMode, status: statusFilter });

  const { folios } = useFolios();
  const { domains } = useDomains();
  const { contacts } = useContactsList({ sortMode: "nameAsc" });
  const { attestations } = useAttestations();

  // ── Derived maps ─────────────────────────────────────────────────────────
  const chainMap = React.useMemo(() => {
    const map = new Map<number, string>();
    for (const d of domains) {
      if (!map.has(d.chainId)) map.set(d.chainId, d.name);
    }
    return map;
  }, [domains]);

  const folioAddressMap = React.useMemo(
    () => new Map(folios.map(f => [`${f.address.toLowerCase()}:${f.chainId}`, f])),
    [folios]
  );

  const contactMap = React.useMemo(() => buildContactMap(contacts), [contacts]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  function getDisplayName(r: Recovery): string {
    return folioAddressMap.get(`${r.name.toLowerCase()}:${r.chainId}`)?.name ?? shortenAddress(r.name);
  }

  function getChainName(r: Recovery): string {
    return chainMap.get(r.chainId) ?? `Chain ${r.chainId}`;
  }

  // ── Click outside to close action menus ──────────────────────────────────
  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest("details")) return;
      document.querySelectorAll("details[open]").forEach(d => d.removeAttribute("open"));
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Export handlers ──────────────────────────────────────────────────────
  function exportSingleItem(r: Recovery) {
    const folio = folioAddressMap.get(`${r.name.toLowerCase()}:${r.chainId}`);
    const folioName = folio?.name ?? null;
    const chainName = getChainName(r);
    const folioLabel = (folioName ?? "unknown").replace(/[^a-zA-Z0-9\-_]/g, "-").toLowerCase();
    const chainLabel = chainName.replace(/[^a-zA-Z0-9\-_]/g, "-").toLowerCase();
    const text = buildRecoveryExportText(r, folioName, chainName, contactMap);
    downloadTextFile(`recovery-${folioLabel}-${chainLabel}.txt`, text);
  }

  function exportAllItems() {
    if (recoveries.length === 0) return;
    const blocks = recoveries.map((r) => {
      const folioName = folioAddressMap.get(`${r.name.toLowerCase()}:${r.chainId}`)?.name ?? null;
      const chainName = getChainName(r);
      return buildRecoveryExportText(r, folioName, chainName, contactMap);
    });
    downloadTextFile("recovery-export.txt", blocks.join("\n\n---\n\n"));
  }

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return <div className="p-4">Loading recovery data…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="shrink-0 text-2xl leading-tight font-semibold text-foreground material-charcoal-text material-gold-text">
        Recoverables
      </h1>

      {/* ── Filter bar ── */}
      <div className="flex flex-col gap-2">
        <select
          className="h-11 sm:h-9 w-[140px] rounded-md border border-border bg-card px-2 text-sm text-foreground"
          value={chainIdFilter}
          onChange={(e) => setChainIdFilter(Number(e.target.value))}
        >
          <option value={0}>Show all</option>
          {[...chainMap.entries()].map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>

        <input
          className="h-11 sm:h-9 w-full rounded-md border border-border bg-card px-2 text-sm text-foreground placeholder:text-muted sm:max-w-md"
          placeholder="Search by folio address…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <div className="flex flex-wrap items-center justify-center gap-2">
          <RecoveryFiltersDropdown
            sortMode={sortMode}
            setSortMode={setSortMode}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
          &nbsp;
          <button
            className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={() => setIsCreateOpen(true)}
          >
            &nbsp;Create recoverable&nbsp;
          </button>

          <button
            className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={() => setIsImportOpen(true)}
          >
            &nbsp;Import recovery&nbsp;
          </button>

          <button
            className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm disabled:opacity-50"
            onClick={exportAllItems}
            disabled={recoveries.length === 0}
          >
            &nbsp;Export recoverable details&nbsp;
          </button>

          <button
            className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={() => setIsRecoverOpen(true)}
          >
            &nbsp;Recover account&nbsp;
          </button>

          <button
            className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={() => setIsFetchOpen(true)}
          >
            &nbsp;Fetch recoverable details&nbsp;
          </button>

          <button
            className="h-11 sm:h-9 rounded-md border border-border bg-card px-3 text-sm"
            onClick={() => { setAttestationPrefill(null); setIsAttestationOpen(true); }}
          >
            &nbsp;Create attestation&nbsp;
          </button>
        </div>
      </div>

      {/* ── Empty state ── */}
      {recoveries.length === 0 ? (
        <div className="text-sm text-muted">
          No recovery items found. Click &quot;Create recoverable&quot; to get started.
        </div>
      ) : (
        <ul className="space-y-2">
          {recoveries.map((r) => {
            const displayName = getDisplayName(r);
            const chainName = getChainName(r);

            return (
              <li key={r.id} className="w-full">
                <div className="w-full rounded-lg border border-border bg-card px-4 py-3">
                  <div className="grid gap-3 sm:gap-x-6 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.6fr)_auto] sm:items-center">

                    {/* Col 1: Account name */}
                    <div className="min-w-0">
                      <div className="truncate text-base font-medium sm:text-lg material-gold-text">
                        {displayName}
                      </div>
                      <div className="truncate text-xs text-muted-foreground font-mono">
                        {shortenAddress(r.name)}
                      </div>
                    </div>

                    {/* Col 2: Domain */}
                    <div className="min-w-0">
                      <div className="text-xs text-muted">Domain</div>
                      <div className="truncate text-sm">{chainName} ({r.chainId})</div>
                    </div>

                    {/* Col 3: Recoverable address */}
                    <div className="min-w-0">
                      <div className="text-xs text-muted">Recoverable Contract Address</div>
                      <div className="truncate text-sm font-mono">
                        {r.recoverableAddress ? shortenAddress(r.recoverableAddress) : "—"}
                      </div>
                    </div>

                    {/* Col 4: Status */}
                    <div className="min-w-0">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          r.consumed
                            ? "bg-amber-100 text-amber-800"
                            : r.status
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {r.consumed ? "Consumed" : r.status ? "Enabled" : "Disabled"}
                      </span>
                      <div className="mt-0.5 text-xs text-muted">{r.threshold}/{r.participants.length} threshold</div>
                    </div>

                    {/* Col 5: Actions */}
                    <div className="justify-self-start sm:justify-self-end">
                      <details className="relative inline-block">
                        <summary className="cursor-pointer list-none rounded-md border border-border bg-background px-3 py-2.5 text-sm sm:px-2 sm:py-1 sm:text-xs">
                          Actions
                        </summary>
                        <div className="absolute right-0 mt-1 w-40 rounded-md border border-border bg-background shadow-lg z-50">
                          <button
                            className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                              setEditingRecovery(r);
                            }}
                          >
                            Edit
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button
                            className="block w-full px-4 py-3 text-left text-sm text-red-600 sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                              setRecoveryToDelete(r);
                            }}
                          >
                            Delete
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button
                            className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                              setQrRecovery(r);
                            }}
                          >
                            Share
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button
                            className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                              exportSingleItem(r);
                            }}
                          >
                            Export
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button
                            className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                            onClick={(e) => {
                              (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                              setAttestationPrefill({
                                chainId: r.chainId,
                                accountAddress: r.name,
                                recoverableAddress: r.recoverableAddress,
                                paymaster: r.paymaster,
                              });
                              setIsAttestationOpen(true);
                            }}
                          >
                            Create Attestation
                          </button>
                          {r.consumed && (
                            <>
                              <div className="my-1 border-t border-border" />
                              <button
                                className="block w-full px-4 py-3 text-left text-sm sm:px-3 sm:py-2 sm:text-xs hover:bg-primary hover:text-primary-foreground"
                                onClick={(e) => {
                                  (e.currentTarget.closest("details") as HTMLDetailsElement)?.removeAttribute("open");
                                  setResettingRecovery(r);
                                }}
                              >
                                Reset
                              </button>
                            </>
                          )}
                        </div>
                      </details>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* ── Delete confirmation modal ── */}
      {recoveryToDelete && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setRecoveryToDelete(null); }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(6px)",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch" as any,
            padding: 16,
            minHeight: "100dvh",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            className="bg-background text-foreground"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(448px, calc(100dvw - 32px))",
              borderRadius: 12,
              padding: 16,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
            }}
          >
            <h2 className="text-base font-semibold material-gold-text">Delete recovery?</h2>
            <p className="mt-2 text-sm text-muted">
              This will remove the recovery configuration for{" "}
              <strong>{getDisplayName(recoveryToDelete)}</strong> from your local list.
              This does <strong>not</strong> affect the on-chain recoverable contract — you will need
              to disable it separately.
            </p>
            <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                className="rounded-md border px-4 py-3 text-sm sm:px-3 sm:py-1"
                onClick={() => setRecoveryToDelete(null)}
              >
                &nbsp;Cancel&nbsp;
              </button>
              &nbsp;
              <button
                className="rounded-md bg-primary px-4 py-3 text-sm sm:px-3 sm:py-1 text-primary-foreground"
                onClick={() => {
                  deleteRecovery(recoveryToDelete.id);
                  setRecoveryToDelete(null);
                }}
              >
                &nbsp;Yes, delete&nbsp;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create modal ── */}
      {isCreateOpen && (
        <CreateRecoveryModal
          folios={folios}
          contacts={contacts}
          chainMap={chainMap}
          domains={domains}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={async (input) => {
            await addRecovery(input);
          }}
        />
      )}

      {/* ── Import modal ── */}
      {isImportOpen && (
        <ImportRecoveryModal
          folios={folios}
          contacts={contacts}
          chainMap={chainMap}
          prefill={importPrefill}
          onClose={() => { setIsImportOpen(false); setImportPrefill(null); }}
          onSubmit={async (input) => { await addRecovery(input); }}
        />
      )}

      {/* ── Edit modal ── */}
      {editingRecovery && (
        <EditRecoveryModal
          recovery={editingRecovery}
          contacts={contacts}
          contactMap={contactMap}
          folioName={folioAddressMap.get(`${editingRecovery.name.toLowerCase()}:${editingRecovery.chainId}`)?.name ?? null}
          folio={folioAddressMap.get(`${editingRecovery.name.toLowerCase()}:${editingRecovery.chainId}`) ?? null}
          domain={domains.find(d => d.chainId === editingRecovery.chainId) ?? null}
          onClose={() => setEditingRecovery(null)}
          onUpdate={async (patch) => {
            await updateRecovery(editingRecovery.id, patch);
          }}
        />
      )}

      {/* ── QR / Share modal ── */}
      {qrRecovery && (
        <ShareQrModal
          payload={buildRecoveryShare(qrRecovery)}
          title={`Share Recovery — ${getDisplayName(qrRecovery)}`}
          onClose={() => setQrRecovery(null)}
        />
      )}

      {/* ── Recover account chooser ── */}
      {isRecoverOpen && (
        <RecoverAccountChooser
          onInitiate={() => { setIsRecoverOpen(false); setIsInitiateOpen(true); }}
          onMigrate={() => { setIsRecoverOpen(false); setIsMigrateOpen(true); }}
          onClose={() => setIsRecoverOpen(false)}
        />
      )}

      {/* ── Initiate recovery modal ── */}
      {isInitiateOpen && (
        <InitiateRecoveryModal
          attestations={attestations}
          domains={domains}
          contacts={contacts}
          onClose={() => setIsInitiateOpen(false)}
        />
      )}

      {/* ── Migrate account modal ── */}
      {isMigrateOpen && (
        <MigrateAccountModal
          domains={domains}
          contacts={contacts}
          folios={folios}
          onClose={() => setIsMigrateOpen(false)}
        />
      )}

      {/* ── Fetch recoverable details modal (placeholder) ── */}
      {isFetchOpen && (
        <FetchRecoverableModal
          folios={folios}
          contacts={contacts}
          domains={domains}
          recoveries={recoveries}
          updateRecovery={updateRecovery}
          addRecovery={addRecovery}
          onClose={() => setIsFetchOpen(false)}
        />
      )}

      {/* ── Create attestation modal ── */}
      {isAttestationOpen && (
        <CreateAttestationModal
          prefill={attestationPrefill}
          folios={folios}
          contacts={contacts}
          domains={domains}
          onClose={() => { setIsAttestationOpen(false); setAttestationPrefill(null); }}
        />
      )}

      {/* ── Reset recoverable modal ── */}
      {resettingRecovery && (
        <ResetRecoverableModal
          recovery={resettingRecovery}
          folios={folios}
          domains={domains}
          updateRecovery={updateRecovery}
          onClose={() => setResettingRecovery(null)}
        />
      )}
    </div>
  );
}
