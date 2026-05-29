import React from "react";
import { HashRouter, Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./components/ui/button";
import { createPortal } from "react-dom";
import { Badge } from "./components/ui/badge";
import './index.css'
const AddressBook  = React.lazy(() => import("./pages/addressBook").then(m => ({ default: m.AddressBook })));
const Contracts    = React.lazy(() => import("./pages/contracts").then(m => ({ default: m.Contracts })));
const Contacts     = React.lazy(() => import("./pages/contacts").then(m => ({ default: m.Contacts })));
const Coins        = React.lazy(() => import("./pages/coinManagement").then(m => ({ default: m.Coins })));
const Folios       = React.lazy(() => import("./pages/portfolio").then(m => ({ default: m.Folios })));
const Keys         = React.lazy(() => import("./pages/key").then(m => ({ default: m.Keys })));
const Terms        = React.lazy(() => import("./pages/legal").then(m => ({ default: m.Terms })));
const Privacy      = React.lazy(() => import("./pages/legal").then(m => ({ default: m.Privacy })));
const Transactions = React.lazy(() => import("./pages/transaction").then(m => ({ default: m.Transactions })));
const LoginPage    = React.lazy(() => import("./pages/LoginPage").then(m => ({ default: m.LoginPage })));
const RegisterPage = React.lazy(() => import("./pages/RegisterPage").then(m => ({ default: m.RegisterPage })));
const UserGuide    = React.lazy(() => import("./pages/userGuide").then(m => ({ default: m.UserGuide })));
const Recovery     = React.lazy(() => import("./pages/recovery").then(m => ({ default: m.RecoveryPage })));
import { initWallet } from "./lib/wallets";
import { FalconProvider } from "./crypto/falconProvider";
import { QrScanner } from "./components/ui/QrScanner";
import { decodeShareAny } from "./lib/shareTextFormat";
import { importSharePayload, applyAddNewContact, applyContactUpdate, applyAddContract, applyAddCoin } from "./lib/shareImporters";
import type { ContactImportReview, ContactMatchInfo, ContractImportReview, CoinImportReview } from "./lib/shareImporters";
import { ContactImportResolutionModal } from "./components/ui/ContactImportResolutionModal";
import { ContractImportReviewModal } from "./components/ui/ContractImportReviewModal";
import { CoinImportReviewModal } from "./components/ui/CoinImportReviewModal";
import { useFolios } from "./hooks/useFolios";
import { useDomains } from "./hooks/useDomains";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import { OnboardingModal } from "./components/OnboardingModal";
import { CointrolLogo } from "./components/CointrolLogo";

function QrScanModal({
  open,
  onClose,
  onDecoded,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onDecoded: (payload: string) => void;
  error?: string | null;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483646,
          background: "rgba(0,0,0,0.5)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 2147483647,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
        onClick={onClose}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold material-gold-text">Scan QR code</div>
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="p-2">
            {/* IMPORTANT: unmounting this stops the camera (your QrScanner cleanup) */}
            <QrScanner
              onDecoded={(payload) => {
                onDecoded(payload);
                onClose();
              }}
            />
            {error && (
              <p className="mt-1 px-2 pb-2 text-xs text-red-600">{error}</p>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function ThemeToggleIcon() {
  const { resolved, setTheme } = useTheme();
  return (
    <button
      className="inline-flex h-11 sm:h-8 w-11 sm:w-8 items-center justify-center rounded-md border border-border hover:border-primary transition-colors"
      onClick={() => setTheme(resolved === "dark" ? "light" : "dark")}
      aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {resolved === "dark" ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}

function NavDropdown() {
  const { signOut } = useAuth();
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);

  const MENU_W = 208;
  const GAP = 8;

  const [pos, setPos] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const computePos = React.useCallback(() => {
    if (!btnRef.current) return;

    const r = btnRef.current.getBoundingClientRect();

    // Use visualViewport if present (mobile browsers / emulation)
    const vv = window.visualViewport;
    const vw = vv?.width ?? window.innerWidth;
    const offsetLeft = vv?.offsetLeft ?? 0;
    const offsetTop = vv?.offsetTop ?? 0;

    const top = r.bottom + GAP + offsetTop;

    // Right-align to the button, but clamp within viewport
    const idealLeft = r.right - MENU_W + offsetLeft;
    const minLeft = GAP + offsetLeft;
    const maxLeft = vw - MENU_W - GAP + offsetLeft;

    const left = Math.max(minLeft, Math.min(idealLeft, maxLeft));

    setPos({ top, left });
  }, []);

  function toggle() {
    const next = !open;
    if (next) computePos();
    setOpen(next);
  }

  // close on Escape
  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // keep position updated on resize/scroll/visualViewport changes while open
  React.useEffect(() => {
    if (!open) return;

    const update = () => computePos();

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, [open, computePos]);

  return (
    <>
      <Button ref={btnRef} size="sm" variant="outline" onClick={toggle}>
        Menu
      </Button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <div
              onClick={() => setOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9998,
                backgroundColor: "rgba(0,0,0,0.5)",
              }}
            />

            <div
              className="rounded-xl border border-border bg-card shadow-lg"
              style={{
                position: "fixed",
                zIndex: 9999,
                top: pos.top,
                left: pos.left,
                width: MENU_W,
                padding: 4,
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <NavDropItem to="/dashboard" label="Home" onSelect={() => setOpen(false)} />
              <NavDropItem to="/transactions" label="Transactions" onSelect={() => setOpen(false)} />
              <NavDropItem to="/addressbook" label="Address Book" onSelect={() => setOpen(false)} />
              <NavDropItem to="/contacts" label="Contacts" onSelect={() => setOpen(false)} />
              <NavDropItem to="/contracts" label="Smart Contracts" onSelect={() => setOpen(false)} />
              <NavDropItem to="/coins" label="Coins" onSelect={() => setOpen(false)} />
              <NavDropItem to="/keys" label="Keys" onSelect={() => setOpen(false)} />
              <NavDropItem to="/recovery" label="Recoverables" onSelect={() => setOpen(false)} />
              <NavDropItem to="/legal/terms" label="Terms" onSelect={() => setOpen(false)} />
              <NavDropItem to="/legal/privacy" label="Privacy" onSelect={() => setOpen(false)} />
              <NavDropItem to="/user-guide" label="User Guide" onSelect={() => setOpen(false)} />
              <div className="my-1 border-t border-border" />
              <button
                className="block w-full rounded-lg px-3 py-3 sm:py-2 text-left text-sm text-red-600 hover:bg-card"
                onClick={() => {
                  setOpen(false);
                  signOut();
                }}
              >
                Log out
              </button>
            </div>
          </>,
          document.body
        )}
    </>
  );
}

function NavDropItem({
  to,
  label,
  onSelect,
}: {
  to: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onSelect}
      className={({ isActive }) =>
        `block rounded-lg px-3 py-3 sm:py-2 text-sm ${isActive
          ? "bg-primary text-primary-foreground"
          : "hover:bg-card"
        }`
      }
    >
      {label}
    </NavLink>
  );
}


function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

// --- UI Shell & Navigation ---
function AppShell({ children, onOpenScan }: {
  children: React.ReactNode,
  onOpenScan: () => void,
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="flex items-center gap-2">
            <CointrolLogo className="h-16 w-16" />
          </Link>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onOpenScan}>
              Scan
            </Button>&nbsp;
            <ThemeToggleIcon />
            <NavDropdown />&nbsp;
            <Link
              to="/user-guide"
              className="inline-flex h-11 sm:h-8 items-center rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
            >
              Help
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6
  pb-[calc(56px+env(safe-area-inset-bottom))]
  lg:pb-6
  lg:grid-cols-[220px_1fr]">
        <section className="min-h-[60dvh] lg:col-span-2">{children}</section>
      </main>
      <BottomNav />
    </div>
  );
}

function AppContainer() {
  const [error, setError] = React.useState<string | null>(null);
  const [scanOpen, setScanOpen] = React.useState(false);
  const [scanError, setScanError] = React.useState<string | null>(null);
  const [pendingContactImport, setPendingContactImport] = React.useState<{
    incoming: ContactImportReview["incoming"];
    matches: ContactMatchInfo[];
  } | null>(null);
  const [pendingContractImport, setPendingContractImport] = React.useState<ContractImportReview | null>(null);
  const [pendingCoinImport, setPendingCoinImport] = React.useState<CoinImportReview | null>(null);
  const [onboardingDismissed, setOnboardingDismissed] = React.useState(
    () => localStorage.getItem("cointrol_onboarding_seen") === "1"
  );
  const [migrationDone, setMigrationDone] = React.useState(
    () => localStorage.getItem("cointrol_migration_v2_done") === "1"
  );

  const { folios, loading: foliosLoading, updateFolio, clearFolios } = useFolios();
  const { domains } = useDomains();
  const navigate = useNavigate();

  const handleDecoded = React.useCallback(async (qrText: string) => {
    setScanError(null);
    try {
      const payload = decodeShareAny(qrText.trim());
      if (payload.t === "recovery") {
        setScanOpen(false);
        navigate("/recovery", { state: { importRecovery: payload.data } });
        return;
      }
      if (payload.t === "txrequest") {
        setScanOpen(false);
        navigate("/transactions", { state: { txQr: payload.data } });
        return;
      }
      const result = await importSharePayload(payload);
      if (result.mode === "review") {
        setScanOpen(false);
        if (payload.t === "contact" || payload.t === "profile") {
          setPendingContactImport({ incoming: (result as any).incoming, matches: (result as any).matches });
        } else if (payload.t === "contract") {
          setPendingContractImport(result as ContractImportReview);
        } else if (payload.t === "coin") {
          setPendingCoinImport(result as CoinImportReview);
        }
        return;
      }
      console.log("[QR] import result:", result);
    } catch (e: any) {
      console.error("[QR] import failed:", e);
      setScanError(e?.message ?? "Could not recognise QR code");
    }
  }, [navigate]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initWallet();
      } catch (e: any) {
        console.error("[Wallet] Init failed:", e);
        if (!cancelled) setError(e?.message ?? "Unknown wallet init error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function handleOnboardingDismiss() {
    localStorage.setItem("cointrol_onboarding_seen", "1");
    setOnboardingDismissed(true);
  }

  async function handleMigrationAcknowledge() {
    await clearFolios();
    localStorage.setItem("cointrol_migration_v2_done", "1");
    setMigrationDone(true);
  }

  const showMigration =
    !migrationDone &&
    !foliosLoading &&
    folios.length > 0;

  const showOnboarding =
    !showMigration &&
    !onboardingDismissed &&
    !foliosLoading &&
    folios.length === 0;

  return (
    <>
      {showMigration && createPortal(
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2147483647,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 400,
              borderRadius: 12,
              padding: 24,
              boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
            }}
            className="bg-background text-foreground"
          >
            <h2 className="text-lg font-semibold mb-3 material-gold-text">Important: Wallet Migration</h2>
            <p className="text-sm mb-3">
              The system has been upgraded. Your existing wallets are no longer
              supported by the new infrastructure and will be removed.
            </p>
            <p className="text-sm mb-4">
              You will need to create a new wallet after this step. No funds on
              the blockchain are affected — only the local wallet data is being
              cleared.
            </p>
            <button
              type="button"
              onClick={handleMigrationAcknowledge}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              I understand
            </button>
          </div>
        </div>,
        document.body
      )}
      <QrScanModal
        open={scanOpen}
        onClose={() => { setScanOpen(false); setScanError(null); }}
        onDecoded={handleDecoded}
        error={scanError}
      />
      {pendingContactImport && (
        <ContactImportResolutionModal
          incoming={pendingContactImport.incoming}
          matches={pendingContactImport.matches}
          onUpdate={async (matchId, mergedWallets) => {
            await applyContactUpdate(matchId, mergedWallets);
            setPendingContactImport(null);
          }}
          onCombine={async (matchId, mergedWallets) => {
            await applyContactUpdate(matchId, mergedWallets);
            setPendingContactImport(null);
          }}
          onAddAsNew={async () => {
            await applyAddNewContact(pendingContactImport.incoming);
            setPendingContactImport(null);
          }}
          onCancel={() => setPendingContactImport(null)}
        />
      )}
      {pendingContractImport && (
        <ContractImportReviewModal
          incoming={pendingContractImport.incoming}
          existingId={pendingContractImport.existingId}
          onConfirm={async () => {
            await applyAddContract(pendingContractImport.incoming);
            setPendingContractImport(null);
          }}
          onCancel={() => setPendingContractImport(null)}
        />
      )}
      {pendingCoinImport && (
        <CoinImportReviewModal
          incoming={pendingCoinImport.incoming}
          existingId={pendingCoinImport.existingId}
          domains={domains}
          onConfirm={async (override) => {
            await applyAddCoin(
              override ? { ...pendingCoinImport.incoming, ...override } : pendingCoinImport.incoming,
              { folios, updateFolio }
            );
            setPendingCoinImport(null);
          }}
          onCancel={() => setPendingCoinImport(null)}
        />
      )}
      <OnboardingModal
        open={showOnboarding}
        onDismiss={handleOnboardingDismiss}
      />
      <AppShell onOpenScan={() => setScanOpen(true)}>
        {error ? (
          <div className="p-6 text-red-700">
            <h1 className="text-lg font-semibold mb-2 material-gold-text">Wallet initialisation failed</h1>
            <p className="mb-2">{error}</p>
            <p className="text-sm text-muted">Check the console for details.</p>
          </div>
        ) : (
          <Routes>
            <Route index element={<Folios />} />
            <Route path="dashboard" element={<Folios />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="coins" element={<Coins />} />
            <Route path="addressbook" element={<AddressBook />} />
            <Route path="keys" element={<Keys />} />
            <Route path="recovery" element={<Recovery />} />
            <Route path="legal/terms" element={<Terms />} />
            <Route path="legal/privacy" element={<Privacy />} />
            <Route path="user-guide" element={<UserGuide />} />
          </Routes>
        )}
      </AppShell>
    </>
  );
}


function Nav({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `block rounded-xl px-3 py-2 text-sm ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-background"}`}
    >
      {label}
    </NavLink>
  );
}

function BottomNav() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid h-14 max-w-md grid-cols-4 gap-2 px-2 text-center text-xs text-muted items-center">
        <NavLink to="/dashboard" className="flex h-full items-center justify-center">Home</NavLink>
        <NavLink to="/transactions" className="flex h-full items-center justify-center">Transactions</NavLink>
        <NavLink to="/legal/terms" className="flex h-full items-center justify-center">T&C</NavLink>
        <NavLink to="/legal/privacy" className="flex h-full items-center justify-center">Privacy</NavLink>
      </div>
    </div>
  );
}


function ProtectedApp() {
  const { firebaseUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!firebaseUser) return <Navigate to="/login" replace />;
  return <AppContainer />;
}

class ChunkErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const isChunkError =
      error instanceof Error &&
      (error.message.includes('dynamically imported module') ||
       error.message.includes('Failed to fetch') ||
       error.name === 'ChunkLoadError');

    if (isChunkError && !sessionStorage.getItem('chunkReload')) {
      sessionStorage.setItem('chunkReload', '1');
      window.location.reload();
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
          Something went wrong loading the page.{' '}
          <button className="underline ml-1" onClick={() => window.location.reload()}>Refresh</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  React.useEffect(() => {
    // App mounted successfully — clear the reload guard so future deploys can trigger a reload again.
    sessionStorage.removeItem('chunkReload');
  }, []);

  return (
    <ThemeProvider>
    <HashRouter>
      <ScrollToTop />
      <AuthProvider>
        <FalconProvider>
          <ChunkErrorBoundary>
            <React.Suspense fallback={
              <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
                Loading…
              </div>
            }>
              <Routes>
                {/* Public routes */}
                <Route path="login" element={<LoginPage />} />
                <Route path="register" element={<RegisterPage />} />
                <Route path="legal/terms" element={<Terms />} />
                <Route path="legal/privacy" element={<Privacy />} />
                <Route path="user-guide" element={<UserGuide />} />

                {/* All other routes require authentication */}
                <Route path="/*" element={<ProtectedApp />} />
              </Routes>
            </React.Suspense>
          </ChunkErrorBoundary>
        </FalconProvider>
      </AuthProvider>
    </HashRouter>
    </ThemeProvider>
  );
}
