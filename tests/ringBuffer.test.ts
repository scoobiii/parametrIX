import { describe, expect, it } from 'vitest';
import {
  LmaxRingBuffer,
  NumericTelemetryRingBuffer,
  resolveAdaptiveRingCapacity,
} from '../src/kernel/ringBuffer';

describe('ringBuffer kernel (LMAX-bounded power-of-two bitmask rings)', () => {
  it('resolves adaptive power-of-two capacity across Android MOBILE_LITE, mid, workstation, and requested overrides', () => {
    expect(resolveAdaptiveRingCapacity(NaN)).toBe(64);
    expect(resolveAdaptiveRingCapacity(1.5)).toBe(64);
    expect(resolveAdaptiveRingCapacity(3.2)).toBe(128);
    expect(resolveAdaptiveRingCapacity(8.0)).toBe(256);
    expect(resolveAdaptiveRingCapacity(32.0)).toBe(512);
    expect(resolveAdaptiveRingCapacity(8.0, 20)).toBe(32);
    expect(resolveAdaptiveRingCapacity(1.2, 512)).toBe(64);
    expect(resolveAdaptiveRingCapacity(8.0, 0)).toBe(256);
  });

  it('tracks Float64Array telemetry with bitmask wrap-around, non-finite clamping, latest, toArray, stats, and clear', () => {
    const empty = new NumericTelemetryRingBuffer();
    expect(empty.capacity).toBe(128);
    expect(empty.mask).toBe(127);
    expect(empty.latest()).toBeUndefined();
    expect(empty.toArray()).toEqual([]);
    expect(empty.stats()).toEqual({
      capacity: 128,
      mask: 127,
      size: 0,
      totalWrites: 0,
      overwrites: 0,
      byteLength: 1024,
      mean: 0,
      max: 0,
    });

    const ring = new NumericTelemetryRingBuffer(4); // clamped to min 8
    expect(ring.capacity).toBe(8);
    for (let i = 1; i <= 10; i++) {
      ring.push(i === 5 ? NaN : i * 10);
    }
    // Buffer holds last 8 values: [30, 40, 0, 60, 70, 80, 90, 100]
    expect(ring.latest()).toBe(100);
    expect(ring.toArray(false)).toEqual([30, 40, 0, 60, 70, 80, 90, 100]);
    expect(ring.toArray(true)).toEqual([100, 90, 80, 70, 60, 0, 40, 30]);

    const st = ring.stats();
    expect(st.size).toBe(8);
    expect(st.totalWrites).toBe(10);
    expect(st.overwrites).toBe(2);
    expect(st.max).toBe(100);
    expect(st.mean).toBe(58.75);

    ring.clear();
    expect(ring.latest()).toBeUndefined();
    expect(ring.stats().size).toBe(0);
  });

  it('tracks fixed-slot LmaxRingBuffer objects with deduplicated pushUniqueBy, wrap-around, and clear', () => {
    const empty = new LmaxRingBuffer<{ id: string }>();
    expect(empty.capacity).toBe(128);
    expect(empty.toArray()).toEqual([]);

    const ring = new LmaxRingBuffer<{ id: string; seq: number }>(8);
    expect(ring.pushUniqueBy({ id: 'a', seq: 1 }, (x) => x.id)).toBe(true);
    expect(ring.pushUniqueBy({ id: 'a', seq: 2 }, (x) => x.id)).toBe(false);
    expect(ring.pushUniqueBy({ id: 'b', seq: 3 }, (x) => x.id)).toBe(true);

    for (let i = 0; i < 10; i++) {
      ring.push({ id: `item-${i}`, seq: i });
    }
    const newestFirst = ring.toArray(true);
    const oldestFirst = ring.toArray(false);
    expect(newestFirst).toHaveLength(8);
    expect(newestFirst[0].id).toBe('item-9');
    expect(oldestFirst[0].id).toBe('item-2');

    const st = ring.stats();
    expect(st).toEqual({
      capacity: 8,
      mask: 7,
      size: 8,
      totalWrites: 12,
      overwrites: 4,
    });

    ring.clear();
    expect(ring.toArray()).toEqual([]);
    expect(ring.stats().size).toBe(0);
  });
});
