// src/rpcConnectionManager.ts

import {
  createPublicClient,
  http,
  Hex,
  Address,
} from "viem";

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

  const publicClient = createPublicClient({
    transport: http(rpcUrl),
  });

  // ---------- ERC20.mint ----------

/*   async function mintTokens(
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
  } */

  // --------- Exports ---------

  return {
    publicClient
  };
}
