// context.ts

import { Poly, GramFFT, LDLTree, Basis2, Gram2, toBigPoly, bigPolyToUint16 } from "./types";
import { ffldl_fft, gram, normalizeTree } from "./ffsampling";
import { fft, neg } from "./fft";
import { div_zq } from "./ntt";

export interface FalconContext {
  n: number;
  q: number;
  sigma: number;
  sigmin: number;
  signatureBound: number;

  B0: Basis2;
  B0_fft: GramFFT;
  G0: Gram2;
  G0_fft: GramFFT;
  T_fft: LDLTree;

  h: Poly; // public key such that h*f = g mod (Phi, q)
}

export function buildFalconContext(params: {
  f: Poly;
  g: Poly;
  F: Poly;
  G: Poly;
  q: number;
  sigma: number;
  sigmin: number;
  signatureBound: number;
}): FalconContext {
  const { f, g, F, G, q, sigma, sigmin, signatureBound } = params;
  const n = f.length;

  const polyf : number[] = Array.from(f, x => Number(x));
  const polyF : number[] = Array.from(F, x => Number(x));
  const polyg : number[] = Array.from(g, x => Number(x));
  const polyG : number[] = Array.from(G, x => Number(x));

  const B0: Basis2 = [
    [polyg, neg(polyf)],
    [polyG, neg(polyF)],
  ];

  const G0 = gram(B0);

  const B0_fft = B0.map(row => row.map(elt => fft(elt))) as GramFFT;
  const G0_fft = G0.map(row => row.map(elt => fft(elt))) as GramFFT;

  const T_fft = ffldl_fft(G0_fft);
  normalizeTree(T_fft, sigma);

  const f_q = bigPolyToUint16(f);
  const g_q = bigPolyToUint16(g);
  const h_q = div_zq(g_q, f_q);
  const h = Array.from(h_q, (x) => BigInt(x));

  return {
    n,
    q,
    sigma,
    sigmin,
    signatureBound,
    B0,
    B0_fft,
    G0,
    G0_fft,
    T_fft,
    h,
  };
}
