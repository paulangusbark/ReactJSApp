import { ntruGen } from "./ntrugen";
import { sub_zq, mul_zq} from "./ntt";
import { getKeys, addNewKey } from "@/repo";
import { encodePkPacked, decodePkPacked } from "./falconPKPacked";
import { fft, ifft, addFft, mulFft, sub, neg, Complex, cMul, cNeg, cScale } from "./fft";
import { ChaCha20 } from "./chacha20";
import { ffsampling_fft } from "./ffsampling";
import { FalconContext, buildFalconContext } from "./context";
import { hashToPointCT } from "./hashMessage";
import { BytesLike } from "./hashMessage";
import { encodeSignatureHex } from "./signaturePacked";
import { Poly, bigPolyToUint16 } from "./types";

const SALT_LEN = 40;
const SEED_LEN = 56;
const n = 1024;
const sig_bound = 70265242;
const q = 12289;
const sigmin = 1.298280334344292;
const sigma = 168.38857144654395;

export function verify_signature(m: Uint16Array, s: Uint16Array, h: Uint16Array): boolean {
    var s0 = sub_zq(m, mul_zq(s, h));
    var is_valid = 0;
    for (let i = 0; i < n; i++) {
        if (s0[i] > q/2) {
            is_valid += s0[i] ** 2;
        } else {
            is_valid += (q - s0[i]) ** 2;
        }
        if (s[i] > q/2) {
            is_valid += s[i] ** 2;
        } else {
            is_valid += (q - s[i]) ** 2;
        }
    }
    return (is_valid < sig_bound);
}

type RandomBytesFn = (length: number) => Uint8Array;

// Example default RNG – tweak to your environment (Node/browser)
const defaultRandomBytes: RandomBytesFn = (length: number): Uint8Array => {
  const buf = new Uint8Array(length);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    crypto.getRandomValues(buf);
    return buf;
  } else {
    // Node.js fallback (if you want)
    // const { randomBytes } = require("crypto");
    // return randomBytes(length);
    throw new Error("No suitable random source configured for defaultRandomBytes");
  }
};

function getPrivateKey(): [Uint16Array, Uint16Array, Uint16Array, Uint16Array] {
  console.log("[getPrivateKey] start");
    // check db for private key
    var check_keys = true;
    const get_f = getKeys.get(`f`) as any;
    const get_g = getKeys.get(`g`) as any;
    const get_F = getKeys.get(`F`) as any;
    const get_G = getKeys.get(`G`) as any;
    if (!get_F && !get_f && !get_g && !get_G){
        const [fPoly, gPoly, FPoly, GPoly] = ntruGen(1024);
        const f = bigPolyToUint16(fPoly);
        const g = bigPolyToUint16(gPoly);
        const F = bigPolyToUint16(FPoly);
        const G = bigPolyToUint16(GPoly);
        const set_f = addNewKey.run(`f`, encodePkPacked(f)) as any;
        const set_F = addNewKey.run(`F`, encodePkPacked(F)) as any;
        const set_g = addNewKey.run(`g`, encodePkPacked(g)) as any;
        const set_G = addNewKey.run(`G`, encodePkPacked(G)) as any;
        if (!set_f || !set_F || !set_g || !set_G) throw new Error(`Failed to add new keys to db`);
        return [f, F, g, G];
    }
    if (!get_F || !get_f || !get_g || !get_G) throw new Error(`Some keys missing in db`);
    // if no private key, create one and save to db
    const f = decodePkPacked(get_f.value);
    const F = decodePkPacked(get_F.value);
    const G = decodePkPacked(get_G.value);
    const g = decodePkPacked(get_g.value);
    return [f, F, g, G];
}

export function getPublicKey(): string {
  const [ f, F, g, G ] = getPrivateKey();
  const fPoly: Poly = Array.from(f, x => BigInt(x));
  const gPoly: Poly = Array.from(g, x => BigInt(x));
  const FPoly: Poly = Array.from(F, x => BigInt(x));
  const GPoly: Poly = Array.from(G, x => BigInt(x));
  const ctx = buildFalconContext({f: fPoly, g: gPoly, F: FPoly, G: GPoly, q: 12289, sigma: sigma, sigmin: sigmin, signatureBound: sig_bound});
  const h: number[] = Array.from(ctx.h, x => Number(x));
  const packed = encodePkPacked(h);   
  const publicKeyHex = Buffer.from(packed).toString("hex");
  return `0x${publicKeyHex}`;
}

// --- main function ---

