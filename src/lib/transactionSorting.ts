import { Folio } from "../storage/folioStore";
import { Coin } from "@/storage/coinStore";
import { Txn, TransactionStore } from "@/storage/transactionStore";
import { Address } from "@/storage/addressStore";

export type TxnSortMode = "createdDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc" | "nameAsc" | "nameDesc" | "coinSymbolAsc" | "coinSymbolDesc" ;

// helper functions

function compareString(a?: string, b?: string): number {
  const as = (a ?? "").toLocaleLowerCase();
  const bs = (b ?? "").toLocaleLowerCase();
  return as.localeCompare(bs);
}

function compareNumber(a?: number, b?: number): number {
  const an = a ?? 0;
  const bn = b ?? 0;
  if (an < bn) return -1;
  if (an > bn) return 1;
  return 0;
}

function compareByMode(
  folioA: Folio | undefined, 
  folioB: Folio | undefined, 
  coinA: Coin | undefined, 
  coinB: Coin | undefined, 
  txnA: Txn | undefined,
  txnB: Txn | undefined,
  addressA: Address | undefined,
  addressB: Address | undefined,
  mode: TxnSortMode
): number {

  switch (mode) {
    case "nameAsc":
      return compareString(folioA?.name, folioB?.name);

    case "nameDesc":
      return compareString(folioB?.name, folioA?.name);

    case "createdAsc":
      return compareNumber(txnA?.createdAt, txnB?.createdAt);

    case "createdDesc":
      return compareNumber(txnB?.createdAt, txnA?.createdAt);

    case "addressAsc":
      return compareString(addressA?.name, addressB?.name);

    case "addressDesc":
      return compareString(addressB?.name, addressA?.name);

    case "chainIdAsc":
      return compareNumber(txnA?.chainId, txnB?.chainId);

    case "chainIdDesc":
      return compareNumber(txnB?.chainId, txnA?.chainId);

    case "coinSymbolAsc":
      return compareString(coinA?.symbol, coinB?.symbol);

    case "coinSymbolDesc":
      return compareString(coinB?.symbol, coinA?.symbol);

    default:
      return 0;
  }
}

export function sortTransactions(
  transactionStore: TransactionStore[],
  folios: Folio[],
  coins: Coin[],
  addresses: Address[],
  txns: Txn[],
  primarySortMode: TxnSortMode,
  secondarySortMode: TxnSortMode,
): TransactionStore[] {
  
  const copy = [...transactionStore];

  // Build lookup maps once
  const folioById = new Map(folios.map(f => [f.id, f]));
  const coinById = new Map(coins.map(c => [c.id, c]));
  const addressesById = new Map(addresses.map(a => [a.id, a]));
  const txnById = new Map(txns.map(t => [t.id, t]));
  

  copy.sort((a, b) => {
    const folioA = folioById.get(a.folioId);
    const folioB = folioById.get(b.folioId);
    const coinA = coinById.get(a.coinId);
    const coinB = coinById.get(b.coinId);
    const txnA = txnById.get(a.txnId);
    const txnB = txnById.get(b.txnId);
    const addressA = addressesById.get(a.addressId);
    const addressB = addressesById.get(b.addressId);

    const primary = compareByMode(folioA, folioB, coinA, coinB, txnA, txnB, addressA, addressB, primarySortMode);
    if (primary !== 0) return primary;

    const secondary = compareByMode(folioA, folioB, coinA, coinB, txnA, txnB, addressA, addressB, secondarySortMode);
    if (secondary !== 0) return secondary;

    // deterministic final fallback
    return compareString(a.txnId, b.txnId) || (a.walletId - b.walletId);
  });
  
  return copy;
}


export function sortTxns(
  txns: Txn[],
  mode: TxnSortMode = "createdAsc"
): Txn[] {
  const copy = [...txns];

  copy.sort((a, b) => {

  switch (mode) {

      case "createdAsc":
        return compareNumber(a.createdAt, b.createdAt);

      case "createdDesc":
        return compareNumber(b.createdAt, a.createdAt);

      case "chainIdAsc":
        return compareNumber(a.chainId, b.chainId);

      case "chainIdDesc":
        return compareNumber(b.chainId, a.chainId);

      default:
        return 0;
    }

  });
  return copy;
  
}