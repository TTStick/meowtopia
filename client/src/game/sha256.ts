// Minimal single-block SHA-256 (messages under 56 bytes), fast enough to run a
// few million times a second for the sign-up proof of work.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Uint32Array(64);

/** First word of sha256 for a message shorter than 56 bytes (one block). */
export function sha256Word0(bytes: Uint8Array, len: number): [number, number] {
  W.fill(0, 0, 16);
  for (let i = 0; i < len; i++) W[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  W[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
  W[15] = len * 8;
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15], b = W[i - 2];
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
  }
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
  for (let i = 0; i < 64; i++) {
    const S1 = ((h4 >>> 6) | (h4 << 26)) ^ ((h4 >>> 11) | (h4 << 21)) ^ ((h4 >>> 25) | (h4 << 7));
    const ch = (h4 & h5) ^ (~h4 & h6);
    const t1 = (h7 + S1 + ch + K[i] + W[i]) | 0;
    const S0 = ((h0 >>> 2) | (h0 << 30)) ^ ((h0 >>> 13) | (h0 << 19)) ^ ((h0 >>> 22) | (h0 << 10));
    const maj = (h0 & h1) ^ (h0 & h2) ^ (h1 & h2);
    const t2 = (S0 + maj) | 0;
    h7 = h6; h6 = h5; h5 = h4; h4 = (h3 + t1) | 0; h3 = h2; h2 = h1; h1 = h0; h0 = (t1 + t2) | 0;
  }
  return [(h0 + 0x6a09e667) >>> 0, (h1 + 0xbb67ae85) >>> 0];
}

export function zeroBits(w0: number, w1: number): number {
  return w0 === 0 ? 32 + Math.clz32(w1) : Math.clz32(w0);
}

