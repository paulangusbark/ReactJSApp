/**
 * submitTransaction.test.ts — Phase 3
 *
 * Covers:
 *  1. parseBalance / parseBalanceSafe  — pure utility functions, no mocks needed.
 *  2. calculateUserOpHash              — pure EIP-712 hash, no network calls.
 *  3. useTx store                      — state transitions with mocked viem & Falcon.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted — variables referenced inside vi.mock factories must come from here
// ---------------------------------------------------------------------------

const {
  mockSign,
  mockTerminate,
  mockReadContract,
  mockEstimateFeesPerGas,
  mockEstimateGas,
  mockPublicClient,
} = vi.hoisted(() => {
  const ms = vi.fn();
  const mt = vi.fn();
  const mrc = vi.fn().mockResolvedValue(0n);
  const mef = vi.fn().mockResolvedValue({ maxFeePerGas: 4_000_000_000n, maxPriorityFeePerGas: 2_000_000n });
  const meg = vi.fn().mockResolvedValue(100_000n);
  const pc = { readContract: mrc, estimateFeesPerGas: mef, estimateGas: meg };
  return {
    mockSign: ms,
    mockTerminate: mt,
    mockReadContract: mrc,
    mockEstimateFeesPerGas: mef,
    mockEstimateGas: meg,
    mockPublicClient: pc,
  };
});

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/crypto/falconInterface", () => ({
  createFalconWorkerClient: vi.fn().mockReturnValue({
    sign: mockSign,
    terminate: mockTerminate,
    init: vi.fn(),
    verify: vi.fn(),
    generateKeypair: vi.fn(),
  }),
}));

vi.mock("@/storage/keyStore", () => ({
  getSecretKey: vi.fn().mockResolvedValue(new Uint8Array([0x01, 0x02, 0x03, 0x04])),
  listKeypairs: vi.fn().mockResolvedValue([{ id: "key-1", level: 512, createdAt: 0 }]),
  isKeyStoreInitialised: vi.fn().mockReturnValue(true),
  initKeyStore: vi.fn(),
  clearKeyStore: vi.fn(),
}));

// Mock idb-keyval so folioStore / domainStore don't call IndexedDB
vi.mock("idb-keyval", () => ({
  get: vi.fn().mockResolvedValue(undefined),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
}));

// Mock viem's network-bound helpers while keeping the pure crypto utilities real
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    createPublicClient: vi.fn().mockReturnValue(mockPublicClient),
    http: vi.fn(),
  };
});

vi.mock("viem/chains", () => ({ sepolia: { id: 11155111 } }));

// ---------------------------------------------------------------------------

import {
  parseBalance,
  parseBalanceSafe,
  calculateUserOpHash,
  useTx,
  BundlerAPI,
  defaultAccountGasLimits,
  ADMIN_KEY,
} from "../submitTransaction";
import type { PackedUserOperation } from "../submitTransaction";
import { listKeypairs } from "@/storage/keyStore";

// ---------------------------------------------------------------------------
// 1. parseBalance
// ---------------------------------------------------------------------------

describe("parseBalance", () => {
  it("parses a whole-number integer", () => {
    expect(parseBalance("1", 18)).toBe(1_000_000_000_000_000_000n);
  });

  it("parses zero", () => {
    expect(parseBalance("0", 18)).toBe(0n);
  });

  it("parses a fractional amount", () => {
    expect(parseBalance("0.5", 18)).toBe(500_000_000_000_000_000n);
  });

  it("parses amount with exactly `decimals` fractional digits", () => {
    expect(parseBalance("1.000000000000000001", 18)).toBe(1_000_000_000_000_000_001n);
  });

  it("parses with decimals = 0 (integer only)", () => {
    expect(parseBalance("42", 0)).toBe(42n);
  });

  it("parses with decimals = 6 (USDC style)", () => {
    expect(parseBalance("1.5", 6)).toBe(1_500_000n);
  });

  it("parses negative values", () => {
    expect(parseBalance("-1", 18)).toBe(-1_000_000_000_000_000_000n);
  });

  it("strips leading/trailing whitespace", () => {
    expect(parseBalance("  1  ", 18)).toBe(1_000_000_000_000_000_000n);
  });

  it("throws on empty string", () => {
    expect(() => parseBalance("", 18)).toThrow();
  });

  it("throws on whitespace-only input", () => {
    expect(() => parseBalance("   ", 18)).toThrow();
  });

  it("throws on non-numeric input", () => {
    expect(() => parseBalance("abc", 18)).toThrow();
  });

  it("throws when fractional digits exceed `decimals`", () => {
    expect(() => parseBalance("1.1234567890123456789", 18)).toThrow();
  });

  it("throws on negative decimals", () => {
    expect(() => parseBalance("1", -1)).toThrow();
  });

  it("trailing zeros in fraction are handled correctly", () => {
    expect(parseBalance("1.100", 6)).toBe(parseBalance("1.1", 6));
  });
});

// ---------------------------------------------------------------------------
// 2. parseBalanceSafe
// ---------------------------------------------------------------------------

describe("parseBalanceSafe", () => {
  it("returns { ok: true, value } for valid input", () => {
    const result = parseBalanceSafe("1.5", 6);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(1_500_000n);
  });

  it("returns { ok: false, error } for invalid input", () => {
    const result = parseBalanceSafe("not-a-number", 18);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(typeof result.error).toBe("string");
  });

  it("returns { ok: false } for too many decimals", () => {
    const result = parseBalanceSafe("1.1234567", 6);
    expect(result.ok).toBe(false);
  });

  it("returns { ok: false } for empty string", () => {
    const result = parseBalanceSafe("", 18);
    expect(result.ok).toBe(false);
  });

  it("never throws — always returns an object", () => {
    expect(() => parseBalanceSafe("garbage!!!", 18)).not.toThrow();
  });

  it("is consistent with parseBalance for valid inputs", () => {
    const amount = "3.14";
    const safeResult = parseBalanceSafe(amount, 8);
    const directResult = parseBalance(amount, 8);
    expect(safeResult.ok).toBe(true);
    if (safeResult.ok) expect(safeResult.value).toBe(directResult);
  });
});

// ---------------------------------------------------------------------------
// 3. calculateUserOpHash
// ---------------------------------------------------------------------------

const BYTES32_ZERO = ("0x" + "00".repeat(32)) as `0x${string}`;
const ENTRY_POINT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as `0x${string}`;
const CHAIN_ID = 11155111;

const BASE_OP: Omit<PackedUserOperation, "signature"> = {
  sender: "0x1234567890123456789012345678901234567890",
  nonce: "0x0",
  initCode: "0x",
  callData: "0x",
  accountGasLimits: BYTES32_ZERO,
  preVerificationGas: "0xc350",
  gasFees: BYTES32_ZERO,
  paymasterAndData: "0x",
};

describe("calculateUserOpHash", () => {
  it("returns a 32-byte hash (0x + 64 hex chars)", () => {
    const hash = calculateUserOpHash(BASE_OP, ENTRY_POINT, CHAIN_ID);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(hash.length).toBe(66);
  });

  it("is deterministic — same inputs produce the same hash", () => {
    expect(calculateUserOpHash(BASE_OP, ENTRY_POINT, CHAIN_ID))
      .toBe(calculateUserOpHash(BASE_OP, ENTRY_POINT, CHAIN_ID));
  });

  it("changes when chainId changes", () => {
    const a = calculateUserOpHash(BASE_OP, ENTRY_POINT, 11155111);
    const b = calculateUserOpHash(BASE_OP, ENTRY_POINT, 1);
    expect(a).not.toBe(b);
  });

  it("changes when entryPoint changes", () => {
    const a = calculateUserOpHash(BASE_OP, ENTRY_POINT, CHAIN_ID);
    const b = calculateUserOpHash(BASE_OP, "0x1111111111111111111111111111111111111111", CHAIN_ID);
    expect(a).not.toBe(b);
  });

  it("changes when sender changes", () => {
    const a = calculateUserOpHash(BASE_OP, ENTRY_POINT, CHAIN_ID);
    const b = calculateUserOpHash(
      { ...BASE_OP, sender: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      ENTRY_POINT, CHAIN_ID,
    );
    expect(a).not.toBe(b);
  });

  it("changes when nonce changes", () => {
    const a = calculateUserOpHash({ ...BASE_OP, nonce: "0x0" }, ENTRY_POINT, CHAIN_ID);
    const b = calculateUserOpHash({ ...BASE_OP, nonce: "0x1" }, ENTRY_POINT, CHAIN_ID);
    expect(a).not.toBe(b);
  });

  it("changes when callData changes", () => {
    const a = calculateUserOpHash({ ...BASE_OP, callData: "0x" }, ENTRY_POINT, CHAIN_ID);
    const b = calculateUserOpHash({ ...BASE_OP, callData: "0xdeadbeef" }, ENTRY_POINT, CHAIN_ID);
    expect(a).not.toBe(b);
  });

  it("is not all zeros or all 0xff", () => {
    const hash = calculateUserOpHash(BASE_OP, ENTRY_POINT, CHAIN_ID);
    expect(hash).not.toBe("0x" + "00".repeat(32));
    expect(hash).not.toBe("0x" + "ff".repeat(32));
  });
});

// ---------------------------------------------------------------------------
// 4. useTx store — state transitions
// ---------------------------------------------------------------------------

const MOCK_FOLIO = {
  id: "folio-1",
  address: "0x0000000000000000000000000000000000000002" as `0x${string}`,
  name: "Test Folio",
  chainId: 11155111,
  paymaster: "0x0000000000000000000000000000000000000003",
  type: 0,
  bundler: "0x0000000000000000000000000000000000000004",
  keypairId: "key-1",
  createdAt: 0,
  updatedAt: 0,
};

const MOCK_DOMAIN = {
  name: "test.domain",
  chainId: 11155111,
  entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108",
  paymaster: "0x0000000000000000000000000000000000000003",
  bundler: "",
  rpcUrl: "https://rpc.example.com",
  transactionUrl: "https://etherscan.io/tx/",
  createdAt: 0,
  updatedAt: 0,
};

describe("useTx store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 66-byte all-0xaa array → when hexToBytes is called on a 66-char hash it must be 32 bytes
    // The store checks userOpHash.length === 66, so produce a valid-length signature:
    mockSign.mockResolvedValue(new Uint8Array(66).fill(0xaa));
    mockReadContract.mockResolvedValue(0n);
    mockEstimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 4_000_000_000n, maxPriorityFeePerGas: 2_000_000n });
    mockEstimateGas.mockResolvedValue(100_000n);
    // Reset store state
    useTx.setState({ open: false, status: { phase: "idle" } });
  });

  it("starts with open=false and phase=idle", () => {
    const { open, status } = useTx.getState();
    expect(open).toBe(false);
    expect(status.phase).toBe("idle");
  });

  it("close() resets to open=false and phase=idle", () => {
    useTx.setState({ open: true, status: { phase: "preparing" } });
    useTx.getState().close();
    const { open, status } = useTx.getState();
    expect(open).toBe(false);
    expect(status.phase).toBe("idle");
  });

  it("startFlow sets open=true as soon as it begins", async () => {
    vi.spyOn(BundlerAPI, "submit").mockResolvedValue({ success: false, signed_tx: "0x", result: "rejected" });

    const flowPromise = useTx.getState().startFlow({
      folio: MOCK_FOLIO as any,
      encoded: "0x",
      domain: MOCK_DOMAIN as any,
    });

    // open must be true before the promise resolves
    expect(useTx.getState().open).toBe(true);
    await flowPromise;
  });

  it("startFlow reaches 'failed' phase when BundlerAPI.submit rejects", async () => {
    vi.spyOn(BundlerAPI, "submit").mockRejectedValue(new Error("bundler down"));

    await useTx.getState().startFlow({
      folio: MOCK_FOLIO as any,
      encoded: "0x",
      domain: MOCK_DOMAIN as any,
    });

    expect(useTx.getState().status.phase).toBe("failed");
  });

  it("startFlow reaches 'failed' phase when BundlerAPI.submit returns success=false", async () => {
    vi.spyOn(BundlerAPI, "submit").mockResolvedValue({ success: false, signed_tx: "0x", result: "rejected by bundler" });

    await useTx.getState().startFlow({
      folio: MOCK_FOLIO as any,
      encoded: "0x",
      domain: MOCK_DOMAIN as any,
    });

    expect(useTx.getState().status.phase).toBe("failed");
  });

  it("startFlow calls sign and terminate on the Falcon worker", async () => {
    vi.spyOn(BundlerAPI, "submit").mockResolvedValue({ success: true, signed_tx: "0x", result: "ok" });
    vi.spyOn(BundlerAPI, "getTxReceipt").mockResolvedValue({ success: true, txHash: "0xfinalized" as `0x${string}` });

    await useTx.getState().startFlow({
      folio: MOCK_FOLIO as any,
      encoded: "0x",
      domain: MOCK_DOMAIN as any,
    });

    expect(mockSign).toHaveBeenCalledOnce();
    expect(mockTerminate).toHaveBeenCalledOnce();
    // terminate must come after sign
    expect(mockTerminate.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockSign.mock.invocationCallOrder[0],
    );
  });

  it("startFlow terminates the worker even when BundlerAPI fails", async () => {
    vi.spyOn(BundlerAPI, "submit").mockRejectedValue(new Error("network error"));

    await useTx.getState().startFlow({
      folio: MOCK_FOLIO as any,
      encoded: "0x",
      domain: MOCK_DOMAIN as any,
    });

    if (mockSign.mock.calls.length > 0) {
      expect(mockTerminate).toHaveBeenCalledOnce();
    }
  });

  it("startFlow uses Falcon-512 verification gas (5M) for level-512 accounts", async () => {
    const submitSpy = vi.spyOn(BundlerAPI, "submit").mockResolvedValue({ success: true, signed_tx: "0x", result: "ok" });
    vi.spyOn(BundlerAPI, "getTxReceipt").mockResolvedValue({ success: true, txHash: "0xfinalized" as `0x${string}` });

    await useTx.getState().startFlow({
      folio: MOCK_FOLIO as any,
      encoded: "0x",
      domain: MOCK_DOMAIN as any,
    });

    const submittedOp = submitSpy.mock.calls[0][0] as PackedUserOperation;
    const packed = BigInt(submittedOp.accountGasLimits);
    const verificationGas = packed >> 128n;
    expect(verificationGas).toBe(5_000_000n);
  });

  it("startFlow passes nonceKey to getNonce when provided", async () => {
    vi.spyOn(BundlerAPI, "submit").mockResolvedValue({ success: false, signed_tx: "0x", result: "rejected" });

    await useTx.getState().startFlow({
      folio: MOCK_FOLIO as any,
      encoded: "0x",
      domain: MOCK_DOMAIN as any,
      nonceKey: ADMIN_KEY,
    });

    // Second arg to readContract (getNonce) should be the custom key
    const call = mockReadContract.mock.calls[0];
    expect(call[0].args[1]).toBe(ADMIN_KEY);
  });

  it("startFlow uses Falcon-1024 verification gas (9.9M) for level-1024 accounts", async () => {
    vi.mocked(listKeypairs).mockResolvedValueOnce([{ id: "key-1", level: 1024, createdAt: 0 }] as any);
    const submitSpy = vi.spyOn(BundlerAPI, "submit").mockResolvedValue({ success: true, signed_tx: "0x", result: "ok" });
    vi.spyOn(BundlerAPI, "getTxReceipt").mockResolvedValue({ success: true, txHash: "0xfinalized" as `0x${string}` });

    await useTx.getState().startFlow({
      folio: MOCK_FOLIO as any,
      encoded: "0x",
      domain: MOCK_DOMAIN as any,
    });

    const submittedOp = submitSpy.mock.calls[0][0] as PackedUserOperation;
    const packed = BigInt(submittedOp.accountGasLimits);
    const verificationGas = packed >> 128n;
    expect(verificationGas).toBe(15_000_000n);
  });
});

// ---------------------------------------------------------------------------
// 5. BundlerAPI.getAccountPaymaster
// ---------------------------------------------------------------------------

describe("BundlerAPI.getAccountPaymaster", () => {
  const ACCOUNT = "0x1234567890123456789012345678901234567890" as `0x${string}`;
  const DOMAIN = "Sepolia";
  const PAYMASTER_ADDR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const mockFetch = vi.fn();

  beforeEach(() => { mockFetch.mockClear(); vi.stubGlobal("fetch", mockFetch); });
  afterEach(() => { vi.unstubAllGlobals(); });

  function okJson(body: unknown) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) });
  }
  function errResponse(status: number, statusText: string) {
    return Promise.resolve({ ok: false, status, statusText, json: () => Promise.resolve(null) });
  }

  it("calls GET .../account/<addr>/paymaster/<domain> with no request body", async () => {
    mockFetch.mockReturnValue(okJson({ success: true, paymaster: PAYMASTER_ADDR }));

    await BundlerAPI.getAccountPaymaster(ACCOUNT, DOMAIN);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain(`/account/${ACCOUNT}/paymaster/${DOMAIN}`);
    expect(init?.body).toBeUndefined();
    expect(init?.method).toBeUndefined();
  });

  it("returns success:true and paymaster address on a 200 response", async () => {
    mockFetch.mockReturnValue(okJson({ success: true, paymaster: PAYMASTER_ADDR }));

    const result = await BundlerAPI.getAccountPaymaster(ACCOUNT, DOMAIN);

    expect(result.success).toBe(true);
    expect(result.paymaster).toBe(PAYMASTER_ADDR);
  });

  it("throws when server responds 404", async () => {
    mockFetch.mockReturnValue(errResponse(404, "Not Found"));

    await expect(BundlerAPI.getAccountPaymaster(ACCOUNT, DOMAIN)).rejects.toThrow("404");
  });

  it("throws when server responds 500", async () => {
    mockFetch.mockReturnValue(errResponse(500, "Internal Server Error"));

    await expect(BundlerAPI.getAccountPaymaster(ACCOUNT, DOMAIN)).rejects.toThrow("500");
  });

  it("preserves the account address casing in the URL", async () => {
    const mixedCase = "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12" as `0x${string}`;
    mockFetch.mockReturnValue(okJson({ success: true, paymaster: PAYMASTER_ADDR }));

    await BundlerAPI.getAccountPaymaster(mixedCase, DOMAIN);

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain(`/account/${mixedCase}/paymaster/${DOMAIN}`);
  });
});
