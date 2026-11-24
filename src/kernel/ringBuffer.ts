/**
 * Bounded LMAX-Disruptor-inspired Ring Buffers with power-of-two bitmask indexing (& mask).
 * Zero unbounded array growth: safe for Android/Termux/proot MOBILE_LITE (384 MB heap) and high-rate telemetry.
 */

export interface RingBufferStats {
  capacity: number;
  mask: number;
  size: number;
  totalWrites: number;
  overwrites: number;
  byteLength?: number;
  mean?: number;
  max?: number;
}

function nextPowerOfTwo(n: number): number {
  const safe = Math.max(8, Math.floor(n));
  let p = 8;
  while (p < safe) p <<= 1;
  return p;
}

/**
 * Computes power-of-two ring capacity scaled to available device RAM.
 * Android/Termux MOBILE_LITE (<= 4.5 GB) caps tightly at 64..128 slots.
 */
export function resolveAdaptiveRingCapacity(freeRamGb: number, requestedCap?: number): number {
  let tierCap = 256;
  if (!Number.isFinite(freeRamGb) || freeRamGb <= 2.0) {
    tierCap = 64;
  } else if (freeRamGb <= 4.5) {
    tierCap = 128;
  } else if (freeRamGb > 16.0) {
    tierCap = 512;
  }
  if (typeof requestedCap === 'number' && Number.isFinite(requestedCap) && requestedCap > 0) {
    return nextPowerOfTwo(Math.min(tierCap, Math.max(8, requestedCap)));
  }
  return tierCap;
}

/**
 * Fixed Float64Array telemetry ring buffer using bitmask indexing.
 */
export class NumericTelemetryRingBuffer {
  readonly capacity: number;
  readonly mask: number;
  private readonly buffer: Float64Array;
  private writeCursor = 0;
  private count = 0;
  private overwrites = 0;

  constructor(capacity = 128) {
    this.capacity = nextPowerOfTwo(capacity);
    this.mask = this.capacity - 1;
    this.buffer = new Float64Array(this.capacity);
  }

  push(value: number): void {
    const clean = Number.isFinite(value) ? value : 0;
    const slot = this.writeCursor & this.mask;
    if (this.count === this.capacity) {
      this.overwrites += 1;
    } else {
      this.count += 1;
    }
    this.buffer[slot] = clean;
    this.writeCursor += 1;
  }

  latest(): number | undefined {
    if (this.count === 0) return undefined;
    const slot = (this.writeCursor - 1) & this.mask;
    return this.buffer[slot];
  }

  toArray(newestFirst = false): number[] {
    if (this.count === 0) return [];
    const out: number[] = new Array(this.count);
    const oldestCursor = this.writeCursor - this.count;
    for (let i = 0; i < this.count; i++) {
      const idx = newestFirst ? this.writeCursor - 1 - i : oldestCursor + i;
      out[i] = this.buffer[idx & this.mask];
    }
    return out;
  }

  clear(): void {
    this.buffer.fill(0);
    this.writeCursor = 0;
    this.count = 0;
    this.overwrites = 0;
  }

  stats(): RingBufferStats {
    let sum = 0;
    let max = 0;
    const items = this.toArray(false);
    for (let i = 0; i < items.length; i++) {
      const v = items[i];
      sum += v;
      if (i === 0 || v > max) max = v;
    }
    return {
      capacity: this.capacity,
      mask: this.mask,
      size: this.count,
      totalWrites: this.writeCursor,
      overwrites: this.overwrites,
      byteLength: this.buffer.byteLength,
      mean: this.count > 0 ? Number((sum / this.count).toFixed(3)) : 0,
      max: this.count > 0 ? Number(max.toFixed(3)) : 0,
    };
  }
}

/**
 * Pre-allocated fixed-slot object ring buffer (LMAX Disruptor ring indexing).
 */
export class LmaxRingBuffer<T> {
  readonly capacity: number;
  readonly mask: number;
  private readonly slots: Array<T | undefined>;
  private writeCursor = 0;
  private count = 0;
  private overwrites = 0;

  constructor(capacity = 128) {
    this.capacity = nextPowerOfTwo(capacity);
    this.mask = this.capacity - 1;
    this.slots = new Array<T | undefined>(this.capacity);
  }

  push(item: T): void {
    const slot = this.writeCursor & this.mask;
    if (this.count === this.capacity) {
      this.overwrites += 1;
    } else {
      this.count += 1;
    }
    this.slots[slot] = item;
    this.writeCursor += 1;
  }

  pushUniqueBy(item: T, getId: (entry: T) => string): boolean {
    const targetId = getId(item);
    const oldestCursor = this.writeCursor - this.count;
    for (let i = 0; i < this.count; i++) {
      const existing = this.slots[(oldestCursor + i) & this.mask] as T;
      if (getId(existing) === targetId) {
        return false;
      }
    }
    this.push(item);
    return true;
  }

  toArray(newestFirst = true): T[] {
    if (this.count === 0) return [];
    const out: T[] = new Array<T>(this.count);
    const oldestCursor = this.writeCursor - this.count;
    for (let i = 0; i < this.count; i++) {
      const idx = newestFirst ? this.writeCursor - 1 - i : oldestCursor + i;
      out[i] = this.slots[idx & this.mask] as T;
    }
    return out;
  }

  clear(): void {
    this.slots.fill(undefined);
    this.writeCursor = 0;
    this.count = 0;
    this.overwrites = 0;
  }

  stats(): RingBufferStats {
    return {
      capacity: this.capacity,
      mask: this.mask,
      size: this.count,
      totalWrites: this.writeCursor,
      overwrites: this.overwrites,
    };
  }
}
