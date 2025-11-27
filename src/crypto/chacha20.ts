// chacha20.ts

export type RandomBytesFn = (length: number) => Uint8Array;

/**
 * Minimal ChaCha20 stream cipher implementation with a simple seed→key mapping.
 * 
 * Seed usage:
 * - First 32 bytes -> key (padded with zeros if shorter)
 * - Next 12 bytes  -> nonce (padded with zeros if not present)
 * - Counter starts at 0
 */
export class ChaCha20 {
  private key: Uint32Array;
  private nonce: Uint32Array;
  private counter: number;
  private buffer: Uint8Array;
  private bufferPos: number;

  constructor(seed: Uint8Array) {
    const keyBytes = new Uint8Array(32);
    keyBytes.set(seed.subarray(0, Math.min(32, seed.length)));

    const nonceBytes = new Uint8Array(12);
    if (seed.length > 32) {
      nonceBytes.set(seed.subarray(32, Math.min(44, seed.length)));
    }

    this.key = bytesToUint32ArrayLE(keyBytes);
    this.nonce = bytesToUint32ArrayLE(nonceBytes);
    this.counter = 0;
    this.buffer = new Uint8Array(0);
    this.bufferPos = 0;
  }

  /**
   * Generate `length` pseudorandom bytes.
   */
  randomBytes(length: number): Uint8Array {
    const out = new Uint8Array(length);
    let offset = 0;

    while (offset < length) {
      if (this.bufferPos >= this.buffer.length) {
        this.buffer = this.generateBlock();
        this.bufferPos = 0;
      }
      const chunk = Math.min(length - offset, this.buffer.length - this.bufferPos);
      out.set(this.buffer.subarray(this.bufferPos, this.bufferPos + chunk), offset);
      this.bufferPos += chunk;
      offset += chunk;
    }

    return out;
  }

  private generateBlock(): Uint8Array {
    // ChaCha20 constants
    const constants = new Uint32Array([
      0x61707865, // "expa"
      0x3320646e, // "nd 3"
      0x79622d32, // "2-by"
      0x6b206574, // "te k"
    ]);

    const state = new Uint32Array(16);
    const workingState = new Uint32Array(16);

    // Setup state
    state.set(constants, 0);
    state.set(this.key, 4); // 8 words
    state[12] = this.counter >>> 0;
    state[13] = this.nonce[0] >>> 0;
    state[14] = this.nonce[1] >>> 0;
    state[15] = this.nonce[2] >>> 0;

    workingState.set(state);

    // 20 rounds (10 double rounds)
    for (let i = 0; i < 10; i++) {
      // Column rounds
      quarterRound(workingState, 0, 4, 8, 12);
      quarterRound(workingState, 1, 5, 9, 13);
      quarterRound(workingState, 2, 6, 10, 14);
      quarterRound(workingState, 3, 7, 11, 15);
      // Diagonal rounds
      quarterRound(workingState, 0, 5, 10, 15);
      quarterRound(workingState, 1, 6, 11, 12);
      quarterRound(workingState, 2, 7, 8, 13);
      quarterRound(workingState, 3, 4, 9, 14);
    }

    const output = new Uint8Array(64);
    for (let i = 0; i < 16; i++) {
      const word = (workingState[i] + state[i]) >>> 0;
      output[4 * i + 0] = word & 0xff;
      output[4 * i + 1] = (word >>> 8) & 0xff;
      output[4 * i + 2] = (word >>> 16) & 0xff;
      output[4 * i + 3] = (word >>> 24) & 0xff;
    }

    // Increment counter for next block
    this.counter = (this.counter + 1) >>> 0;

    return output;
  }
}

function bytesToUint32ArrayLE(bytes: Uint8Array): Uint32Array {
  const len = Math.ceil(bytes.length / 4);
  const out = new Uint32Array(len);
  for (let i = 0; i < len; i++) {
    const b0 = bytes[4 * i] ?? 0;
    const b1 = bytes[4 * i + 1] ?? 0;
    const b2 = bytes[4 * i + 2] ?? 0;
    const b3 = bytes[4 * i + 3] ?? 0;
    out[i] =
      (b0) |
      (b1 << 8) |
      (b2 << 16) |
      (b3 << 24);
  }
  return out;
}

function rotl32(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function quarterRound(state: Uint32Array, a: number, b: number, c: number, d: number): void {
  state[a] = (state[a] + state[b]) >>> 0;
  state[d] = rotl32(state[d] ^ state[a], 16);

  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotl32(state[b] ^ state[c], 12);

  state[a] = (state[a] + state[b]) >>> 0;
  state[d] = rotl32(state[d] ^ state[a], 8);

  state[c] = (state[c] + state[d]) >>> 0;
  state[b] = rotl32(state[b] ^ state[c], 7);
}
