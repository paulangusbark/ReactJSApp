import { createPublicClient, http } from "viem";
import { quantumAccountAbi } from "./abiTypes";

export type RecoverableOnChainEntry = {
  recoverableAddress: `0x${string}`;
  isActive: boolean;
};

export async function fetchRecoverableDetails(opts: {
  accountAddress: `0x${string}`;
  rpcUrl: string;
  entryPoint: `0x${string}`;
  keypairLevel: 512 | 1024;
}): Promise<RecoverableOnChainEntry[]> {
  const { accountAddress, rpcUrl, entryPoint } = opts;
  const publicClient = createPublicClient({ transport: http(rpcUrl) });

  const addresses = await publicClient.readContract({
    address: accountAddress,
    abi: quantumAccountAbi,
    functionName: "getRecoverables",
  }) as `0x${string}`[];

  if (!addresses || addresses.length === 0) return [];

  const results: RecoverableOnChainEntry[] = [];

  for (const addr of addresses) {
    let isActive = false;
    try {
      await publicClient.simulateContract({
        address: accountAddress,
        abi: quantumAccountAbi,
        functionName: "disableRecoverable",
        args: [addr],
        account: entryPoint,
      });
      isActive = true;
    } catch {
      isActive = false;
    }
    results.push({ recoverableAddress: addr, isActive });
  }

  return results;
}
