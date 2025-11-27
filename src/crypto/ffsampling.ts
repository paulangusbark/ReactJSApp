// ffsampling.ts

import { RandomBytesFn } from "./chacha20";
import { add, mul } from "./fft";
import { GramFFT, LDLTree, Basis2, Gram2 } from "./types";
import { fft, ifft, Complex } from "./fft";

/**
 * ffSampling in the FFT domain using an LDLTree.
 *
 * t_fft: target in FFT domain (two polynomials)
 * T_fft: LDL tree (here a flat LDL per frequency)
 * sigmin: lower bound on sigma (unused in this simplified version,
 *         but kept for interface compatibility)
 */
export function ffsampling_fft(
  t_fft: [Complex[], Complex[]],
  T_fft: LDLTree,
  sigmin: number,
  randomBytes: RandomBytesFn
): [Complex[], Complex[]] {
  const [t0_fft, t1_fft] = t_fft;
  const n = t0_fft.length;

  if (t1_fft.length !== n) {
    throw new Error("ffsampling_fft: dimension mismatch");
  }

  // Convert target to time domain
  const t0_time = ifft(t0_fft);
  const t1_time = ifft(t1_fft);

  // Recursively sample in time domain
  const [z0_time, z1_time] = ffSamplingRecursive(t0_time, t1_time, T_fft, randomBytes);

  // Convert back to FFT domain
  const z0_fft = fft(z0_time);
  const z1_fft = fft(z1_time);

  return [z0_fft, z1_fft];
}

/**
 * Recursive sampler over the time-domain coordinates.
 *
 * For simplicity, we:
 *  - Split the vectors in half.
 *  - Sample each half independently using the same LDL tree.
 *
 * This preserves the overall structure (divide and conquer) and
 * uses T_fft to correlate the two components (s0, s1).
 */
function ffSamplingRecursive(
  t0: number[],
  t1: number[],
  tree: LDLTree,
  randomBytes: RandomBytesFn
): [number[], number[]] {
  const n = t0.length;
  if (n !== t1.length) throw new Error("ffSamplingRecursive: dimension mismatch");

  if (n === 1) {
    // Base case: sample two integers from a correlated Gaussian using LDL
    const idx = 0; // all tree entries are length N, but base case is 1-coefficient slice
    const { d00, d11, l10 } = tree;

    // Sample y0, y1 ~ N(0,1)
    const y0 = gaussian01(randomBytes);
    const y1 = gaussian01(randomBytes);

    // Scale using D
    const s0 = y0 * Math.sqrt(Math.abs(1 / d00[idx]));
    const s1 = y1 * Math.sqrt(Math.abs(1 / d11[idx]));

    // Apply L: [z0; z1] = L * [s0; s1] with L = [1, 0; l10, 1]
    const z0 = s0;
    const z1 = l10[idx] * s0 + s1;

    // Center around t0[0], t1[0] and round to integers
    const k0 = Math.round(t0[0] + z0);
    const k1 = Math.round(t1[0] + z1);

    return [[k0], [k1]];
  }

  const m = n >>> 1;

  const t0L = t0.slice(0, m);
  const t0R = t0.slice(m);
  const t1L = t1.slice(0, m);
  const t1R = t1.slice(m);

  const [z0L, z1L] = ffSamplingRecursive(t0L, t1L, tree, randomBytes);
  const [z0R, z1R] = ffSamplingRecursive(t0R, t1R, tree, randomBytes);

  return [z0L.concat(z0R), z1L.concat(z1R)];
}

// === Gaussian helpers ===

/**
 * Sample N(0,1) using Box–Muller.
 * Not constant-time; only for testing / dev.
 */
function gaussian01(randomBytes: RandomBytesFn): number {
  const buf = randomBytes(8);
  if (buf.length < 8) throw new Error("randomBytes did not return enough bytes");

  const u1 = uint32ToUnitInterval(buf[0], buf[1], buf[2], buf[3]);
  const u2 = uint32ToUnitInterval(buf[4], buf[5], buf[6], buf[7]);

  const r = Math.sqrt(-2.0 * Math.log(u1));
  const theta = 2.0 * Math.PI * u2;
  return r * Math.cos(theta);
}

function uint32ToUnitInterval(b0: number, b1: number, b2: number, b3: number): number {
  const val =
    (b0) |
    (b1 << 8) |
    (b2 << 16) |
    (b3 << 24);
  return (val + 0.5) / (0xffffffff + 1);
}


