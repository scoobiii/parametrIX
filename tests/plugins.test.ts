import { describe, expect, it } from 'vitest';
import { buildNurbsSurfaceFromParams } from '../src/kernel/nurbs';
import { applyActivePlugins, DEFAULT_PLUGINS } from '../src/kernel/plugins';
import type { CadPlugin, ParametricDesignParams } from '../src/types/cad';

const BASE_PARAMS: ParametricDesignParams = {
  preset: 'shell',
  spanX: 180,
  spanY: 120,
  archHeight: 40,
  waveAmplitude: 8,
  twistDeg: 0,
  thicknessMm: 6,
  uDivisions: 16,
  vDivisions: 16,
  ribCountU: 3,
  ribCountV: 2,
  ribHeightMm: 12,
  attractorStrength: 0,
};

describe('plugins kernel', () => {
  it('skips disabled plugins and clones surface safely', () => {
    const base = buildNurbsSurfaceFromParams(BASE_PARAMS);
    const res = applyActivePlugins(base, DEFAULT_PLUGINS);
    expect(res.logs).toHaveLength(0);
    expect(res.surface).not.toBe(base);
    expect(res.surface.controlPoints[0][0].y).toBe(base.controlPoints[0][0].y);
  });

  it('executes enabled default plugins and logs summary', () => {
    const base = buildNurbsSurfaceFromParams(BASE_PARAMS);
    const enabled = DEFAULT_PLUGINS.map((p) => ({ ...p, enabled: true }));
    const res = applyActivePlugins(base, enabled, { frequency: 2.5, amplitude: 10 });
    expect(res.logs).toHaveLength(3);
    expect(res.logs.every((l) => l.status === 'ok')).toBe(true);
    expect(res.surface.controlPoints[0][0].w).toBe(2.1);
  });

  it('uses fallback summary when plugin returns void or undefined and captures Error & non-Error throws', () => {
    const base = buildNurbsSurfaceFromParams(BASE_PARAMS);
    const custom: CadPlugin[] = [
      {
        id: 'void-plugin',
        name: 'Void',
        author: 'Test',
        version: '1.0',
        category: 'Geometria',
        enabled: true,
        description: 'No return',
        code: 'surface.controlPoints[0][0].y += 1;',
      },
      {
        id: 'err-obj',
        name: 'ErrorObj',
        author: 'Test',
        version: '1.0',
        category: 'Geometria',
        enabled: true,
        description: 'Throws Error',
        code: 'throw new Error("Erro simulado SDK");',
      },
      {
        id: 'err-str',
        name: 'ErrorStr',
        author: 'Test',
        version: '1.0',
        category: 'Geometria',
        enabled: true,
        description: 'Throws string',
        code: 'throw "Falha string crua";',
      },
    ];
    const res = applyActivePlugins(base, custom);
    expect(res.logs[0]).toMatchObject({ status: 'ok', message: 'Executado com sucesso' });
    expect(res.logs[1]).toMatchObject({ status: 'error', message: 'Erro simulado SDK' });
    expect(res.logs[2]).toMatchObject({ status: 'error', message: 'Falha string crua' });
  });
});
