import { create } from "zustand";
import { 
  Address, 
  keccak256, 
  bytesToHex, 
  hexToBytes, 
  concatHex, 
  padHex, 
  toHex, 
  http, 
  createPublicClient, 
  Hex, 
  hashTypedData 
} from "viem";
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
const BUNDLER = `https://app.cointrol.co/bundler/userop` as string;
const PAYMASTER = `https://app.cointrol.co/paymentgateway/pmg` as string;

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

// Compose gas fees: EIP-4337 gasFees bytes32: HIGH 128 = maxPriorityFeePerGas, LOW 128 = maxFeePerGas
function packGasFees(maxPriorityFeePerGas: bigint, maxFeePerGas: bigint): `0x${string}` {
  const packed = (maxPriorityFeePerGas << 128n) | maxFeePerGas;
  return `0x${packed.toString(16).padStart(64, "0")}`;
}

function hexToBigInt(hex: `0x${string}`): bigint {
  if (!/^0x[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid hex bigint: ${hex}`);
  }
  return BigInt(hex);
}

const DOMAIN_NAME = "ERC4337";
const DOMAIN_VERSION = "1";

export const calculateUserOpHash = (
  userop: Omit<PackedUserOperation, "signature">,
  entryPoint: Address,
  chainId: number,
) => {
  // Equivalent: hashTypedData with primaryType that matches PACKED_USEROP_TYPEHASH
  return hashTypedData({
    domain: {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chainId,
      verifyingContract: entryPoint,
    },
    types: {
      PackedUserOperation: [
        { name: "sender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "initCode", type: "bytes" },
        { name: "callData", type: "bytes" },
        { name: "accountGasLimits", type: "bytes32" },
        { name: "preVerificationGas", type: "uint256" },
        { name: "gasFees", type: "bytes32" },
        { name: "paymasterAndData", type: "bytes" },
      ],
    },
    primaryType: "PackedUserOperation",
    // IMPORTANT: message must be the *raw* fields (EIP-712 will hash bytes fields internally),
    // but since we already computed structHash above, we can also just return toTypedDataHash(domainSep, structHash).
    // Using hashTypedData here is simplest/least error-prone:
    message: {
      sender: userop.sender,
      nonce: typeof userop.nonce === "bigint" ? userop.nonce : hexToBigInt(userop.nonce as Hex),
      initCode: userop.initCode,
      callData: userop.callData,
      accountGasLimits: userop.accountGasLimits,
      preVerificationGas:
        typeof userop.preVerificationGas === "bigint"
          ? userop.preVerificationGas
          : hexToBigInt(userop.preVerificationGas as Hex),
      gasFees: userop.gasFees,
      paymasterAndData: userop.paymasterAndData,
    },
  });
};

function defaultAccountGasLimits(accountGasLimit = 8_500_000n, callGasLimit = 200_000n): `0x${string}` {
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
          transport: http(domain.rpcUrl), 
        });
    const [nonce, feeData] = await Promise.all([
      publicClient.readContract({
        address: domain.entryPoint as `0x${string}`,
        abi: entryPointAbi,
        functionName: "getNonce",
        args: [folio.address as `0x${string}`, 0n], // key = 0 for normal ops TODO: update for admin/large keys
      }) as Promise<bigint>,
      publicClient.estimateFeesPerGas().catch(() => null),
    ]);
    // Apply 20% buffer to live network fees to avoid being priced out of the next block
    const maxFeePerGas = (feeData?.maxFeePerGas ?? 4_000_000_000n) * 12n / 10n;
    const maxPriorityFeePerGas = (feeData?.maxPriorityFeePerGas ?? 2_000_000n) * 12n / 10n;
    const paymaster =
      (folio.paymaster?.startsWith("0x") ? folio.paymaster : undefined) as `0x${string}` | undefined;
    const userOpBase: Omit<PackedUserOperation, "signature"> = {
      sender: folio.address,
      nonce: toHex(nonce), 
      initCode: emptyHex(),
      callData: encoded,  
      accountGasLimits: defaultAccountGasLimits(), // only changes if ecdsa supported
      preVerificationGas: hexlify(200_000), // will come from bundler api?
      gasFees: packGasFees(maxPriorityFeePerGas, maxFeePerGas),
      paymasterAndData: paymaster
        ? packPaymasterAndDataV08({
          paymaster,
          // choose sane limits (tune later). must fit uint128
          validationGasLimit: 100_000n,
          postOpGasLimit: 0n,
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
    falcon.terminate(); // terminate worker to clear its copy of the SK

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