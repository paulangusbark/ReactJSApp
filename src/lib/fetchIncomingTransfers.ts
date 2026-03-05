import {
  createPublicClient,
  http,
  parseAbiItem,
  formatUnits,
  type Address,
} from "viem";
import { get, set } from "idb-keyval";
import { type Txn } from "@/storage/transactionStore";
import { getAllCoins, type Coin } from "@/storage/coinStore";
import { resolveEnsAddress } from "./ens";

const ENS_REGEX = /^[a-z0-9-]+\.eth$/i;
const CLOUDFLARE_ETH_RPC = "https://cloudflare-eth.com";

function lastFetchedBlockKey(chainId: number): string {
  return `cointrol:txns:lastFetchedBlock:${chainId}`;
}

/**
 * Fetch on-chain token transfers received by the given folio addresses
 * on the specified chain. Covers ERC-20, ERC-721, ERC-1155 (Single + Batch).
 *
 * @param folios      List of {id, address} objects (all on the given chainId)
 * @param chainId     Chain ID to query
 * @param rpcUrl      RPC endpoint for the chain
 * @param fromBlock   Optional override for the start block
 * @param mainnetRpcUrl  RPC endpoint for Ethereum mainnet (used for ENS resolution)
 */
export async function fetchIncomingTransfers(
  folios: Array<{ id: string; address: string }>,
  chainId: number,
  rpcUrl: string,
  fromBlock?: number,
  mainnetRpcUrl?: string
): Promise<Txn[]> {
  const ensRpc = mainnetRpcUrl ?? CLOUDFLARE_ETH_RPC;
  const client = createPublicClient({ transport: http(rpcUrl) });

  // Determine block range
  const latestBlock = await client.getBlockNumber();
  let startBlock: bigint;
  if (fromBlock != null) {
    startBlock = BigInt(fromBlock);
  } else {
    const stored = await get<number | undefined>(lastFetchedBlockKey(chainId));
    if (stored != null) {
      startBlock = BigInt(stored);
    } else {
      const defaultFrom = latestBlock > 10000n ? latestBlock - 10000n : 0n;
      startBlock = defaultFrom;
    }
  }

  if (startBlock > latestBlock) return [];

  // Build coin map: resolved lowercase address → coin
  const allCoins = await getAllCoins();
  // Exclude NATIVE coins: they have no contract address and emit no Transfer events
  const chainCoins = allCoins.filter(c => c.chainId === chainId && c.type !== "NATIVE");
  const ensResolveCache = new Map<string, string | null>();

  async function resolveAddr(addr: string): Promise<string | null> {
    if (!ENS_REGEX.test(addr)) return addr;
    if (ensResolveCache.has(addr)) return ensResolveCache.get(addr)!;
    const resolved = await resolveEnsAddress(addr, ensRpc);
    ensResolveCache.set(addr, resolved);
    return resolved;
  }

  const coinByAddress = new Map<string, Coin>();
  for (const coin of chainCoins) {
    if (ENS_REGEX.test(coin.address)) {
      const resolved = await resolveAddr(coin.address);
      if (!resolved) {
        console.warn(
          `fetchIncomingTransfers: failed to resolve ENS address for coin ${coin.id} (${coin.address}), skipping`
        );
        continue;
      }
      coinByAddress.set(resolved.toLowerCase(), coin);
    } else {
      coinByAddress.set(coin.address.toLowerCase(), coin);
    }
  }

  const coinAddresses = [...coinByAddress.keys()] as Address[];
  if (coinAddresses.length === 0) {
    await set(lastFetchedBlockKey(chainId), Number(latestBlock));
    return [];
  }

  const folioAddresses = folios.map(f => f.address as Address);
  const results: Txn[] = [];

  // Helper: fetch block timestamps in bulk
  const blockTimestampCache = new Map<bigint, number>();
  async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
    const cached = blockTimestampCache.get(blockNumber);
    if (cached !== undefined) return cached;
    const block = await client.getBlock({ blockNumber });
    const ts = Number(block.timestamp) * 1000;
    blockTimestampCache.set(blockNumber, ts);
    return ts;
  }

  // ---- ERC-20 + ERC-721 Transfer events ------------------------------------
  // topic0 = keccak256("Transfer(address,address,uint256)") — same for both
  try {
    const transferLogs = await client.getLogs({
      event: parseAbiItem(
        "event Transfer(address indexed from, address indexed to, uint256 value)"
      ),
      address: coinAddresses,
      args: { to: folioAddresses },
      fromBlock: startBlock,
      toBlock: latestBlock,
    });

    for (const log of transferLogs) {
      try {
        const contractAddress = log.address.toLowerCase();
        const coin = coinByAddress.get(contractAddress);
        if (!coin) continue;

        const fromAddr = log.args.from as string | undefined;
        const toAddr = log.args.to as string | undefined;
        if (!fromAddr || !toAddr) continue;

        const folioEntry = folios.find(
          f => f.address.toLowerCase() === toAddr.toLowerCase()
        );
        if (!folioEntry) continue;

        let amountStr: string;
        if (coin.type === "ERC721") {
          // For ERC-721, tokenId is encoded in topic3 (indexed)
          const tokenIdHex = (log as any).topics?.[3] as string | undefined;
          const tokenId = tokenIdHex ? BigInt(tokenIdHex) : 0n;
          amountStr = `#${tokenId}`;
        } else {
          const value = log.args.value as bigint | undefined;
          amountStr = value != null ? formatUnits(value, coin.decimals) : "0";
        }

        const createdAt = log.blockNumber != null
          ? await getBlockTimestamp(log.blockNumber)
          : Date.now();

        results.push({
          id: `incoming:${chainId}:${log.transactionHash}:${log.logIndex}`,
          userOpHash: "",
          transactionHash: log.transactionHash ?? "",
          direction: "incoming",
          fromAddress: fromAddr,
          toAddress: toAddr,
          amount: amountStr,
          coinId: coin.id,
          tokenSymbol: coin.symbol,
          folioId: folioEntry.id,
          chainId,
          addressId: "",
          walletId: "",
          createdAt,
          updatedAt: createdAt,
        });
      } catch (logErr) {
        console.warn("fetchIncomingTransfers: failed to process Transfer log", logErr);
      }
    }
  } catch (err) {
    console.error("fetchIncomingTransfers: ERC-20/721 getLogs failed", err);
  }

  // ---- ERC-1155 TransferSingle events --------------------------------------
  try {
    const singleLogs = await client.getLogs({
      event: parseAbiItem(
        "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)"
      ),
      address: coinAddresses,
      args: { to: folioAddresses },
      fromBlock: startBlock,
      toBlock: latestBlock,
    });

    for (const log of singleLogs) {
      try {
        const contractAddress = log.address.toLowerCase();
        const coin = coinByAddress.get(contractAddress);
        if (!coin) continue;

        const fromAddr = log.args.from as string | undefined;
        const toAddr = log.args.to as string | undefined;
        if (!fromAddr || !toAddr) continue;

        const folioEntry = folios.find(
          f => f.address.toLowerCase() === toAddr.toLowerCase()
        );
        if (!folioEntry) continue;

        const value = log.args.value as bigint | undefined;
        const amountStr = value != null ? formatUnits(value, coin.decimals) : "0";

        const createdAt = log.blockNumber != null
          ? await getBlockTimestamp(log.blockNumber)
          : Date.now();

        results.push({
          id: `incoming:${chainId}:${log.transactionHash}:${log.logIndex}`,
          userOpHash: "",
          transactionHash: log.transactionHash ?? "",
          direction: "incoming",
          fromAddress: fromAddr,
          toAddress: toAddr,
          amount: amountStr,
          coinId: coin.id,
          tokenSymbol: coin.symbol,
          folioId: folioEntry.id,
          chainId,
          addressId: "",
          walletId: "",
          createdAt,
          updatedAt: createdAt,
        });
      } catch (logErr) {
        console.warn("fetchIncomingTransfers: failed to process TransferSingle log", logErr);
      }
    }
  } catch (err) {
    console.error("fetchIncomingTransfers: ERC-1155 TransferSingle getLogs failed", err);
  }

  // ---- ERC-1155 TransferBatch events ---------------------------------------
  try {
    const batchLogs = await client.getLogs({
      event: parseAbiItem(
        "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)"
      ),
      address: coinAddresses,
      args: { to: folioAddresses },
      fromBlock: startBlock,
      toBlock: latestBlock,
    });

    for (const log of batchLogs) {
      try {
        const contractAddress = log.address.toLowerCase();
        const coin = coinByAddress.get(contractAddress);
        if (!coin) continue;

        const fromAddr = log.args.from as string | undefined;
        const toAddr = log.args.to as string | undefined;
        if (!fromAddr || !toAddr) continue;

        const folioEntry = folios.find(
          f => f.address.toLowerCase() === toAddr.toLowerCase()
        );
        if (!folioEntry) continue;

        const values = log.args.values as bigint[] | undefined;
        const totalAmount = values ? values.reduce((a, b) => a + b, 0n) : 0n;
        const amountStr = formatUnits(totalAmount, coin.decimals);

        const createdAt = log.blockNumber != null
          ? await getBlockTimestamp(log.blockNumber)
          : Date.now();

        results.push({
          id: `incoming:${chainId}:${log.transactionHash}:${log.logIndex}`,
          userOpHash: "",
          transactionHash: log.transactionHash ?? "",
          direction: "incoming",
          fromAddress: fromAddr,
          toAddress: toAddr,
          amount: amountStr,
          coinId: coin.id,
          tokenSymbol: coin.symbol,
          folioId: folioEntry.id,
          chainId,
          addressId: "",
          walletId: "",
          createdAt,
          updatedAt: createdAt,
        });
      } catch (logErr) {
        console.warn("fetchIncomingTransfers: failed to process TransferBatch log", logErr);
      }
    }
  } catch (err) {
    console.error("fetchIncomingTransfers: ERC-1155 TransferBatch getLogs failed", err);
  }

  // Persist the latest block so the next refresh only queries new blocks
  await set(lastFetchedBlockKey(chainId), Number(latestBlock));

  return results;
}
