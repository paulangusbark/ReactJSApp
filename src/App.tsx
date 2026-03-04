import React from "react";
import { HashRouter, Routes, Route, Link, NavLink, Navigate } from "react-router-dom";
import { Button } from "./components/ui/button";
import { createPortal } from "react-dom";
import { Badge } from "./components/ui/badge";
import './index.css'
const AddressBook  = React.lazy(() => import("./pages/addressBook").then(m => ({ default: m.AddressBook })));
const Contracts    = React.lazy(() => import("./pages/contracts").then(m => ({ default: m.Contracts })));
const Contacts     = React.lazy(() => import("./pages/contacts").then(m => ({ default: m.Contacts })));
const Coins        = React.lazy(() => import("./pages/coinManagement").then(m => ({ default: m.Coins })));
const Folios       = React.lazy(() => import("./pages/portfolio").then(m => ({ default: m.Folios })));
const Terms        = React.lazy(() => import("./pages/legal").then(m => ({ default: m.Terms })));
const Privacy      = React.lazy(() => import("./pages/legal").then(m => ({ default: m.Privacy })));
const Transactions = React.lazy(() => import("./pages/transaction").then(m => ({ default: m.Transactions })));
const LoginPage    = React.lazy(() => import("./pages/LoginPage").then(m => ({ default: m.LoginPage })));
const UserGuide    = React.lazy(() => import("./pages/userGuide").then(m => ({ default: m.UserGuide })));
import { initWallet } from "./lib/wallets";
import logo from "./assets/logo.png";
import { FalconProvider } from "./crypto/falconProvider";
import { QrScanner } from "./components/ui/QrScanner";
import { decodeSharePayload } from "./lib/sharePayload";
import { importSharePayload } from "./lib/shareImporters";
import { useFolios } from "./hooks/useFolios";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { OnboardingModal } from "./components/OnboardingModal";

function QrScanModal({
  open,
  onClose,
  onDecoded,
}: {
  open: boolean;
  onClose: () => void;
  onDecoded: (payload: string) => void;
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
            <div className="text-sm font-semibold">Scan QR code</div>
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
          </div>
        </div>
      </div>
    </>,
    document.body
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
              <NavDropItem to="/legal/terms" label="Terms" onSelect={() => setOpen(false)} />
              <NavDropItem to="/legal/privacy" label="Privacy" onSelect={() => setOpen(false)} />
              <NavDropItem to="/user-guide" label="User Guide" onSelect={() => setOpen(false)} />
              <div className="my-1 border-t border-border" />
              <button
                className="block w-full rounded-lg px-3 py-3 sm:py-2 text-left text-sm text-red-600 hover:bg-neutral-100"
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
          ? "bg-neutral-900 text-white"
          : "hover:bg-neutral-100"
        }`
      }
    >
      {label}
    </NavLink>
  );
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
            <img
              src={logo}
              alt="QuantumAccount"
              style={{ height: 32, width: "auto" }}
            />
          </Link>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={onOpenScan}>
              Scan
            </Button>&nbsp;
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
  const [address, setAddress] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [scanOpen, setScanOpen] = React.useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = React.useState(
    () => localStorage.getItem("cointrol_onboarding_seen") === "1"
  );

  const { folios, loading: foliosLoading, updateFolio } = useFolios();

  const handleDecoded = React.useCallback(async (qrText: string) => {
    try {
      const payload = decodeSharePayload(qrText); // -> SharePayload
      const result = await importSharePayload(payload, { folios, updateFolio });
      console.log("[QR] import result:", result);
    } catch (e) {
      console.error("[QR] import failed:", e);
      // optionally show a toast
    }
  }, [folios, updateFolio]);


  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        console.log("[Wallet] Initialising…");
        const addr = await initWallet();
        console.log("[Wallet] Ready with address:", addr);
        if (!cancelled) {
          setAddress(addr);
        }
      } catch (e: any) {
        console.error("[Wallet] Init failed:", e);
        if (!cancelled) {
          setError(e?.message ?? "Unknown wallet init error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  function handleOnboardingDismiss() {
    localStorage.setItem("cointrol_onboarding_seen", "1");
    setOnboardingDismissed(true);
  }

  const showOnboarding =
    !onboardingDismissed &&
    !foliosLoading &&
    folios.length === 0;

  return (
    <>
      <QrScanModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDecoded={handleDecoded}
      />
      <OnboardingModal
        open={showOnboarding}
        onDismiss={handleOnboardingDismiss}
      />
      <AppShell onOpenScan={() => setScanOpen(true)}>
        {error ? (
          <div className="p-6 text-red-700">
            <h1 className="text-lg font-semibold mb-2">Wallet initialisation failed</h1>
            <p className="mb-2">{error}</p>
            <p className="text-sm text-neutral-600">Check the console for details.</p>
          </div>
        ) : !address ? (
          <div className="p-6">Initialising QuantumAccount wallet…</div>
        ) : (
          <Routes>
            <Route index element={<Folios />} />
            <Route path="dashboard" element={<Folios />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="contracts" element={<Contracts />} />
            <Route path="coins" element={<Coins />} />
            <Route path="addressbook" element={<AddressBook />} />
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

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <FalconProvider>
          <React.Suspense fallback={
            <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
              Loading…
            </div>
          }>
            <Routes>
              {/* Public routes */}
              <Route path="login" element={<LoginPage />} />
              <Route path="legal/terms" element={<Terms />} />
              <Route path="legal/privacy" element={<Privacy />} />
              <Route path="user-guide" element={<UserGuide />} />

              {/* All other routes require authentication */}
              <Route path="/*" element={<ProtectedApp />} />
            </Routes>
          </React.Suspense>
        </FalconProvider>
      </AuthProvider>
    </HashRouter>
  );
}
