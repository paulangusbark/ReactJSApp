import React from "react";
import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate } from "react-router-dom";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Textarea } from "./components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./components/ui/sheet";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Label } from "./components/ui/label";
import { Switch } from "./components/ui/switch";
import { toast } from "sonner";
import { Check, Clock, Loader2, Star, StarOff } from "lucide-react";
import { create } from "zustand";
import './index.css'
import { get } from "http";

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

// --- Types ---
export type Network = "Ethereum" | "Base";
export type Address = `0x${string}`;
export interface Contact { id: string; name: string; address: Address; favourite?: boolean; note?: string }
export interface TxStatus { phase: "idle" | "preparing" | "sponsored" | "simulated" | "submitted" | "included" | "finalized" | "failed"; hash?: string; userOpHash?: string; message?: string }

export interface PackedUserOperation {
  sender: Address;
  nonce: string; // uint256 as hex string
  initCode: `0x${string}`;
  callData: `0x${string}`;
  accountGasLimits: `0x${string}`; // packed
  preVerificationGas: string; // hex
  gasFees: `0x${string}`; // (prio<<128) | max
  paymasterAndData: `0x${string}`;
  signature: `0x${string}`;
}

export interface SubmitRequest { userOp: Omit<PackedUserOperation, "signature">; domain: string }
export interface SubmitResponse { success: boolean; signed_tx: `0x${string}`; result: string }
export interface UpdatePublicKey { sender: `0x${string}`; domain: string; oldKey: `0x${string}`; newKey: `0x${string}`; signature: `0x${string}` }
export interface GenericResponse { success: boolean; result: string }
export interface TxHashRequest { sender: `0x${string}`; userOpHash: `0x${string}` }
export interface TxReceipt { success: boolean; txHash: `0x${string}` }
export interface DomainRow { name: string }
export interface GetAllDomainsResponse { success: boolean; data: DomainRow[] }
export interface DomainDetailsResponse { success: boolean; data: { name: string; isTest: number; entryPoint: `0x${string}`; falcon: `0x${string}`; chainId: number; rpcUrl: string; created_at: string; updated_at: string } }
export interface PaymasterRequest { paymaster: `0x${string}`; domain: string; sender: `0x${string}`; flag: number; signature: `0x${string}` }
export interface CreateFreeAccountRequest { sender: `0x${string}`; domain: string; publicKey: `0x${string}`; salt: `0x${string}`; signature: `0x${string}` }


// --- HTTP util ---
const BUNDLER = `http://localhost:8080` as string;
const PAYMASTER = `http://localhost:8081` as string;

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// --- API clients (adjust paths to your servers) ---
const BundlerAPI = {
  async submit(userOp: PackedUserOperation, domain: string): Promise<SubmitResponse> {
    return j<SubmitResponse>(`${BUNDLER}/submit`, { method: "POST", body: JSON.stringify({ userOp, domain }) });
  },
  async updatePublicKey(sender: Address, domain: string, oldKey: string, newKey: string, signature: string): Promise<GenericResponse> {
    return j<GenericResponse>(`${BUNDLER}/updatePublicKey`, { method: "POST", body: JSON.stringify({ sender, domain, oldKey, newKey, signature }) });
  },
  async getAllDomains(): Promise<GetAllDomainsResponse> {
    return j<GetAllDomainsResponse>(`${BUNDLER}/domain`);
  },
  async getDomainDetails(domain: string): Promise<DomainDetailsResponse> {
    return j<DomainDetailsResponse>(`${BUNDLER}/domain/${domain}`);
  },
  async getTxReceipt(sender: Address, userOpHash: `0x${string}`): Promise<TxReceipt> {
    return j<TxReceipt>(`${BUNDLER}/transaction`, { method: "POST", body: JSON.stringify({ sender, userOpHash }) });
  },
  async addPaymaster(paymaster: Address, domain: string, sender: Address, flag: number, signature: `0x${string}`): Promise<GenericResponse> {
    return j<GenericResponse>(`${BUNDLER}/paymaster/add`, { method: "POST", body: JSON.stringify({ paymaster, domain, sender, flag, signature }) });
  },
  async updatePaymaster(paymaster: Address, domain: string, sender: Address, flag: number, signature: `0x${string}`): Promise<GenericResponse> {
    return j<GenericResponse>(`${BUNDLER}/paymaster/update`, { method: "POST", body: JSON.stringify({ paymaster, domain, sender, flag, signature }) });
  },
};

