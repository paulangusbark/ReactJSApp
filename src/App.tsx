import React from "react";
import { BrowserRouter, Routes, Route, Link, NavLink } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { createPortal } from "react-dom";
import { Badge } from "./components/ui/badge";
import { Label } from "./components/ui/label";
import { Switch } from "./components/ui/switch";
import './index.css'
import { AddressBook } from "./pages/addressBook";
import { Contracts } from "./pages/contracts";
import { Contacts } from "./pages/contacts";
import { Coins } from "./pages/coinManagement";
import { Folios } from "./pages/portfolio";
import { Privacy, Terms } from "./pages/legal";
import { Transactions } from "./pages/transaction";
import { initWallet } from "./lib/wallets";
import logo from "./assets/logo.png";

/**
 * QuantumAccount React Skeleton v2 — wired to Bundler/Paymaster APIs
 *
 * ENV (vite):
 *  - VITE_BUNDLER_URL=https://localhost:3001
 *  - VITE_PAYMASTER_URL=https://localhost:3002
 *  - VITE_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/XXXXX (optional if bundler needs it)
 *
 * NOTE: Endpoints are placeholders; adjust paths to match your servers.
 */

function NavDropdown() {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; right: number }>({ top: 0, right: 0 });

  function toggle() {
    const next = !open;

    if (next && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      // position menu under the button, right-aligned
      const top = r.bottom + 8;
      const right = Math.max(8, window.innerWidth - r.right);

      setPos({ top, right });
    }

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

  // keep position updated on resize/scroll while open
  React.useEffect(() => {
    if (!open) return;

    const update = () => {
      if (!btnRef.current) return;
      const r = btnRef.current.getBoundingClientRect();
      const menuWidth = 208;
      const right = Math.max(8, window.innerWidth - r.right);
      const top = r.bottom + 8;
      setPos({ top, right });
    };

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true); // true catches scroll in nested containers
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  return (
    <>
      <Button
        ref={btnRef}
        size="sm"
        variant="outline"
        onClick={toggle}
      >
        Menu
      </Button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop (dims + closes on click) */}
            <div
              onClick={() => setOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 9998,
                backgroundColor: "rgba(0,0,0,0.5)",
              }}
            />

            {/* Menu (above backdrop) */}
            <div
              className="rounded-xl border border-border bg-card shadow-lg"
              style={{
                position: "fixed",
                zIndex: 9999,
                top: pos.top,
                right: pos.right,
                left: "auto",
                width: 208,
                boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
                padding: 4,
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
        `block rounded-lg px-3 py-2 text-sm ${
          isActive
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
function AppShell({ children, address, domain }: {
  children: React.ReactNode,
  address?: string | null,
  domain: string
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
            {/* optional text next to it */}
            {/* <span className="font-semibold">QuantumAccount</span> */}
          </Link>
          <div className="flex items-center gap-2">
            <NavDropdown />&nbsp;
            <WalletSwitcher domain={domain} />
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6
  pb-[calc(56px+env(safe-area-inset-bottom))]
  lg:pb-6
  lg:grid-cols-[220px_1fr]">
        <section className="min-h-[60dvh]">{children}</section>
      </main>
      <BottomNav />
    </div>
  );
}

function AppContainer() {
  const [address, setAddress] = React.useState<string | null>(null);
  const [domain, setDomain] = React.useState<string>("LOCAL"); // needs to be changed to a selector
  const [error, setError] = React.useState<string | null>(null);


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

  return (
    <AppShell address={address} domain={domain}>
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
          <Route path="/" element={<Folios />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Folios />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/coins" element={<Coins />} />
          <Route path="/addressbook" element={<AddressBook />} />
          <Route path="/legal/terms" element={<Terms />} />
          <Route path="/legal/privacy" element={<Privacy />} />
        </Routes>
      )}
    </AppShell>
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
        <NavLink to="/dashboard">Home</NavLink>
        <NavLink to="/transactions">Transactions</NavLink>
        <NavLink to="/legal/terms">T&C</NavLink>
        <NavLink to="/legal/privacy">Privacy</NavLink>
      </div>
    </div>
  );
}

function NetworkPill({ address }: { address?: string | null }) {
  return (
    <Badge variant="secondary" className="rounded-full">
      {address ? address : "Loading…"}
    </Badge>
  );
}

function WalletSwitcher({ domain }: { domain: string }) { // need to add function to switch domains
  return (
    <Button size="sm" variant="outline">{domain}</Button>
  );
}



// --- Screens ---
export function Login() {
  return (
    <div className="mx-auto max-w-md">
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle>Welcome to QuantumAccount</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button className="w-full">Sign in with Google</Button>
          <Button className="w-full" variant="secondary">Sign in with Apple</Button>
          <Button className="w-full" variant="outline">Use existing wallet</Button>
          <Button className="w-full">Create new wallet</Button>
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor="terms">Accept Terms & Privacy</Label>
            <Switch id="terms" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --- Root App + Routes ---
export default function App() {
  return (
    <BrowserRouter>
      <AppContainer />
    </BrowserRouter>
  );
}
