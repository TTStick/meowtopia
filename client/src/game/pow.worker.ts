// Proof of work for creating a guest account: find n so that
// sha256(`${challenge}:${n}`) starts with `bits` zero bits. Costs a phone a
// fraction of a second, but makes mass sign-ups expensive.
import { sha256Word0, zeroBits } from './sha256';

self.onmessage = (ev: MessageEvent<{ c: string; d: number }>) => {
  const { c, d } = ev.data;
  const enc = new TextEncoder();
  const buf = new Uint8Array(64);
  const prefix = enc.encode(`${c}:`);
  buf.set(prefix);
  for (let n = 0; n < 2 ** 31; n++) {
    const tail = enc.encode(String(n));
    buf.set(tail, prefix.length);
    const [w0, w1] = sha256Word0(buf, prefix.length + tail.length);
    if (zeroBits(w0, w1) >= d) {
      (self as unknown as Worker).postMessage({ n: String(n) });
      return;
    }
  }
};