const PaymasterAPI = {
  async createNewAccount(sender: Address, domain: string, publicKey: string, salt: string, signature: string): Promise<GenericResponse> {
    return j<GenericResponse>(`${PAYMASTER}/paymaster/sponsor`, { method: "POST", body: JSON.stringify({ sender, domain, publicKey, salt, signature }) });
  },
};

// --- Minimal AA helpers (placeholder packing/signing) ---
function hexlify(n: number | bigint) { return `0x${BigInt(n).toString(16)}` as const }
function emptyHex(): `0x${string}` { return "0x" as const }

// Compose gas fees: (priority << 128) | maxFee   
// fees are managed as MWei since fees are usually less than one GWei
function packGasFees(priorityMwei = 2n, maxFeeMwei = 30n): `0x${string}` {
  const MWEI = 1_000_000n;
  const pr = priorityMwei * MWEI;
  const mx = maxFeeMwei * MWEI;
  const packed = (pr << 128n) | mx;
  return `0x${packed.toString(16)}`;
}

function defaultAccountGasLimits(accountGasLimit = 300_000n, callGasLimit = 1_000_000n): `0x${string}` {
  // accountGasLimits: (verificationGasLimit << 128) | callGasLimit
  const v = accountGasLimit; 
  const c = callGasLimit; 
  const packed = (v << 128n) | c;
  return `0x${packed.toString(16)}`;
}

// --- Zustand: transaction sheet + flow orchestrator ---
interface TxStore {
  open: boolean;
  status: TxStatus;
  startFlow: (input: { sender: Address; to: Address; amountEth: string; data?: `0x${string}`; paymaster: Address; domain: string }) => Promise<void>;
  close: () => void;
}

export const useTx = create<TxStore>((set, get) => ({
  open: false,
  status: { phase: "idle" },
  close: () => set({ open: false, status: { phase: "idle" } }),
  startFlow: async ({ sender, to, amountEth, data = "0x", paymaster, domain }) => {
    set({ open: true, status: { phase: "preparing", message: "Building UserOp" } });

    // 1) Build callData (ERC-4337 execute pattern / account-specific). Placeholder: simple transfer via account's execute.
    // Replace SELECTOR/ABI with your account's method (e.g., execute(address,uint256,bytes)).
    const EXECUTE_SELECTOR = "0xb61d27f6" as const; // execute(address dest, uint256 value, bytes data)
    const valueWei = BigInt(Math.floor(Number(amountEth || "0") * 1e18)); // will need to replace 1e18 with token decimals if token transfer
    const encoded = abiEncodeExecute(to, valueWei, data);

    const userOpBase: Omit<PackedUserOperation,  "signature"> = {
      sender,
      nonce: hexlify(0), // need to replace with a get nonce function from entry point
      initCode: emptyHex(),
      callData: (EXECUTE_SELECTOR + encoded.slice(2)) as `0x${string}`,
      accountGasLimits: defaultAccountGasLimits(), // will come from bundler api?  or can be internally stored
      preVerificationGas: hexlify(50_000), // will come from bundler api?
      gasFees: packGasFees(), // will come from rpc url
      paymasterAndData: paymaster as `0x${string}`,
    } as any;

    // 3) Sign userOp (placeholder; integrate Falcon-1024 or EOA for demo)
    const userOpHash: `0x${string}` = "0xdeadbeef"; // TODO: replace with real userOpHash calculation
    const signature: `0x${string}` = "0x01"; // TODO: replace with real signature

    const userOp: PackedUserOperation = { ...userOpBase, signature } as PackedUserOperation;

    // 4) Send
    set({ status: { phase: "preparing", message: "Submitting to bundler" } });


    // 5) Send
    try {
      const sim = await BundlerAPI.submit(userOp, domain) as any;
      set({ status: { phase: "submitted", userOpHash: userOpHash, message: "Submitted to bundler" } });

      // 6) Poll for inclusion/finalization
      let tries = 0;
      const maxTries = 30;
      while (tries++ < maxTries) {
        await new Promise(r => setTimeout(r, 1500));
        const rec = await BundlerAPI.getTxReceipt(sender, userOpHash);
        if (rec.success) {
          set({ status: { phase: "included", userOpHash, hash: rec.txHash, message: "Included in block" } });
        }
      }
    } catch (e: any) {
      set({ status: { phase: "failed", message: e.message } });
    }
  },
}));

