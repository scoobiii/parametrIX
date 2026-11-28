import { describe, expect, it, vi } from 'vitest';
import { ErpNextAdapter, MedusaAdapter, MetabaseAdapter, TwentyAdapter } from '../packages/adapters/src/open-source-engines';
import { GRABCAD_INDUSTRY_REFERENCES, listGrabCadReferences } from '../src/kernel/libraryCatalog';

const okFetch = (payload: unknown) => vi.fn(async () => new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } }));

describe('open source engine adapters', () => {
  it('keeps external execution evidence distinct from local fixtures', async () => {
    const fetchImpl = okFetch({ data: { name: 'Item-1' } });
    const adapter = new ErpNextAdapter({ baseUrl: 'https://erp.example.test', apiKey: 'key', apiSecret: 'secret', fetchImpl });
    const result = await adapter.syncProduct({ sku: 'PART-001', name: 'Peça', revision: 'A', sourceArea: 'CAD' });
    expect(result.evidence).toMatchObject({ executed: true, claim: 'executed', source: 'external-adapter' });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/api/resource/Item'), expect.objectContaining({ method: 'POST' }));
  });

  it('does not convert external HTTP failure into a mock success', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"exc":"unauthorized"}', { status: 401 }));
    const adapter = new TwentyAdapter({ baseUrl: 'https://crm.example.test', token: 'bad-token', fetchImpl });
    const result = await adapter.health();
    expect(result.result.available).toBe(false);
    expect(result.evidence).toMatchObject({ executed: false, claim: 'not_executed' });
  });

  it('exposes all selected engines with real HTTP request paths', async () => {
    const fetchImpl = okFetch({ ok: true });
    const adapters = [
      new TwentyAdapter({ baseUrl: 'https://twenty.example.test', fetchImpl }),
      new MetabaseAdapter({ baseUrl: 'https://metabase.example.test', apiKey: 'key', fetchImpl }),
      new MedusaAdapter({ baseUrl: 'https://medusa.example.test', token: 'token', fetchImpl }),
    ];
    for (const adapter of adapters) {
      const result = await adapter.health();
      expect(result.evidence.source).toBe('external-adapter');
      expect(result.result.engine).toBe(adapter.id);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('GrabCAD industrial references', () => {
  it('contains only attributed link metadata and no packaged geometry', () => {
    expect(GRABCAD_INDUSTRY_REFERENCES.length).toBeGreaterThanOrEqual(10);
    expect(GRABCAD_INDUSTRY_REFERENCES.every((ref) => ref.source === 'GrabCAD Community Library')).toBe(true);
    expect(GRABCAD_INDUSTRY_REFERENCES.every((ref) => ref.usage === 'link-only-metadata' && ref.downloaded === false)).toBe(true);
    expect(GRABCAD_INDUSTRY_REFERENCES.every((ref) => ref.url.startsWith('https://grabcad.com/'))).toBe(true);
  });

  it('filters references by sector without mutating the registry', () => {
    const aero = listGrabCadReferences('aeroespacial-turbomaquinas');
    expect(aero).toHaveLength(2);
    expect(aero.every((ref) => ref.industry === 'aeroespacial-turbomaquinas')).toBe(true);
    aero[0].title = 'local copy must not affect registry';
    expect(listGrabCadReferences('aeroespacial-turbomaquinas')[0].title).not.toBe(aero[0].title);
  });
});
