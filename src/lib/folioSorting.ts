import { PortfolioStore, Folio, Wallet } from "../storage/folioStore";
import { Coin } from "@/storage/coinStore";

export type FolioSortMode = "createdDesc" | "addressAsc" | "addressDesc" | "createdAsc" | "chainIdAsc" | "chainIdDesc" | "nameAsc" | "nameDesc" | "coinSymbolAsc" | "coinSymbolDesc" | "coinBalanceAsc" | "coinBalanceDesc";

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
  walletA: Wallet | undefined, 
  walletB: Wallet | undefined, 
  mode: FolioSortMode
): number {

  switch (mode) {
    case "nameAsc":
      return compareString(folioA?.name, folioB?.name);

    case "nameDesc":
      return compareString(folioB?.name, folioA?.name);

    case "createdAsc":
      return compareNumber(folioA?.createdAt, folioB?.createdAt);

    case "createdDesc":
      return compareNumber(folioB?.createdAt, folioA?.createdAt);

    case "addressAsc":
      return compareString(folioA?.address, folioB?.address);

    case "addressDesc":
      return compareString(folioB?.address, folioA?.address);

    case "chainIdAsc":
      return compareNumber(folioA?.chainId, folioB?.chainId);

    case "chainIdDesc":
      return compareNumber(folioB?.chainId, folioA?.chainId);

    case "coinSymbolAsc":
      return compareString(coinA?.symbol, coinB?.symbol);

    case "coinSymbolDesc":
      return compareString(coinB?.symbol, coinA?.symbol);

    case "coinBalanceAsc": {
      const balA = Number(walletA?.balance ?? 0);
      const balB = Number(walletB?.balance ?? 0);

      const decA = coinA?.decimals ?? 1;
      const decB = coinB?.decimals ?? 1;

      const normA = balA / decA;
      const normB = balB / decB;

      return compareNumber(normA, normB);
    }

    case "coinBalanceDesc": {
      const balA = Number(walletA?.balance ?? 0);
      const balB = Number(walletB?.balance ?? 0);

      const decA = coinA?.decimals ?? 1;
      const decB = coinB?.decimals ?? 1;

      const normA = balA / decA;
      const normB = balB / decB;

      return compareNumber(normB, normA);
    }

    default:
      return 0;
  }
}

export function sortPortfolio(
  portfolio: PortfolioStore[],
  folios: Folio[],
  coins: Coin[],
  primarySortMode: FolioSortMode,
  secondarySortMode: FolioSortMode,
): PortfolioStore[] {
  
  const copy = [...portfolio];

  // Build lookup maps once
  const folioById = new Map(folios.map(f => [f.id, f]));
  const coinById = new Map(coins.map(c => [c.id, c]));

  

  copy.sort((a, b) => {
    const folioA = folioById.get(a.folioId);
    const folioB = folioById.get(b.folioId);
    const coinA = coinById.get(a.coinId);
    const coinB = coinById.get(b.coinId);
    const walletA = folioA?.wallet?.[a.walletId];
    const walletB = folioB?.wallet?.[b.walletId];

    const primary = compareByMode(folioA, folioB, coinA, coinB, walletA, walletB, primarySortMode);
    if (primary !== 0) return primary;

    const secondary = compareByMode(folioA, folioB, coinA, coinB, walletA, walletB, secondarySortMode);
    if (secondary !== 0) return secondary;

    // deterministic final fallback
    return compareString(a.folioId, b.folioId) || (a.walletId - b.walletId);
  });
  
  return copy;
}


export function sortFolios(
  folios: Folio[],
  mode: FolioSortMode = "createdAsc"
): Folio[] {
  const copy = [...folios];

  copy.sort((a, b) => {

  switch (mode) {
      case "nameAsc":
        return compareString(a.name, b.name);

      case "nameDesc":
        return compareString(b.name, a.name);

      case "createdAsc":
        return compareNumber(a.createdAt, b.createdAt);

      case "createdDesc":
        return compareNumber(b.createdAt, a.createdAt);

      case "addressAsc":
        return compareString(a.address, b.address);

      case "addressDesc":
        return compareString(b.address, a.address);

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