import { Address } from "../storage/addressStore";

export type AddressSortMode = "nameAsc" | "createdDesc" | "nameDesc" | "createdAsc" | "custom";

export function sortAddresses(
  addresses: Address[],
  mode: AddressSortMode = "createdAsc"
): Address[] {
  const copy = [...addresses];

  if (mode === "nameAsc") {
    copy.sort((a, b) =>
      a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase())
    );
  } else if (mode === "nameDesc") {
    copy.sort((a, b) =>
      b.name.toLocaleLowerCase().localeCompare(a.name.toLocaleLowerCase())
    );
  } else if (mode === "createdAsc") {
    copy.sort((a, b) => a.createdAt - b.createdAt);
  } else if (mode === "createdDesc") {
    copy.sort((a, b) => b.createdAt - a.createdAt);
  }


  return copy;
}