// --- Very small ABI encoder for execute(address,uint256,bytes) ---
function abiEncodeExecute(to: Address, valueWei: bigint, data: `0x${string}`): `0x${string}` {
  // Minimal encoder: address (32), uint256 (32), bytes offset (32), bytes length (32), bytes data (padded)
  const pad32 = (hex: string) => hex.padStart(64, "0");
  const addr = to.toLowerCase().replace("0x", "");
  const value = valueWei.toString(16);
  const offset = pad32("60"); // static head = 3 words (address, value, offset) → offset = 0x60
  const head = `${pad32(addr)}${pad32(value)}${offset}`;
  const bytesLen = ((data.length - 2) / 2).toString(16);
  // pad data to 32-byte boundary
  const mod = ((data.length - 2) / 2) % 32;
  const pad = mod === 0 ? 0 : 32 - mod;
  const body = `${pad32(bytesLen)}${data.slice(2)}${"0".repeat(pad * 2)}`;
  return `0x${head}${body}` as const;
}

// --- UI Shell & Navigation ---
function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-30 border-b bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/dashboard" className="font-semibold">QuantumAccount</Link>
          <div className="flex items-center gap-2">
            <NetworkPill />
            <WalletSwitcher />
            <Link to="/settings" className="text-sm underline">Settings</Link>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 pb-16 lg:pb-0 lg:grid-cols-[220px_1fr]">
        <nav className="hidden lg:block">
          <ul className="space-y-1">
            <li><Nav to="/dashboard" label="Home" /></li>
            <li><Nav to="/transfer" label="Transfer" /></li>
            <li><Nav to="/contacts" label="Contacts" /></li>
            <li><Nav to="/favourites" label="Favourites" /></li>
            <li><Nav to="/wallets" label="Wallets" /></li>
            <li><Nav to="/legal/terms" label="Terms" /></li>
            <li><Nav to="/legal/privacy" label="Privacy" /></li>
          </ul>
        </nav>
        <section className="min-h-[60vh]">{children}</section>
      </main>
      <BottomNav />
      <TxSheet />
    </div>
  );
}

function Nav({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `block rounded-xl px-3 py-2 text-sm ${isActive ? "bg-neutral-900 text-white" : "hover:bg-neutral-100"}`}
    >
      {label}
    </NavLink>
  );
}

function BottomNav() {
  const { open } = useTx();
  if (open) return null; // hide while sheet is open
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 h-14 border-t bg-white p-2 lg:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-2 text-center text-xs">
        <NavLink to="/dashboard">Home</NavLink>
        <NavLink to="/transfer">Transfer</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/favourites">Favs</NavLink>
        <NavLink to="/wallets">Wallets</NavLink>
      </div>
    </div>
  );
}

function NetworkPill() {  // either delete to switch to show network name
  return (
    <Badge variant="secondary" className="rounded-full">Sepolia</Badge>
  );
}

function WalletSwitcher() { // may delete this
  return (
    <Button size="sm" variant="outline">QA#1</Button>
  );
}

