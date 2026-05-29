import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mocks for wallets.ts dependencies
// ---------------------------------------------------------------------------

vi.mock("@/crypto/falconInterface", () => ({
  createFalconWorkerClient: vi.fn().mockReturnValue({
    sign: vi.fn().mockResolvedValue(new Uint8Array([0xde, 0xad])),
    terminate: vi.fn(),
    init: vi.fn(),
    verify: vi.fn(),
    generateKeypair: vi.fn(),
  }),
}));

vi.mock("@/storage/keyStore", () => ({
  isKeyStoreInitialised: vi.fn().mockReturnValue(true),
  getPublicKey: vi.fn().mockResolvedValue(new Uint8Array([0x01, 0x02])),
  getSecretKey: vi.fn().mockResolvedValue(new Uint8Array([0x05, 0x06])),
  listKeypairs: vi.fn().mockResolvedValue([{ id: "key-1", level: 512, createdAt: 0 }]),
  initKeyStore: vi.fn(),
  clearKeyStore: vi.fn(),
}));

vi.mock("@/lib/submitTransaction", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/submitTransaction")>();
  return {
    ...mod,
    PaymasterAPI: {
      createNewAccount: vi.fn().mockResolvedValue({ success: true, result: "ok", paymaster: "0xpaymaster" }),
    },
  };
});

vi.mock("@/lib/bytesEncoder", () => ({
  createAccountToBytes: vi.fn().mockReturnValue(new Uint8Array([0xab, 0xcd])),
}));

vi.mock("@/storage/domainStore", () => ({
  getAllDomains: vi.fn().mockResolvedValue([{
    name: "ETHEREUM SEPOLIA",
    chainId: 11155111,
    entryPoint: "0xentrypoint",
    paymaster: "0xpaymaster",
    bundler: "0xbundler",
    rpcUrl: "http://localhost:8545",
    transactionUrl: "http://localhost/tx/",
    createdAt: 0,
    updatedAt: 0,
  }]),
}));

vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof import("viem")>();
  return {
    ...actual,
    bytesToHex: (b: Uint8Array) => ("0x" + Buffer.from(b).toString("hex")) as `0x${string}`,
    stringToHex: (s: string) => ("0x" + Buffer.from(s).toString("hex")) as `0x${string}`,
  };
});

import { isKeyStoreInitialised, getPublicKey, getSecretKey, listKeypairs } from "@/storage/keyStore";
import { PaymasterAPI } from "@/lib/submitTransaction";
import { createFalconWorkerClient } from "@/crypto/falconInterface";
import { initWallet, createQuantumAccount } from "../wallets";

// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isKeyStoreInitialised).mockReturnValue(true);
});

// ---------------------------------------------------------------------------

describe("initWallet", () => {
  it("resolves without throwing when keyStore is initialised", async () => {
    await expect(initWallet()).resolves.toBeUndefined();
  });

  it("throws when keyStore is not initialised", async () => {
    vi.mocked(isKeyStoreInitialised).mockReturnValue(false);
    await expect(initWallet()).rejects.toThrow(/not initialised/i);
  });
});

// ---------------------------------------------------------------------------
// createQuantumAccount — level-aware signing
// ---------------------------------------------------------------------------

const SENDER = "0x1234567890123456789012345678901234567890" as `0x${string}`;
const DOMAIN_512 = {
  name: "test.domain",
  chainId: 11155111,
  entryPoint: "0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108" as `0x${string}`,
  falconDomain: [{ factory: "0xfactory", falcon: "0xfalcon", falconLevel: 512 as const, initCodeHash: "0xcc" }],
  bundler: "0xbundler",
  rpcUrl: "http://localhost:8545",
  transactionUrl: "http://localhost/tx/",
  paymaster: [],
  createdAt: 0,
  updatedAt: 0,
};
const DOMAIN_1024 = { ...DOMAIN_512, falconDomain: [{ ...DOMAIN_512.falconDomain[0], falconLevel: 1024 as const }] };
const SALT = "0x" + "00".repeat(32) as `0x${string}`;

