// q is the integer modulus which is used in Falcon.
export const q = 12 * 1024 + 1; // 12289

type Poly = number[];

/**
 * Split a polynomial f into two polynomials [f0, f1].
 * Format: coefficient array
 */
export function split(f: Poly): [Poly, Poly] {
  const n = f.length;
  const half = n >> 1;

  const f0 = new Array<number>(half);
  const f1 = new Array<number>(half);

  for (let i = 0; i < half; i++) {
    f0[i] = f[2 * i];
    f1[i] = f[2 * i + 1];
  }

  return [f0, f1];
}

/**
 * Merge two polynomials [f0, f1] back into a single polynomial f.
 * Format: coefficient array
 */
export function merge(fList: [Poly, Poly]): Poly {
  const [f0, f1] = fList;
  const n = f0.length * 2;
  const f = new Array<number>(n);

  for (let i = 0; i < f0.length; i++) {
    f[2 * i] = f0[i];
    f[2 * i + 1] = f1[i];
  }

  return f;
}

/**
 * Compute the squared Euclidean norm of a vector of polynomials v.
 * v is an array of polynomials, each polynomial is an array of coefficients.
 */
export function sqnorm(v: Poly[]): number {
  let res = 0;

  for (const elt of v) {
    for (const coef of elt) {
      res += coef * coef;
    }
  }

  return res;
}
