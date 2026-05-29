import { create } from "zustand";
import {
  Address,
  keccak256,
  stringToHex,
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
import { getSecretKey, listKeypairs } from "@/storage/keyStore";
import { Folio } from "@/storage/folioStore";
import { Domain } from "@/storage/domainStore";
import { entryPointAbi } from "./abiTypes";
import { getGasProfile } from "./gasConfig";

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
export interface CreateFreeAccountResponse { success: boolean; result: string; paymaster: string }
export interface TxHashRequest { sender: `0x${string}`; userOpHash: `0x${string}` }
export interface TxReceipt { success: boolean; txHash: `0x${string}` }
export interface BundlerFalconDomain { factory: string; falcon: string; falconLevel: string; initCodeHash: string }
export interface BundlerPaymaster { address: string; name: string; chainId: number; type: number; bundler: string; createdAt: number; updatedAt: number }
export interface BundlerDomain {
  name: string; chainId: number; entryPoint: string; isTest: number;
  falconDomain: BundlerFalconDomain[]; paymaster: BundlerPaymaster[];
  bundler: string; rpcUrl: string; transactionUrl: string;
  createdAt: number; updatedAt: number;
}
export interface GetAllDomainsResponse { success: boolean; data: BundlerDomain[] }
export interface DomainDetailsResponse { success: boolean; data: BundlerDomain }
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
  async syncPublicKey(sender: Address, domain: string): Promise<GenericResponse> {
    return j<GenericResponse>(`${BUNDLER}/syncPublicKey`, { method: "POST", body: JSON.stringify({ sender, domain }) });
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
  async createNewAccount(sender: Address, domain: string, publicKey: string, salt: string, signature: string): Promise<CreateFreeAccountResponse> {
    return j<CreateFreeAccountResponse>(`${PAYMASTER}/createfree`, { method: "POST", body: JSON.stringify({ sender, domain, publicKey, salt, signature }) });
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

// ADMIN_KEY from QuantumAccount.sol: used in nonce top-192-bits for admin ops (e.g. key rotation)
export const ADMIN_KEY = 0x0ad9140ad914n;

export function defaultAccountGasLimits(accountGasLimit: bigint, callGasLimit: bigint): `0x${string}` {
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
  startFlow: (input: { folio: Folio; encoded: string; domain: Domain; nonceKey?: bigint; }) => Promise<void>;
  close: () => void;
}

export const useTx = create<TxStore>((set, get) => ({
  open: false,
  status: { phase: "idle" },
  close: () => set({ open: false, status: { phase: "idle" } }),
  startFlow: async ({ folio, encoded, domain, nonceKey }) => {
    set({ open: true, status: { phase: "preparing", message: "Building UserOp" } });
    const publicClient = createPublicClient({
          transport: http(domain.rpcUrl), 
        });
    const [nonce, feeData, estimatedCallGas, keypairs] = await Promise.all([
      publicClient.readContract({
        address: domain.entryPoint as `0x${string}`,
        abi: entryPointAbi,
        functionName: "getNonce",
        args: [folio.address as `0x${string}`, nonceKey ?? 0n],
      }) as Promise<bigint>,
      publicClient.estimateFeesPerGas().catch(() => null),
      // Simulate EntryPoint → account to get real callGasLimit for this specific callData
      publicClient.estimateGas({
        account: domain.entryPoint as `0x${string}`,
        to: folio.address as `0x${string}`,
        data: encoded as `0x${string}`,
      }).catch(() => null),
      listKeypairs(),
    ]);

    const meta = keypairs.find(k => k.id === folio.keypairId);
    if (!meta || meta.level === "ECC") throw new Error("No valid Falcon keypair assigned to this account");
    const gasProfile = getGasProfile(meta.level);

    // Apply 20% buffer to live network fees to avoid being priced out of the next block
    const maxFeePerGas = (feeData?.maxFeePerGas ?? 4_000_000_000n) * 12n / 10n;
    const maxPriorityFeePerGas = (feeData?.maxPriorityFeePerGas ?? 2_000_000n) * 12n / 10n;
    // Apply 50% buffer to call gas estimate; fall back to level-appropriate default if estimation fails
    const callGasLimit = estimatedCallGas ? (estimatedCallGas * 15n / 10n) : gasProfile.defaultCallGasFallback;
    const paymaster =
      (folio.paymaster?.startsWith("0x") ? folio.paymaster : undefined) as `0x${string}` | undefined;
    const userOpBase: Omit<PackedUserOperation, "signature"> = {
      sender: folio.address,
      nonce: toHex(nonce),
      initCode: emptyHex(),
      callData: encoded,
      accountGasLimits: defaultAccountGasLimits(gasProfile.verificationGasLimit, callGasLimit),
      preVerificationGas: hexlify(200_000), // will come from bundler api?
      gasFees: packGasFees(maxPriorityFeePerGas, maxFeePerGas),
      paymasterAndData: paymaster
        ? packPaymasterAndDataV08({
          paymaster,
          validationGasLimit: 100_000n,
          postOpGasLimit: 100_000n, // paymaster _postOp does storage write on revert
          extraData: "0x", // no signature
        })
        : "0x",
    } as any;

    const userOpHash: `0x${string}` = calculateUserOpHash(userOpBase, domain.entryPoint as `0x${string}`, folio.chainId);

    if (userOpHash.length !== 66) throw new Error(`Invalid userOpHash length`);

    const UKVR_SELECTOR = keccak256(stringToHex("updatePublicKeyViaRecoverable(address,bytes)")).slice(0, 10);
    const isUKVR = (encoded as string).toLowerCase().startsWith(UKVR_SELECTOR);

    let userOp: PackedUserOperation;
    if (isUKVR) {
      // Contract bypasses signature check for recovery ops; send empty signature
      userOp = { ...userOpBase, signature: "0x" } as PackedUserOperation;
    } else {
      const falcon = createFalconWorkerClient();
      const sk = await getSecretKey(folio.keypairId);
      if (!sk) throw new Error("Falcon secret key not available");
      const signature = await falcon.sign(meta.level, hexToBytes(userOpHash), sk);
      userOp = { ...userOpBase, signature: bytesToHex(signature) } as PackedUserOperation;
      sk.fill(0);
      falcon.terminate();
    }

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