/**
 * Sample a short vector s = (s0, s1) such that:
 *   s0 + s1 * h = point
 *
 * point: Uint16Array of length n with coefficients in Z_q.
 * Returns [s0, s1] as number[] (integer coefficients).
 */

export function samplePreimage(
  ctx: FalconContext,
  point: Uint16Array,
  seed?: Uint8Array
): [number[], number[]] {
  const { n, q, B0_fft, T_fft, sigmin } = ctx;

  // B0_fft is:
  //   [[a_fft, b_fft],
  //    [c_fft, d_fft]]
  // each entry is Complex[] of length n
  const [[a_fft, b_fft], [c_fft, d_fft]] = B0_fft;

  // Convert point to number[] then to FFT domain
  const pointArr = Array.from(point, x => Number(x));
  const point_fft = fft(pointArr); // Complex[]

  // Build t_fft = [t0_fft, t1_fft] in FFT domain:
  //
  //  t0_fft = (point_fft * d_fft) / q
  //  t1_fft = -(point_fft * b_fft) / q
  //
  const t0_fft: Complex[] = new Array(n);
  const t1_fft: Complex[] = new Array(n);
  const invQ = 1 / q;

  for (let i = 0; i < n; i++) {
    const pd = cMul(point_fft[i], d_fft[i]);
    const pb = cMul(point_fft[i], b_fft[i]);

    t0_fft[i] = cScale(pd, invQ);
    t1_fft[i] = cScale(cNeg(pb), invQ);
  }

  const t_fft: [Complex[], Complex[]] = [t0_fft, t1_fft];

  // Choose RNG: default or seeded ChaCha20
  let rng: RandomBytesFn;
  if (seed === undefined) {
    rng = defaultRandomBytes;
  } else {
    const ch = new ChaCha20(seed);
    rng = (len: number) => ch.randomBytes(len);
  }

  // z_fft = ffsampling_fft(t_fft, T_fft, sigmin, rng)
  // z_fft is [Complex[], Complex[]] (FFT domain)
  const z_fft = ffsampling_fft(t_fft, T_fft, sigmin, rng);

  // v0_fft = z0*a + z1*c
  // v1_fft = z0*b + z1*d
  const v0_fft = addFft(
    mulFft(z_fft[0], a_fft),
    mulFft(z_fft[1], c_fft)
  );
  const v1_fft = addFft(
    mulFft(z_fft[0], b_fft),
    mulFft(z_fft[1], d_fft)
  );

  // Back to time domain + rounding
  const v0_ifft = ifft(v0_fft); // number[]
  const v1_ifft = ifft(v1_fft); // number[]

  const v0 = v0_ifft.map(x => Math.round(x));
  const v1 = v1_ifft.map(x => Math.round(x));

  // s = (point, 0) - v
  // s0 = point - v0
  // s1 = -v1
  const s0 = sub(pointArr, v0);
  const s1 = neg(v1);

  return [s0, s1];
}

export function sign(
  message: BytesLike,
  domain: BytesLike,
  randomBytes: RandomBytesFn = defaultRandomBytes
): string {
  const [ f, F, g, G ] = getPrivateKey();
  const fPoly: Poly = Array.from(f, x => BigInt(x));
  const gPoly: Poly = Array.from(g, x => BigInt(x));
  const FPoly: Poly = Array.from(F, x => BigInt(x));
  const GPoly: Poly = Array.from(G, x => BigInt(x));
  const ctx = buildFalconContext({f: fPoly, g: gPoly, F: FPoly, G: GPoly, q: 12289, sigma: sigma, sigmin: sigmin, signatureBound: sig_bound});
  const { n, q, signatureBound } = ctx;

  const salt = randomBytes(SALT_LEN);
  const hashed = hashToPointCT(domain, salt, message);

  while (true) {
    let sParts: [number[], number[]];
    if (randomBytes === defaultRandomBytes) {
      sParts = samplePreimage(ctx, hashed);
    } else {
      const seed = randomBytes(SEED_LEN);
      sParts = samplePreimage(ctx, hashed, seed);
    }

    const [s0, s1] = sParts;

    let norm = 0;
    for (let i = 0; i < s0.length; i++) norm += s0[i] * s0[i];
    for (let i = 0; i < s1.length; i++) norm += s1[i] * s1[i];

    if (norm <= signatureBound) {
      const sig = new Uint16Array(2 * n);
      for (let i = 0; i < n; i++) {
        const c0 = ((s0[i] % q) + q) % q;
        const c1 = ((s1[i] % q) + q) % q;
        sig[i] = c0;
        sig[n + i] = c1;
      }
      return encodeSignatureHex(sig, salt, SALT_LEN);
    }
  }
}