import { create } from "zustand";
import { Address, encodeAbiParameters, parseAbiParameters, keccak256, bytesToHex, hexToBytes, concatHex, padHex, toHex, http, createPublicClient } from "viem";
import { createFalconWorkerClient } from "@/crypto/falconInterface";
import { getFalconSecretKey, FalconLevel } from "@/storage/keyStore";
import { Folio } from "@/storage/folioStore";
import { Domain } from "@/storage/domainStore";
import { entryPointAbi } from "./abiTypes";

export interface TxStatus { phase: "idle" | "preparing" | "simulated" | "submitted" | "finalized" | "failed"; hash?: string; userOpHash?: string; message?: string }

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

export interface SubmitRequest { userOp: PackedUserOperation; domain: string }
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

export function parseBalanceSafe(
  input: string,
  decimals: number
): {
  ok: true;
  value: bigint;
} | {
  ok: false;
  error: string;
} {
  try {
    return { ok: true, value: parseBalance(input, decimals) };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message ?? "Invalid amount",
    };
  }
}


export function parseBalance(
  input: string,
  decimals: number
): bigint {
  if (decimals < 0) {
    throw new Error("Invalid decimals");
  }

  const trimmed = input.trim();

  if (trimmed === "") {
    throw new Error("Empty input");
  }

  // Strict decimal format:
  //  - optional leading -
  //  - digits
  //  - optional fractional part
  const match = trimmed.match(/^(-)?(\d+)(?:\.(\d+))?$/);

  if (!match) {
    throw new Error("Invalid number format");
  }

  const [, neg, integerPart, fractionPart = ""] = match;

  if (fractionPart.length > decimals) {
    throw new Error(`Too many decimal places (max ${decimals})`);
  }

  const base = 10n;
  const factor = base ** BigInt(decimals);

  const integer = BigInt(integerPart) * factor;

  const fraction =
    fractionPart.length === 0
      ? 0n
      : BigInt(fractionPart.padEnd(decimals, "0"));

  const value = integer + fraction;

  return neg ? -value : value;
}


// --- HTTP util ---
const BUNDLER = `http://localhost:8080/userop` as string;
const PAYMASTER = `http://localhost:8081/pmg` as string;

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) {
    const body = await r.json().catch(() => null);
    console.error(`[API] ${r.status} ${r.statusText}`, body);
    throw new Error(`${r.status} ${r.statusText}`);
  }
  return r.json();
}

// --- API clients (adjust paths to your servers) ---
export const BundlerAPI = {
  async submit(userOp: PackedUserOperation, domain: string): Promise<SubmitResponse> {
    return j<SubmitResponse>(`${BUNDLER}/submit`, { method: "POST", body: JSON.stringify({ ...userOp, domain }) });
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
    return j<TxReceipt>(`${BUNDLER}/transaction`, { method: "POST", body: JSON.stringify({ sender, userOphash: userOpHash }) });
  },
  async addPaymaster(paymaster: Address, domain: string, sender: Address, flag: number, signature: `0x${string}`): Promise<GenericResponse> {
    return j<GenericResponse>(`${BUNDLER}/paymaster/add`, { method: "POST", body: JSON.stringify({ paymaster, domain, sender, flag, signature }) });
  },
  async updatePaymaster(paymaster: Address, domain: string, sender: Address, flag: number, signature: `0x${string}`): Promise<GenericResponse> {
    return j<GenericResponse>(`${BUNDLER}/paymaster/update`, { method: "POST", body: JSON.stringify({ paymaster, domain, sender, flag, signature }) });
  },
};

export const PaymasterAPI = {
  async createNewAccount(sender: Address, domain: string, publicKey: string, salt: string, signature: string): Promise<GenericResponse> {
    return j<GenericResponse>(`${PAYMASTER}/createfree`, { method: "POST", body: JSON.stringify({ sender, domain, publicKey, salt, signature }) });
  },
};

// --- Minimal AA helpers (placeholder packing/signing) ---
function hexlify(n: number | bigint) { return `0x${BigInt(n).toString(16)}` as const }
function emptyHex(): `0x${string}` { return "0x" as const }

// Compose gas fees: (priority << 128) | maxFee   
// fees are managed as MWei since fees are usually less than one GWei
function packGasFees(priorityMwei = 2n, maxFeePerGas = 100_000_000n): `0x${string}` {
  const MWEI = 1_000_000n;
  const pr = priorityMwei * MWEI;
  const packed = (pr << 128n) | maxFeePerGas;
  return `0x${packed.toString(16).padStart(64, "0")}`;
}

