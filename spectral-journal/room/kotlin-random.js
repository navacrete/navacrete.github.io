/**
 * Bit-exact port of kotlin.random.Random(seed: Long) (XorWowRandom) and of
 * MutableList.shuffle(random), so the web client deals the same bingo card as the Android app
 * for the same seed and player id. Verified against vectors printed by the Kotlin code
 * (test/bingo.test.js).
 */

/** Java String.hashCode() */
export function javaHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export class KotlinRandom {
  /** seed: BigInt or Number (64-bit Long semantics) */
  constructor(seed) {
    const s = BigInt.asIntN(64, BigInt(seed));
    const seed1 = Number(BigInt.asIntN(32, s));
    const seed2 = Number(BigInt.asIntN(32, s >> 32n));
    this.x = seed1 | 0;
    this.y = seed2 | 0;
    this.z = 0;
    this.w = 0;
    this.v = ~seed1 | 0;
    this.addend = ((seed1 << 10) ^ (seed2 >>> 4)) | 0;
    if ((this.x | this.y | this.z | this.w | this.v) === 0) throw new Error("zero seed");
    for (let i = 0; i < 64; i++) this.nextInt();
  }

  nextInt() {
    let t = this.x;
    t = t ^ (t >>> 2);
    this.x = this.y; this.y = this.z; this.z = this.w;
    const v0 = this.v;
    this.w = v0;
    t = ((t ^ (t << 1)) ^ v0 ^ (v0 << 4)) | 0;
    this.v = t;
    this.addend = (this.addend + 362437) | 0;
    return (t + this.addend) | 0;
  }

  nextBits(bitCount) {
    // takeUpperBits: this.ushr(32 - bitCount) and (-bitCount).shr(31)
    const n = this.nextInt();
    return (n >>> (32 - bitCount)) & ((-bitCount) >> 31);
  }

  /** Random.nextInt(until) for until > 0 */
  nextIntUntil(until) {
    const n = until | 0;
    if (n <= 0) throw new Error("until must be positive");
    if ((n & -n) === n) {
      const bitCount = 31 - Math.clz32(n);
      return this.nextBits(bitCount);
    }
    let v;
    for (;;) {
      const bits = this.nextInt() >>> 1;
      v = bits % n;
      if (((bits - v + (n - 1)) | 0) >= 0) return v;
    }
  }
}

/** Kotlin's shuffled(random): Fisher–Yates from the end with nextInt(i + 1). */
export function kotlinShuffled(list, rnd) {
  const a = list.slice();
  for (let i = a.length - 1; i >= 1; i--) {
    const j = rnd.nextIntUntil(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/** PartyScoring.dealCard: 24 events + a free centre, same card for the same seed (+ pid when personal). */
export function dealCard(pool, seed, pid, side = 5, free = 12) {
  const s = BigInt.asIntN(64, BigInt(seed) ^ BigInt(pid ? javaHash(pid) : 0));
  const rnd = new KotlinRandom(s);
  const picked = kotlinShuffled(pool, rnd).slice(0, side * side - 1);
  const out = [];
  let i = 0;
  for (let cell = 0; cell < side * side; cell++) out.push(cell === free ? null : picked[i++]);
  return out;
}
