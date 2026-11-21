import { describe, expect, it } from 'vitest';
import { exportBinarySTL } from '../src/kernel/cadFormats';
import {
  ALUMINUM_7075_T6_DENSITY_KG_M3,
  SPUR_GEAR_SPEC,
  buildSpurGearDxf,
  buildSpurGearHoles,
  buildSpurGearMesh,
  buildSpurGearModel,
  buildSpurGearProfile,
  computeSpurGearMetrics,
  validateSpurGearSpec,
  type SpurGearSpec,
} from '../src/kernel/spurGear';
import type { EvaluatedMesh } from '../src/types/cad';

const withSpec = (patch: Partial<SpurGearSpec>): SpurGearSpec => ({
  ...SPUR_GEAR_SPEC,
  ...patch,
});

function openEdgeCount(positions: Float32Array): number {
  const keyOf = (vertex: number): string =>
    [
      positions[vertex * 3].toFixed(4),
      positions[vertex * 3 + 1].toFixed(4),
      positions[vertex * 3 + 2].toFixed(4),
    ].join(',');
  const edges = new Map<string, number>();
  for (let index = 0; index < positions.length; index += 9) {
    const keys = [keyOf(index / 3), keyOf(index / 3 + 1), keyOf(index / 3 + 2)];
    for (let edge = 0; edge < 3; edge++) {
      const first = keys[edge];
      const second = keys[(edge + 1) % 3];
      const id = first < second ? `${first}|${second}` : `${second}|${first}`;
      edges.set(id, (edges.get(id) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const count of edges.values()) {
    if (count !== 2) open++;
  }
  return open;
}

describe('spurGear kernel — parametrização e validação', () => {
  it('valida todos os parâmetros de entrada contra valores fisicamente impossíveis', () => {
    expect(() => validateSpurGearSpec(withSpec({ moduleMm: 0 }))).toThrow('moduleMm');
    expect(() => validateSpurGearSpec(withSpec({ teeth: 5 }))).toThrow('teeth');
    expect(() => validateSpurGearSpec(withSpec({ teeth: 24.5 }))).toThrow('teeth');
    expect(() => validateSpurGearSpec(withSpec({ pressureAngleDeg: 5 }))).toThrow(
      'pressureAngleDeg'
    );
    expect(() => validateSpurGearSpec(withSpec({ faceWidthMm: -1 }))).toThrow('faceWidthMm');
    expect(() => validateSpurGearSpec(withSpec({ boreDiameterMm: 0 }))).toThrow('boreDiameterMm');
    expect(() => validateSpurGearSpec(withSpec({ flankSamples: 1 }))).toThrow('flankSamples');
    expect(() => validateSpurGearSpec(withSpec({ densityKgM3: 0 }))).toThrow('densityKgM3');
    expect(() => validateSpurGearSpec(withSpec({ lighteningHoleCount: -1 }))).toThrow(
      'lighteningHoleCount'
    );
  });

  it('rejeita furo grande demais, ponta de dente inexistente e alívios em posição inválida', () => {
    expect(() => validateSpurGearSpec(withSpec({ boreDiameterMm: 50 }))).toThrow(
      'não deixa parede'
    );
    expect(() =>
      validateSpurGearSpec(withSpec({ teeth: 6, pressureAngleDeg: 44, boreDiameterMm: 3 }))
    ).toThrow('ponta de dente inexistente');
    expect(() =>
      validateSpurGearSpec(
        withSpec({ lighteningHoleDiameterMm: 0, lighteningHolePitchRadiusMm: 14 })
      )
    ).toThrow('lighteningHoleDiameterMm');
    expect(() =>
      validateSpurGearSpec(
        withSpec({ lighteningHoleDiameterMm: 8, lighteningHolePitchRadiusMm: 0 })
      )
    ).toThrow('lighteningHolePitchRadiusMm');
    expect(() =>
      validateSpurGearSpec(
        withSpec({ lighteningHoleDiameterMm: 8, lighteningHolePitchRadiusMm: 8 })
      )
    ).toThrow('colidem com o furo central');
    expect(() =>
      validateSpurGearSpec(
        withSpec({ lighteningHoleDiameterMm: 8, lighteningHolePitchRadiusMm: 20 })
      )
    ).toThrow('invadem a raiz');
    expect(() =>
      validateSpurGearSpec(
        withSpec({
          lighteningHoleCount: 12,
          lighteningHoleDiameterMm: 8,
          lighteningHolePitchRadiusMm: 14,
        })
      )
    ).toThrow('adjacentes se sobrepõem');
  });

  it('aceita uma engrenagem sem alívios e outra com 6 alívios', () => {
    expect(() => validateSpurGearSpec(withSpec({ lighteningHoleCount: 0 }))).not.toThrow();
    expect(() =>
      validateSpurGearSpec(
        withSpec({
          teeth: 30,
          lighteningHoleCount: 6,
          lighteningHoleDiameterMm: 6,
          lighteningHolePitchRadiusMm: 16,
        })
      )
    ).not.toThrow();
  });
});

describe('spurGear kernel — geometria normalizada (ISO 53 / ISO 21771)', () => {
  it('deriva diâmetros, passo, espessura e massa do módulo e do número de dentes', () => {
    const m = computeSpurGearMetrics();
    expect(m.pitchDiameterMm).toBe(48);
    expect(m.tipDiameterMm).toBe(52);
    expect(m.rootDiameterMm).toBe(43);
    expect(m.baseDiameterMm).toBeCloseTo(45.1052457977, 9);
    expect(m.addendumMm).toBe(2);
    expect(m.dedendumMm).toBe(2.5);
    expect(m.circularPitchMm).toBeCloseTo(Math.PI * 2, 12);
    expect(m.toothThicknessAtPitchMm).toBeCloseTo(Math.PI, 12);
    expect(m.tipToothThicknessMm).toBeCloseTo(1.431100867, 6);
    expect(m.faceWidthMm).toBe(12);
    expect(m.faceAreaMm2).toBeCloseTo(1462.9970606, 4);
    expect(m.volumeMm3).toBeCloseTo(17555.9647274, 3);
    expect(m.densityKgM3).toBe(ALUMINUM_7075_T6_DENSITY_KG_M3);
    expect(m.massKg).toBeCloseTo(0.04933226088, 9);
    expect(m.surfaceAreaMm2).toBeGreaterThan(0);
  });

  it('gera contorno fechado com 24 dentes, raiz Ø43 e topo Ø52', () => {
    const profile = buildSpurGearProfile();
    expect(profile.length % SPUR_GEAR_SPEC.teeth).toBe(0);

    let minRadius = Number.POSITIVE_INFINITY;
    let maxRadius = 0;
    let toothRuns = 0;
    let insideTooth = false;
    const midRadius = (52 + 43) / 4;
    for (const [x, y] of profile) {
      const radius = Math.hypot(x, y);
      minRadius = Math.min(minRadius, radius);
      maxRadius = Math.max(maxRadius, radius);
      if (radius > midRadius) {
        if (!insideTooth) toothRuns++;
        insideTooth = true;
      } else {
        insideTooth = false;
      }
    }
    expect(minRadius).toBeCloseTo(21.5, 6);
    expect(maxRadius).toBeCloseTo(26, 6);
    expect(toothRuns).toBe(24);

    let signedArea = 0;
    for (let index = 0; index < profile.length; index++) {
      const [x0, y0] = profile[index];
      const [x1, y1] = profile[(index + 1) % profile.length];
      signedArea += x0 * y1 - x1 * y0;
    }
    expect(signedArea / 2).toBeGreaterThan(0);
  });

  it('posiciona furo central e alívios com folga verificada', () => {
    const holes = buildSpurGearHoles();
    expect(holes).toHaveLength(5);
    expect(holes[0].kind).toBe('bore');
    expect(holes[0].radiusMm).toBe(6);
    expect(holes.filter((hole) => hole.kind === 'lightening')).toHaveLength(4);
    for (const hole of holes.slice(1)) {
      const radius = Math.hypot(hole.center[0], hole.center[1]);
      expect(radius).toBeCloseTo(14, 12);
      expect(hole.radiusMm).toBe(4);
    }
    expect(buildSpurGearHoles(withSpec({ lighteningHoleCount: 0 }))).toHaveLength(1);
  });
});

describe('spurGear kernel — malha sólida e modelo CAD', () => {
  it('gera malha fechada, com volume positivo e normais unitárias', () => {
    const mesh = buildSpurGearMesh();
    expect(mesh.triangleCount).toBeGreaterThan(4000);
    expect(mesh.positions.length).toBe(mesh.triangleCount * 9);
    expect(mesh.indices.length).toBe(mesh.triangleCount * 3);
    expect(mesh.volumeMm3).toBeCloseTo(mesh.metrics.volumeMm3, 2);
    expect(mesh.surfaceAreaMm2).toBeCloseTo(mesh.metrics.surfaceAreaMm2, 1);
    expect(mesh.volumeMm3).toBeGreaterThan(17000);
    expect(openEdgeCount(mesh.positions)).toBe(0);

    for (let index = 0; index < mesh.normals.length; index += 3) {
      expect(
        Math.hypot(mesh.normals[index], mesh.normals[index + 1], mesh.normals[index + 2])
      ).toBeCloseTo(1, 6);
    }

    const bounds = buildSpurGearModel().boundingBox;
    expect(bounds.size[1]).toBe(12);
    expect(bounds.size[0]).toBeGreaterThan(51.9);
    expect(bounds.size[0]).toBeLessThanOrEqual(52.01);
    expect(bounds.size[2]).toBeGreaterThan(51.9);
  });

  it('gera malha com 6 alívios e sem alívios', () => {
    const six = buildSpurGearMesh(
      withSpec({
        teeth: 30,
        lighteningHoleCount: 6,
        lighteningHoleDiameterMm: 6,
        lighteningHolePitchRadiusMm: 16,
      })
    );
    expect(six.holes).toHaveLength(7);
    expect(openEdgeCount(six.positions)).toBe(0);

    const none = buildSpurGearMesh(withSpec({ lighteningHoleCount: 0 }));
    expect(none.holes).toHaveLength(1);
    expect(openEdgeCount(none.positions)).toBe(0);
    expect(none.metrics.volumeMm3).toBeGreaterThan(0);
  });

  it('monta modelo importável com perfil de engenharia e metadados medidos', () => {
    const model = buildSpurGearModel();
    expect(model.id).toBe('imp-gear-m2-z24');
    expect(model.format).toBe('STL');
    expect(model.triangleCount).toBeGreaterThan(4000);
    expect(model.components).toHaveLength(1);
    expect(model.components?.[0].name).toContain('Engrenagem');
    expect(model.components?.[0].triangleCount).toBe(model.triangleCount);
    expect(model.detectedProfile?.partName).toContain('M2 Z24');
    expect(model.detectedProfile?.specifications).toContain(
      'Diâmetro externo da = 52,000 mm'
    );
    expect(model.detectedProfile?.specifications.join(' ')).toContain('Massa estimada');
    expect(model.notes).toContain('malha fechada');
    expect(model.layers).toEqual(['CORPO_ENGRENAGEM']);
  });

  it('exporta DXF 2D com contorno e furos nas camadas corretas', () => {
    const dxf = buildSpurGearDxf();
    expect(dxf).toContain('LWPOLYLINE');
    expect(dxf).toContain('CONTORNO');
    expect(dxf).toContain('FURO_CENTRAL');
    expect(dxf.match(/ALIVIO/g)).toHaveLength(4);
    expect(dxf).toContain('$INSUNITS');
    expect(dxf.trim().endsWith('EOF')).toBe(true);
    expect(buildSpurGearDxf(withSpec({ lighteningHoleCount: 0 }))).not.toContain('ALIVIO');
  });

  it('exporta STL binário estanque com orientação de volume positiva', async () => {
    const mesh = buildSpurGearMesh();
    const model = buildSpurGearModel();
    const evaluated: EvaluatedMesh = {
      positions: mesh.positions,
      normals: mesh.normals,
      uvs: new Float32Array(0),
      colors: new Float32Array(0),
      indices: mesh.indices,
      triangleCount: mesh.triangleCount,
      vertexCount: mesh.positions.length / 3,
      isocurves: [],
      bimElements: [],
      boundingBox: model.boundingBox,
      surfaceAreaCm2: mesh.surfaceAreaMm2 / 100,
      volumeCm3: mesh.volumeMm3 / 1000,
    };
    const blob = exportBinarySTL(evaluated, 'Engrenagem_M2_Z24');
    expect(blob.size).toBe(84 + mesh.triangleCount * 50);
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);
    expect(view.getUint32(80, true)).toBe(mesh.triangleCount);
    const header = new TextDecoder().decode(new Uint8Array(buffer, 0, 24));
    expect(header).toContain('Parametrix');

    let stlVolume = 0;
    for (let triangle = 0; triangle < mesh.triangleCount; triangle++) {
      const base = 84 + triangle * 50 + 12;
      const ax = view.getFloat32(base, true);
      const ay = view.getFloat32(base + 4, true);
      const az = view.getFloat32(base + 8, true);
      const bx = view.getFloat32(base + 12, true);
      const by = view.getFloat32(base + 16, true);
      const bz = view.getFloat32(base + 20, true);
      const cx = view.getFloat32(base + 24, true);
      const cy = view.getFloat32(base + 28, true);
      const cz = view.getFloat32(base + 32, true);
      stlVolume +=
        (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    }
    expect(stlVolume).toBeCloseTo(mesh.volumeMm3, 0);
  });
});
