import type { VucExecutionProof } from '../types/cad';

/**
 * Serializes any JSON-compatible value into canonical key-sorted string representation
 * so VUC execution hashes remain 100% deterministic across browser, Node.js, and CI.
 */
export function canonicalSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalSerialize(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalSerialize(record[k])}`).join(',')}}`;
}

/**
 * Computes a deterministic 256-bit (64 hex chars) VUC execution hash from canonical payload.
 * Uses 8 independent 32-bit FNV-1a / Murmur-style avalanche lanes for cross-runtime parity.
 */
export function computeDeterministicVucHash(domain: string, payload: unknown): string {
  const input = `VUC::${domain}::${canonicalSerialize(payload)}`;
  const seeds = [
    0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35,
    0x27d4eb2f, 0x165667b1, 0xd6e8feb8, 0xa5a3564e,
  ];

  const lanes = seeds.map((seed, laneIdx) => {
    let h = seed >>> 0;
    for (let i = 0; i < input.length; i++) {
      const ch = input.charCodeAt(i);
      h ^= (ch + laneIdx * 17 + (i & 0xff)) >>> 0;
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 13;
      h = Math.imul(h, 0x85ebca6b) >>> 0;
    }
    h ^= input.length * (laneIdx + 31);
    h ^= h >>> 16;
    h = Math.imul(h, 0x7feb352d) >>> 0;
    h ^= h >>> 15;
    h = Math.imul(h, 0x846ca68b) >>> 0;
    h ^= h >>> 16;
    return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  });

  return `VUC-${lanes.join('')}`;
}

export function buildVucExecutionProof(
  domain: string,
  summary: string,
  payload: unknown,
  timestampIso?: string
): VucExecutionProof {
  const deterministicSeed = canonicalSerialize(payload).slice(0, 120);
  return {
    vucHash: computeDeterministicVucHash(domain, payload),
    domain,
    summary,
    timestamp: timestampIso ?? new Date().toISOString(),
    deterministicSeed,
  };
}