function hexToBigInt(hex: `0x${string}`): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid hex bigint: ${hex}`);
  }
  return BigInt(hex);
}

// generate userOphash
export const calculateUserOpHash = (
  userop: Omit<PackedUserOperation, "signature">,
  entryPoint: Address,
  chainId: number,
) => {
  const packed = encodeAbiParameters(
    parseAbiParameters(
      "address, uint256, bytes32, bytes32, bytes32, uint256, bytes32, bytes32",
    ),
    [
      userop.sender,
      hexToBigInt(userop.nonce as `0x${string}`),
      keccak256(userop.initCode),
      keccak256(userop.callData),
      userop.accountGasLimits,
      hexToBigInt(userop.preVerificationGas as `0x${string}`),
      userop.gasFees,
      keccak256(userop.paymasterAndData),
    ],
  );

  const enc = encodeAbiParameters(
    parseAbiParameters("bytes32, address, uint256"),
    [keccak256(packed), entryPoint, BigInt(chainId)],
  );

  return keccak256(enc);
};

function defaultAccountGasLimits(accountGasLimit = 7_500_000n, callGasLimit = 400_000n): `0x${string}` {
  // accountGasLimits: (verificationGasLimit << 128) | callGasLimit
  const v = accountGasLimit;
  const c = callGasLimit;
  const packed = (v << 128n) | c;
  return `0x${packed.toString(16).padStart(64, "0")}`;
}

// paymasterAndData: (paymaster ? paymaster : "0x") as `0x${string}`
function packPaymasterAndDataV08(params: {
  paymaster: `0x${string}`;
  validationGasLimit: bigint; // uint128
  postOpGasLimit: bigint;     // uint128
  extraData?: `0x${string}`;  // optional (e.g. signature)
}): `0x${string}` {
  const v = padHex(toHex(params.validationGasLimit), { size: 16 });
  const p = padHex(toHex(params.postOpGasLimit), { size: 16 });
  const extra = params.extraData ?? "0x";
  return concatHex([params.paymaster, v, p, extra]) as `0x${string}`;
}

// --- Zustand: transaction sheet + flow orchestrator ---
interface TxStore {
  open: boolean;
  status: TxStatus;
  startFlow: (input: { folio: Folio; encoded: string; domain: Domain; }) => Promise<void>;
  close: () => void;
}

export const useTx = create<TxStore>((set, get) => ({
  open: false,
  status: { phase: "idle" },
  close: () => set({ open: false, status: { phase: "idle" } }),
  startFlow: async ({ folio, encoded, domain }) => {
    set({ open: true, status: { phase: "preparing", message: "Building UserOp" } });
    const publicClient = createPublicClient({
          transport: http(domain.rpcUrl), // if rpcUrl undefined and chain known, viem will still need transport; supply your default
        });
    const nonce = await publicClient.readContract({
      address: domain.entryPoint as `0x${string}`,
      abi: entryPointAbi,
      functionName: "getNonce",
      args: [folio.address as `0x${string}`, 0n], // key = 0 for normal ops
    }) as bigint;
    const paymaster =
      (folio.paymaster?.startsWith("0x") ? folio.paymaster : undefined) as `0x${string}` | undefined;
    const userOpBase: Omit<PackedUserOperation, "signature"> = {
      sender: folio.address,
      nonce: toHex(nonce), 
      initCode: emptyHex(),
      callData: encoded,  // construction and validation done by modal using a separate tool from here
      accountGasLimits: defaultAccountGasLimits(), // will come from bundler api?  or can be internally stored
      preVerificationGas: hexlify(200_000), // will come from bundler api?
      gasFees: packGasFees(), // will come from rpc url
      paymasterAndData: paymaster
        ? packPaymasterAndDataV08({
          paymaster,
          // choose sane limits (tune later). must fit uint128
          validationGasLimit: 100_000n,
          postOpGasLimit: 100_000n,
          extraData: "0x", // no signature
        })
        : "0x",
    } as any;

    // 3) Sign userOp (placeholder; integrate Falcon-1024 or EOA for demo)

    const userOpHash: `0x${string}` = calculateUserOpHash(userOpBase, domain.entryPoint as `0x${string}`, folio.chainId);

    const falcon = createFalconWorkerClient();
    const falconLevel: FalconLevel = 512; // example for now, will replace with user choice later

    const sk = await getFalconSecretKey(falconLevel);
    if (!sk) throw new Error("Falcon secret key not available");
    if (userOpHash.length !== 66) throw new Error(`Invalid userOpHash length`);

    const signature = await falcon.sign(falconLevel, hexToBytes(userOpHash), sk); // example for now, will replace with user choice later

    const userOp: PackedUserOperation = { ...userOpBase, signature: bytesToHex(signature) } as PackedUserOperation;

    sk.fill(0); // zero out secret key from memory as soon as possible

    // 4) Send
    set({ status: { phase: "preparing", message: "Submitting to bundler" } });


    // 5) Send
    try {
      const sim = await BundlerAPI.submit(userOp, domain.name) as any;
      if (!sim.success) {
        set({ status: { phase: "failed", message: sim.result ?? "Bundler rejected the operation" } });
        return;
      }
      set({ status: { phase: "submitted", userOpHash: userOpHash, message: "Submitted to bundler" } });

      // 6) Poll for inclusion/finalization
      let tries = 0;
      const maxTries = 30;
      while (tries++ < maxTries) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const rec = await BundlerAPI.getTxReceipt(folio.address as `0x${string}`, userOpHash);
          if (rec.success) {
            set({ status: { phase: "finalized", userOpHash, hash: rec.txHash, message: "Included in block" } });
            return;
          }
        } catch {
          // receipt not available yet, keep polling
        }
      }
    } catch (e: any) {
      set({ status: { phase: "failed", message: e.message } });
    }
  },
}));