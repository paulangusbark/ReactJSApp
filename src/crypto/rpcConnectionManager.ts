// src/rpcConnectionManager.ts

import {
  createPublicClient,
  createWalletClient,
  http,
  Hex,
  Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getKeys } from "../repo";

// ---------- DB + Private Key Helpers ----------

type AppConfigRow = { value: string | Buffer };

function loadEcdsaKey(): Hex {
  const row = getKeys.get("ecdsa") as AppConfigRow | undefined;
  if (!row) throw new Error("ecdsa private key missing in app_config");

  const v = row.value;
  if (Buffer.isBuffer(v)) return ("0x" + v.toString("hex")) as Hex;
  if (typeof v === "string")
    return (v.startsWith("0x") ? v : "0x" + v) as Hex;

  throw new Error("Invalid ECDSA private key format in DB");
}

// ---------- Minimal ABIs ----------

const quantumAccountFactoryAbi = [
  {
    type: "function",
    name: "createAccount",
    stateMutability: "nonpayable",
    inputs: [
      { name: "entryPoint", type: "address" },
      { name: "owner", type: "address" },
      { name: "falcon", type: "address" },
      { name: "domain", type: "bytes" },
      { name: "publicKeyBytes", type: "bytes" },
      { name: "salt", type: "bytes32" },
    ],
    outputs: [{ name: "account", type: "address" }],
  },
] as const;

const transactionPaymasterAbi = [
  {
    type: "function",
    name: "addTxn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "num", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const erc20MintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

// ---------- RPC Manager Factory ----------

export function createRpcConnectionManager(rpcUrl: string) {
  const account = privateKeyToAccount(loadEcdsaKey());

  const publicClient = createPublicClient({
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    transport: http(rpcUrl),
  });

  // ---------- QuantumAccountFactory.createAccount ----------

  async function createQuantumAccount(args: {
    factoryAddress: Address;
    entryPoint: Address;
    owner: Address;
    falcon: Address;
    domain: Hex;
    publicKeyBytes: Hex;
    salt: Hex;
  }): Promise<{ txHash: Hex; predicted: Address }> {
    const { factoryAddress, entryPoint, owner, falcon, domain, publicKeyBytes, salt } =
      args;

    const { request, result } = await publicClient.simulateContract({
      address: factoryAddress,
      abi: quantumAccountFactoryAbi,
      functionName: "createAccount",
      args: [entryPoint, owner, falcon, domain, publicKeyBytes, salt],
      account,
    });

    const txHash = await walletClient.writeContract(request);

    return { txHash, predicted: result as Address };
  }

  // ---------- Paymaster.addTxn ----------

  async function creditAccountTransactions(
    paymasterAddress: Address,
    user: Address,
    num: bigint | number
  ): Promise<Hex> {
    const { request } = await publicClient.simulateContract({
      address: paymasterAddress,
      abi: transactionPaymasterAbi,
      functionName: "addTxn",
      args: [user, BigInt(num)],
      account,
    });

    return walletClient.writeContract(request);
  }

  // ---------- ERC20.mint ----------

  async function mintTokens(
    tokenAddress: Address,
    to: Address,
    amount: bigint | number
  ): Promise<Hex> {
    const { request } = await publicClient.simulateContract({
      address: tokenAddress,
      abi: erc20MintAbi,
      functionName: "mint",
      args: [to, BigInt(amount)],
      account,
    });

    return walletClient.writeContract(request);
  }

  // --------- Exports ---------

  return {
    account,
    publicClient,
    walletClient,
    createQuantumAccount,
    creditAccountTransactions,
    mintTokens,
  };
}
