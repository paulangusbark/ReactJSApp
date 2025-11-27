import { Complex } from "./fft";

export type FFTVec = Complex[];  
export type Poly = bigint[];         // ring element as JS array
export type GramFFT = [[FFTVec, FFTVec], [FFTVec, FFTVec]]; // 2x2 matrix of FFT vectors

export type Basis2 = [[number[], number[]], [number[], number[]]];
export type Gram2  = [[number[], number[]], [number[], number[]]];

// LDL “tree” – here it’s a flat per-frequency structure, not a recursive tree
export interface LDLTree {
  // For each frequency i, we have:
  //   G_i = L_i * D_i * L_i^T
  // where
  //   L_i = [1, 0; l10[i], 1]
  //   D_i = diag(d00[i], d11[i])
  d00: number[];  // length n
  d11: number[];  // length n
  l10: number[];  // length n
}

// Convert number[] -> BigPoly
export function toBigPoly(a: number[]): Poly {
  return a.map((x) => BigInt(x));
}

// Convert BigPoly -> Uint16Array mod q (for DB / Solidity / Uint16 code)
export function bigPolyToUint16(p: Poly, q: bigint = 12289n): Uint16Array {
  const arr = new Uint16Array(p.length);
  for (let i = 0; i < p.length; i++) {
    let v = p[i] % q;
    if (v < 0n) v += q;
    arr[i] = Number(v); // safe because v < q <= 12289 < 2^16
  }
  return arr;
}
