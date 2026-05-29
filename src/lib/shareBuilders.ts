import type { Contact } from "@/storage/contactStore";
import type { Contract } from "@/storage/contractStore";
import type { Folio } from "@/storage/folioStore";
import type { Coin } from "@/storage/coinStore";
import type { Recovery } from "@/storage/recoveryStore";
import type { SharePayload } from "./sharePayload";
import { QR_CHAR_LIMIT, encodeSharePayload } from "./sharePayload";

function uniqWallets(wallets: { chainId: number; address: string; name?: string }[]) {
  const m = new Map<string, { chainId: number; address: string; name?: string }>();
  for (const w of wallets) {
    const key = `${w.chainId}:${w.address.toLowerCase()}`;
    if (!m.has(key)) m.set(key, { chainId: w.chainId, address: w.address, name: w.name });
  }
  return [...m.values()];
}

/**
 * Contact: include addresses for all chains
 */
export function buildContactShare(contact: Contact): SharePayload {
  const payload: SharePayload = {
    v: 1,
    t: "contact",
    data: {
      name: contact.name,
      surname: contact.surname,
      wallets: contact.wallets ? uniqWallets(contact.wallets) : undefined,
    },
    meta: { createdAt: Date.now(), source: "Cointrol" },
  };
  if (encodeSharePayload(payload).length > QR_CHAR_LIMIT)
    throw new Error("Contact has too many wallets to fit in a QR code");
  return payload;
}

/**
 * Contract: include ABI/metadata but omit if the encoded payload would exceed
 * QR code capacity. Uses actual encoded length for an accurate check.
 */
export function buildContractShare(contract: Contract): SharePayload {
  const baseData = {
    name: contract.name,
    address: contract.address,
    chainId: contract.chainId,
  };

  const makeMeta = () => ({ createdAt: Date.now(), source: "Cointrol" });

  // Try with full metadata (including ABI)
  if (contract.metadata) {
    const withMeta: SharePayload = {
      v: 1,
      t: "contract",
      data: { ...baseData, metadata: contract.metadata },
      meta: makeMeta(),
    };
    if (encodeSharePayload(withMeta).length <= QR_CHAR_LIMIT) {
      return withMeta;
    }

    // ABI is too large — strip it (handle both "ABI" and "abi" key conventions)
    const { ABI, abi, ...restMeta } = contract.metadata as any;
    const hasAbi = ABI !== undefined || abi !== undefined;
    const hasOtherMeta = Object.keys(restMeta).length > 0;

    if (hasOtherMeta) {
      const withoutAbi: SharePayload = {
        v: 1,
        t: "contract",
        data: { ...baseData, metadata: restMeta, abiOmitted: hasAbi || undefined },
        meta: makeMeta(),
      };
      if (encodeSharePayload(withoutAbi).length <= QR_CHAR_LIMIT) {
        return withoutAbi;
      }
    }
  }

  // Fallback: no metadata at all
  const hasAbi = !!(
    (contract.metadata as any)?.ABI || (contract.metadata as any)?.abi
  );
  return {
    v: 1,
    t: "contract",
    data: { ...baseData, abiOmitted: hasAbi || undefined },
    meta: makeMeta(),
  };
}

/**
 * Profile: share *all accounts for all chains* and *one name*.
 * We map folios -> wallets[] (chainId + address). This imports as Contact.
 */
export function buildProfileShareFromFolios(
  displayName: string,
  folios: Folio[]
): SharePayload {
  const wallets = uniqWallets(
    folios.map(f => ({ chainId: f.chainId, address: f.address, name: f.name }))
  );

  const payload: SharePayload = {
    v: 1,
    t: "profile",
    data: {
      name: displayName,
      wallets,
    },
    meta: { createdAt: Date.now(), source: "Cointrol" },
  };
  if (encodeSharePayload(payload).length > QR_CHAR_LIMIT)
    throw new Error("Profile has too many accounts to fit in a QR code");
  return payload;
}

/**
 * Coin: share full details
 */

export function buildCoinShare(coin: Coin): SharePayload {
  return {
    v: 1,
    t: "coin",
    data: {
      name: coin.name,
      symbol: coin.symbol,
      decimals: coin.decimals,
      chainId: coin.chainId,
      address: coin.address,
      type: coin.type,
    },
    meta: { createdAt: Date.now(), source: "Cointrol" },
  };
}

/**
 * Recovery: share recovery configuration details.
 * The `name` field stores the folio's on-chain address (stable ID).
 */
export function buildRecoveryShare(recovery: Recovery): SharePayload {
  return {
    v: 1,
    t: "recovery",
    data: {
      name: recovery.name,
      chainId: recovery.chainId,
      recoverableAddress: recovery.recoverableAddress,
      paymaster: recovery.paymaster ?? "",
      threshold: recovery.threshold,
      status: recovery.status,
      participants: recovery.participants,
    },
    meta: { createdAt: Date.now(), source: "Cointrol" },
  };
}

/**
 * TxRequest: share partial transaction form state so another user can
 * pre-fill and submit the transaction themselves.
 * Covers both "Send or Approve Coins" (type: "transfer") and
 * "Use a Smart Contract" (type: "contract") modes.
 * All fields except `type` and `chainId` are optional.
 */
export type TxRequestInput = {
  type: "transfer" | "contract";
  chainId: number;
  sender?: string;
  // transfer mode
  coinAddress?: string;
  coinSymbol?: string;
  coinDecimals?: number;
  // contract mode
  contractAddress?: string;
  contractName?: string;
  // shared
  functionName?: string;
  args?: Record<string, string>;
  payableValue?: string;
};

export function buildTxRequestShare(input: TxRequestInput): SharePayload {
  const payload: SharePayload = {
    v: 1,
    t: "txrequest",
    data: { ...input },
    meta: { createdAt: Date.now(), source: "Cointrol" },
  };
  if (encodeSharePayload(payload).length > QR_CHAR_LIMIT)
    throw new Error("Transaction request payload too large for QR code");
  return payload;
}
