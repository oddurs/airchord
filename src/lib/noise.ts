/**
 * Deterministic noise.
 *
 * The instrument does not care whether its reverb tail and its drum hiss are
 * truly random — noise is noise. The measurements care a great deal: an impulse
 * response filled differently on every build makes every number in the audio
 * report wobble, and a check that wobbles by more than the thing it is checking
 * is a check nobody can act on. The same render should produce the same numbers
 * on any machine, or "measure, then change" is not something this project can
 * actually do.
 */

/** mulberry32: small, fast, and good enough to be indistinguishable from noise. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fills a buffer with white noise in −1..1. */
export function fillNoise(data: Float32Array, seed: number): void {
  const random = seeded(seed)
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1
}
