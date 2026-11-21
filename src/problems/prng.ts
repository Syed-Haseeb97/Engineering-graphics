import { createHmac } from 'node:crypto';

/**
 * Deterministic PRNG using the Mulberry32 algorithm.
 * Excellent state space (2^32), uniform distribution, and fast execution.
 */
export class Mulberry32PRNG {
  private state: number;

  constructor(seedHexOrUint32: string | number) {
    if (typeof seedHexOrUint32 === 'string') {
      // Extract first 8 hex characters (32 bits) from cryptographic digest
      this.state = parseInt(seedHexOrUint32.slice(0, 8), 16) >>> 0;
    } else {
      this.state = seedHexOrUint32 >>> 0;
    }
  }

  /**
   * Generate next pseudo-random 32-bit unsigned integer.
   */
  public nextUint32(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /**
   * Return uniform pseudo-random floating point number in [0, 1).
   */
  public nextFloat(): number {
    return this.nextUint32() / 4294967296;
  }

  /**
   * Return pseudo-random integer in [min, max] inclusive.
   */
  public nextInt(min: number, max: number): number {
    if (min >= max) return min;
    const range = max - min + 1;
    return Math.floor(this.nextFloat() * range) + min;
  }

  /**
   * Pick a discrete value on the step grid [min, max] with specified step.
   * Ensures output is an exact multiple of step offset from min without floating point drift.
   */
  public nextStep(min: number, max: number, step: number): number {
    if (min >= max || step <= 0) return min;
    const stepCount = Math.round((max - min) / step);
    const chosenStep = this.nextInt(0, stepCount);
    const val = min + chosenStep * step;

    // Preserve exact decimal precision of step
    const stepStr = step.toString();
    const decimals = stepStr.includes('.') ? stepStr.split('.')[1]?.length ?? 0 : 0;
    return Number(val.toFixed(decimals));
  }
}

/**
 * Derive cryptographic 256-bit seed using HMAC-SHA256.
 *
 * seed = HMAC-SHA256(serverSecret, rollNo + ":" + problemId + ":" + attemptNo)
 *
 * @param serverSecret Secret key obtained exclusively from environment variable.
 * @param rollNo Student roll number / university registration ID.
 * @param problemId Unique identifier of problem template.
 * @param attemptNo Student attempt counter (e.g. 1 for first try).
 * @param reRollCount Optional re-roll counter if previous candidate failed validation.
 */
export function deriveProblemSeed(
  serverSecret: string,
  rollNo: string,
  problemId: string,
  attemptNo: number,
  reRollCount = 0,
): string {
  if (!serverSecret) {
    throw new Error('serverSecret is required for deterministic problem generation.');
  }
  const payload = `${rollNo}:${problemId}:${attemptNo}${reRollCount > 0 ? `:reroll_${reRollCount}` : ''}`;
  return createHmac('sha256', serverSecret).update(payload).digest('hex');
}
