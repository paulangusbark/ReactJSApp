import { createPublicClient, http, encodeFunctionData } from "viem";
import { quantumAccountAbi, recoverableAbi } from "./abiTypes";

export type RecoverableOnChainEntry = {
  recoverableAddress: `0x${string}`;
  isActive: boolean;
  threshold: number | null;
  participants: `0x${string}`[] | null;
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
      await publicClient.call({
        to: accountAddress,
        data: encodeFunctionData({
          abi: quantumAccountAbi,
          functionName: "disableRecoverable",
          args: [addr],
        }),
        account: entryPoint,
      });
      isActive = true;
    } catch {
      isActive = false;
    }

    let threshold: number | null = null;
    try {
      const raw = await publicClient.readContract({
        address: addr,
        abi: recoverableAbi,
        functionName: "getThreshold",
      }) as bigint;
      threshold = Number(raw);
    } catch { /* old contract without getter */ }

    let participants: `0x${string}`[] | null = null;
    try {
      participants = await publicClient.readContract({
        address: addr,
        abi: recoverableAbi,
        functionName: "getListOfAddresses",
      }) as `0x${string}`[];
    } catch { /* old contract without getter */ }

    results.push({ recoverableAddress: addr, isActive, threshold, participants });
  }

  return results;
}