// --- Global Transaction Sheet connected to Zustand ---
function TxSheet() {
  const { open, status, close } = useTx();
  return (
<Sheet open={open} onOpenChange={(v) => !v && close()}>
  <SheetContent className="z-[60] sm:max-w-md">
    <div className="max-h-[60vh] overflow-y-auto pb-20">
        <SheetHeader>
          <SheetTitle>Transaction Status</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <StatusRow phase="preparing" active={status.phase === "preparing"} message={status.message} />
          <StatusRow phase="sponsored" active={status.phase === "sponsored"} message={status.message} />
          <StatusRow phase="simulated" active={status.phase === "simulated"} message={status.message} />
          <StatusRow phase="submitted" active={status.phase === "submitted"} hash={status.userOpHash} />
          <StatusRow phase="included" active={status.phase === "included"} hash={status.hash} />
          <StatusRow phase="finalized" active={status.phase === "finalized"} hash={status.hash} />
          {status.phase === "failed" && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">Failed: {status.message}</div>}
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={close}>Close</Button>
            {status.hash && <Button onClick={() => navigator.clipboard.writeText(status.hash!)}>Copy tx hash</Button>}
            {(status.hash || status.userOpHash) && (
              <Button
  variant="outline"
  onClick={() => {
    if (status.hash) {
      window.open(`https://sepolia.etherscan.io/tx/${status.hash}`, "_blank", "noopener,noreferrer");
    }
  }}
>
  View on Etherscan
</Button>
            )}
          </div>
        </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StatusRow({ phase, active, hash, message }: { phase: TxStatus["phase"]; active?: boolean; hash?: string; message?: string }) {
  const label = {
    idle: "Idle",
    preparing: "Preparing",
    sponsored: "Sponsored",
    simulated: "Simulated",
    submitted: "Submitted",
    included: "Included in block",
    finalized: "Finalized",
    failed: "Failed",
  }[phase];
  return (
    <div className="flex items-center justify-between rounded-xl border p-3">
      <div className="flex items-center gap-2">
        {active ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
        <span>{label}</span>
        {message && <span className="text-xs text-neutral-500">— {message}</span>}
      </div>
      <div className="truncate text-xs text-neutral-500">{hash ?? ""}</div>
    </div>
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

export function Dashboard() { // may need to add an import token function here
  const { startFlow } = useTx();
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-sm text-neutral-500">ETH Balance</div><div className="mt-1 text-2xl font-semibold">1.204 Ξ</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-neutral-500">Top Token</div><div className="mt-1 text-2xl font-semibold">150 COIN</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-neutral-500">Security</div><div className="mt-1">Admin key active • Recovery off</div></CardContent></Card>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => startFlow({ sender: "0x0000000000000000000000000000000000000001" as Address, to: "0x0000000000000000000000000000000000000002" as Address, amountEth: "0.001", paymaster: "0x0000000000000000000000000000000000000000" as Address, domain: `LOCAL` })}>Send (demo)</Button>
        <Button variant="outline" onClick={() => navigate("/transfer")}>Transfer</Button>
        <Button variant="outline" onClick={() => navigate("/wallets")}>Add Wallet</Button>
      </div>
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Recent Activity</CardTitle></CardHeader>
        <CardContent className="divide-y">
          <ActivityRow status="success" hash="0xabc…" />
          <ActivityRow status="pending" hash="0xdef…" />
        </CardContent>
      </Card>
    </div>
  );
}

function ActivityRow({ status, hash }: { status: "success" | "pending" | "failed"; hash: string }) {
  const icon = status === "success" ? <Check className="h-4 w-4" /> : status === "pending" ? <Clock className="h-4 w-4" /> : <StarOff className="h-4 w-4" />
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <div className="flex items-center gap-2">{icon}<span className="font-mono">{hash}</span></div>
      <Button size="sm" variant="ghost">View</Button>
    </div>
  );
}

export function Transfer() { // might rename as send
  const [to, setTo] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [memo, setMemo] = React.useState("");
  const navigate = useNavigate();
  const { startFlow } = useTx();

  async function onReview() {
    if (!to || !amount) { toast("Enter recipient and amount"); return }
    // ENS resolution can be integrated here if needed, also need to fetch sender address from wallet
    await startFlow({ sender: "0x0000000000000000000000000000000000000001" as Address, to: to as Address, amountEth: amount, paymaster: "0x0000000000000000000000000000000000000000" as Address, domain: `LOCAL` });
    navigate("/dashboard");
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card className="rounded-2xl">
        <CardHeader><CardTitle>Transfer</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>From</Label>
            <Input disabled value="QuantumAccount #1" /> // replace with connected wallet
          </div>
          <div>
            <Label>To (address or ENS)</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="0x… or alice.eth" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Amount</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Asset</Label>
              <Input value="ETH" readOnly /> // could be a dropdown for tokens
            </div>
          </div>
          <div>
            <Label>Memo (optional)</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Payment reference" /> // might delete or repurpose for ECP
          </div>
          <div className="flex items-center justify-between text-sm text-neutral-600">
            <div>Fee: ~0.001 Ξ</div> // need to replace with rpc url query and needs to be an input field
            <div>Paymaster: <Badge>Auto</Badge></div> // dropdown of registered paymasters
          </div>
          <div className="flex gap-2 pt-2">
            <Button onClick={onReview}>Review & Send</Button>
            <Button variant="outline">Advanced</Button>  // no idea what this will do lol but probably where nonce is set to admin or large gas value
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Contacts() { // either add a type (wallet/contract) or remove favourite functionality (since favourites is for contracts with ABIs)
  const [q, setQ] = React.useState("");
  const [items] = React.useState<Contact[]>([ // need to store in localstorage or indexeddb
    { id: "1", name: "Alice.eth", address: "0x1111111111111111111111111111111111111111" as Address, favourite: true },
    { id: "2", name: "Bob", address: "0x2222222222222222222222222222222222222222" as Address },
  ]);
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, address, or ENS" />
        <Button onClick={() => navigate("/contacts/add")}>Add</Button> // this isn't a search, wtf but check if above input is automatic
      </div>
      <Card>
        <CardContent className="divide-y">
          {items.filter(i => i.name.toLowerCase().includes(q.toLowerCase())).map(i => (
            <ContactRow key={i.id} c={i} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ContactRow({ c }: { c: Contact }) {
  const [fav, setFav] = React.useState(!!c.favourite);
  const { startFlow } = useTx();
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <div>f
        <div className="font-medium">{c.name}</div>
        <div className="font-mono text-xs text-neutral-500 truncate max-w-[60vw] lg:max-w-[40ch]">{c.address}</div>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => navigate(`/contacts/view/${c.id}`)}>View</Button>
        <Button size="icon" variant="ghost" onClick={() => setFav(v => !v)}>{fav ? <Star className="h-4 w-4" /> : <StarOff className="h-4 w-4" />}</Button>
        <Button size="sm" onClick={() => startFlow({ sender: "0x0000000000000000000000000000000000000001" as Address, to: c.address, amountEth: "0.001", paymaster: "0x0000000000000000000000000000000000000000" as Address, domain: `LOCAL` })}>Send</Button> // change this to go to transfer screen with prefilled address
      </div>
    </div>
  );
}

export function AddContact() {
  const [name, setName] = React.useState("");
  const [addr, setAddr] = React.useState("");
  const [note, setNote] = React.useState("");
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader><CardTitle>Add Contact</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label>Name / ENS</Label> // nope, ENS not here
            <div className="flex gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="alice.eth or alias" />
              <Button variant="outline">Resolve</Button>
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x…" /> // ENS resolution can be added here
          </div>
          <div>
            <Label>Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tag or memo" /> // may add ABI here
          </div>
          <div className="flex gap-2 pt-2">
            <Button>Save</Button>
            <Button variant="outline" onClick={() => navigate("/contacts")}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Favourites() {  // this is just useless with this hardcoding
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Favourites</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <div className="font-medium">Alice.eth</div>
              <div className="font-mono text-xs text-neutral-500">0x1111…</div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate("/contacts/view/1")}>View</Button>
              <Button size="sm">Send</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Wallets() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Wallets</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Tabs defaultValue="add">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="add">Create</TabsTrigger>
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="watch">Watch-only</TabsTrigger>
            </TabsList>
            <TabsContent value="add" className="space-y-3"> // need to replace with real create wallet flow and remove initcode blurb
              <Button>Create QuantumAccount</Button>
              <div className="text-xs text-neutral-500">Deploy via EntryPoint initCode. Paymaster policy optional.</div>
            </TabsContent>
            <TabsContent value="import" className="space-y-3">
              <Label>Account Address</Label>
              <Input placeholder="0x…" />
              <Button>Verify & Link</Button>
            </TabsContent>
            <TabsContent value="watch" className="space-y-3">
              <Label>Address</Label>
              <Input placeholder="0x…" />
              <Button>Add Watch-only</Button>
            </TabsContent>
          </Tabs>
          <div className="pt-2 text-sm">Current: <Badge>QA#1</Badge>, Watch: 0xabc…</div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Terms() {
  return (
    <Card>
      <CardHeader><CardTitle>Terms & Conditions</CardTitle></CardHeader>
      <CardContent className="prose max-w-none">
        <p>[Version 1.0 • Last updated: 2025‑10‑31]</p>
        <p>Short placeholder. Insert legal text here.</p>
        <Button className="mt-2">Accept</Button>
        <Button className="mt-2" variant="outline">Download PDF</Button>
      </CardContent>
    </Card>
  );
}

export function Privacy() {
  return (
    <Card>
      <CardHeader><CardTitle>Privacy Policy</CardTitle></CardHeader>
      <CardContent className="prose max-w-none">
        <p>[Version 1.0 • Last updated: 2025‑10‑31]</p>
        <p>Short placeholder. Insert privacy policy here.</p>
        <Button className="mt-2">Accept</Button>
        <Button className="mt-2" variant="outline">Download PDF</Button>
      </CardContent>
    </Card>
  );
}

// --- Root App + Routes ---
export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transfer" element={<Transfer />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/add" element={<AddContact />} />
          <Route path="/favourites" element={<Favourites />} />
          <Route path="/wallets" element={<Wallets />} />
          <Route path="/legal/terms" element={<Terms />} />
          <Route path="/legal/privacy" element={<Privacy />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