/**
 * Compute the 2x2 Gram matrix of a 2x2 polynomial basis.
 *
 * B0 = [[b00, b01],
 *       [b10, b11]]
 *
 * G = B0 * B0^T (in the polynomial inner-product sense):
 *   G00 = b00*b00 + b01*b01
 *   G01 = b00*b10 + b01*b11
 *   G11 = b10*b10 + b11*b11
 *   G10 = G01
 */
export function gram(B0: Basis2): Gram2 {
  const [[b00, b01], [b10, b11]] = B0;

  const g00 = add(mul(b00, b00), mul(b01, b01));
  const g01 = add(mul(b00, b10), mul(b01, b11));
  const g11 = add(mul(b10, b10), mul(b11, b11));

  return [
    [g00, g01],
    [g01.slice(), g11],  // shallow copy to avoid aliasing
  ];
}

/**
 * Per-frequency LDL decomposition of the 2x2 Gram matrix in FFT domain.
 *
 * For each index i, decompose:
 *
 *   G_i = [ g00_i  g01_i ]
 *         [ g01_i  g11_i ]
 *
 * into G_i = L_i * D_i * L_i^T with:
 *
 *   L_i = [1, 0; l10_i, 1]
 *   D_i = diag(d00_i, d11_i)
 *
 * So:
 *   d00_i = g00_i
 *   l10_i = g01_i / d00_i
 *   d11_i = g11_i - l10_i * g01_i
 */
export function ffldl_fft(G_fft: GramFFT): LDLTree {
  const [[g00_fft, g01_fft], [, g11_fft]] = G_fft;
  const n = g00_fft.length;

  const d00 = new Array<number>(n);
  const d11 = new Array<number>(n);
  const l10 = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const g00 = g00_fft[i]; // Complex
    const g01 = g01_fft[i]; // Complex
    const g11 = g11_fft[i]; // Complex

    // Check magnitude of g00_i
    const mag2 = g00.re * g00.re + g00.im * g00.im;
    if (mag2 < 1e-12) {
      throw new Error(`ffldl_fft: g00_fft[${i}] is zero or near zero`);
    }

    //
    // LDL decomposition for complex 2×2 symmetric matrix:
    //
    //   [ a  b ]
    //   [ b  c ]   with a, b, c ∈ ℂ
    //
    // L = [ 1  0 ]
    //     [ l  1 ]
    //
    // D = diag(a, c - l*b)
    //
    // where l = b / a
    //

    // l10 = g01 / g00  (complex division)
    const denom = g00.re * g00.re + g00.im * g00.im; // |g00|^2

    const l_re = (g01.re * g00.re + g01.im * g00.im) / denom;
    const l_im = (g01.im * g00.re - g01.re * g00.im) / denom;

    // d00 = g00 (store real magnitude; sampler uses magnitude only)
    const d0 = Math.sqrt(g00.re * g00.re + g00.im * g00.im);

    // d11 = g11 - l10 * g01   (complex multiply)
    const prod_re = l_re * g01.re - l_im * g01.im;
    const prod_im = l_re * g01.im + l_im * g01.re;

    const d11_re = g11.re - prod_re;
    const d11_im = g11.im - prod_im;

    // For sampling, we only need the magnitude of d11
    const d1 = Math.sqrt(d11_re * d11_re + d11_im * d11_im);

    // Store scalar magnitudes for sampling
    d00[i] = d0;
    d11[i] = d1;

    // l10 must be stored as a REAL multiplier, so store magnitude of complex l
    // (approximation – exact Falcon uses full complex structure)
    l10[i] = Math.sqrt(l_re * l_re + l_im * l_im);
  }

  return { d00, d11, l10 };
}

/**
 * Normalize the LDL tree so that the effective variances
 * are compatible with the target sigma.
 *
 * This is a simplified version: we rescale diagonal entries so
 * that their average magnitude matches sigma².
 */
export function normalizeTree(tree: LDLTree, sigma: number): void {
  const { d00, d11 } = tree;
  const n = d00.length;

  // Simple heuristic: compute an average scale and adjust.
  let sum = 0;
  for (let i = 0; i < n; i++) {
    // d00 and d11 are like variances in frequency domain; take abs
    sum += Math.abs(d00[i]) + Math.abs(d11[i]);
  }
  const avg = sum / (2 * n);
  if (avg <= 0) return;

  const targetVar = sigma * sigma;
  const factor   = targetVar / avg;

  for (let i = 0; i < n; i++) {
    d00[i] *= factor;
    d11[i] *= factor;
  }
}