describe("createQuantumAccount", () => {
  const falconClientMock = vi.mocked(createFalconWorkerClient)();

  it("calls falcon.sign with level 512 for a Falcon-512 keypair", async () => {
    vi.mocked(listKeypairs).mockResolvedValue([{ id: "key-1", level: 512, createdAt: 0 }]);
    vi.mocked(getPublicKey).mockResolvedValue(new Uint8Array([0x01, 0x02]));
    vi.mocked(getSecretKey).mockResolvedValue(new Uint8Array([0x05, 0x06]));

    await createQuantumAccount({ sender: SENDER, domain: DOMAIN_512 as any, salt: SALT, keypairId: "key-1" });

    expect(falconClientMock.sign).toHaveBeenCalledWith(512, expect.any(Uint8Array), expect.any(Uint8Array));
  });

  it("calls falcon.sign with level 1024 for a Falcon-1024 keypair", async () => {
    vi.mocked(listKeypairs).mockResolvedValue([{ id: "key-2", level: 1024, createdAt: 0 }]);
    vi.mocked(getPublicKey).mockResolvedValue(new Uint8Array([0x01, 0x02]));
    vi.mocked(getSecretKey).mockResolvedValue(new Uint8Array([0x05, 0x06]));

    await createQuantumAccount({ sender: SENDER, domain: DOMAIN_1024 as any, salt: SALT, keypairId: "key-2" });

    expect(falconClientMock.sign).toHaveBeenCalledWith(1024, expect.any(Uint8Array), expect.any(Uint8Array));
  });

  it("calls PaymasterAPI.createNewAccount and returns true on success", async () => {
    vi.mocked(listKeypairs).mockResolvedValue([{ id: "key-1", level: 512, createdAt: 0 }]);
    vi.mocked(getPublicKey).mockResolvedValue(new Uint8Array([0x01, 0x02]));
    vi.mocked(getSecretKey).mockResolvedValue(new Uint8Array([0x05, 0x06]));

    const result = await createQuantumAccount({ sender: SENDER, domain: DOMAIN_512 as any, salt: SALT, keypairId: "key-1" });

    expect(PaymasterAPI.createNewAccount).toHaveBeenCalledOnce();
    expect(result).toEqual({ success: true, paymaster: "0xpaymaster" });
  });

  it("returns { success: false, paymaster: '' } when API reports failure", async () => {
    vi.mocked(listKeypairs).mockResolvedValue([{ id: "key-1", level: 512, createdAt: 0 }]);
    vi.mocked(getPublicKey).mockResolvedValue(new Uint8Array([0x01, 0x02]));
    vi.mocked(getSecretKey).mockResolvedValue(new Uint8Array([0x05, 0x06]));
    vi.mocked(PaymasterAPI.createNewAccount).mockResolvedValueOnce({ success: false, result: "account already exists", paymaster: "" });

    const result = await createQuantumAccount({ sender: SENDER, domain: DOMAIN_512 as any, salt: SALT, keypairId: "key-1" });

    expect(result).toEqual({ success: false, paymaster: "" });
  });

  it("throws when keypair is not found", async () => {
    vi.mocked(listKeypairs).mockResolvedValue([]);

    await expect(
      createQuantumAccount({ sender: SENDER, domain: DOMAIN_512 as any, salt: SALT, keypairId: "missing" })
    ).rejects.toThrow(/keypair missing not found/i);
  });

  it("throws when keypair level is ECC", async () => {
    vi.mocked(listKeypairs).mockResolvedValue([{ id: "key-ecc", level: "ECC" as any, createdAt: 0 }]);

    await expect(
      createQuantumAccount({ sender: SENDER, domain: DOMAIN_512 as any, salt: SALT, keypairId: "key-ecc" })
    ).rejects.toThrow(/ECC keys not yet implemented/i);
  });
});
