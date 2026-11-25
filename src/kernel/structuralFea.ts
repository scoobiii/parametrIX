import type {
  CadFeatureOperation,
  EvaluatedMesh,
  FeaComparisonReport,
  FeaElementStress,
  FeaResult,
  FeaSettings,
  ImportedCadModel,
  MaterialFinish,
  NurbsSurfaceData,
  ParametricDesignParams,
  PartEngineeringProfile,
} from '../types/cad';

export interface StructuralMaterialSpec {
  name: string;
  youngsModulusGpa: number;
  yieldStrengthMpa: number;
  densityGcm3: number;
  poisson: number;
}

export const MATERIAL_MECHANICAL_SPECS: Record<MaterialFinish, StructuralMaterialSpec> = {
  aluminum: {
    name: 'Alumínio Aeroespacial 6061/7075-T6',
    youngsModulusGpa: 71.0,
    yieldStrengthMpa: 310,
    densityGcm3: 2.75,
    poisson: 0.33,
  },
  titanium: {
    name: 'Titânio Ti-6Al-4V Grau 5',
    youngsModulusGpa: 113.8,
    yieldStrengthMpa: 880,
    densityGcm3: 4.43,
    poisson: 0.34,
  },
  'carbon-fiber': {
    name: 'Compósito Fibra de Carbono CFRP',
    youngsModulusGpa: 135.0,
    yieldStrengthMpa: 600,
    densityGcm3: 1.55,
    poisson: 0.28,
  },
  'matte-plastic': {
    name: 'Polímero ABS / PA12 Sinterizado',
    youngsModulusGpa: 2.3,
    yieldStrengthMpa: 42,
    densityGcm3: 1.04,
    poisson: 0.39,
  },
  oak: {
    name: 'Madeira Laminada Estrutural (LVL)',
    youngsModulusGpa: 12.5,
    yieldStrengthMpa: 48,
    densityGcm3: 0.72,
    poisson: 0.35,
  },
  glass: {
    name: 'Vidro Laminado Temperado',
    youngsModulusGpa: 70.0,
    yieldStrengthMpa: 120,
    densityGcm3: 2.5,
    poisson: 0.22,
  },
  clay: {
    name: 'Argila Industrial / Protótipo',
    youngsModulusGpa: 1.4,
    yieldStrengthMpa: 18,
    densityGcm3: 1.8,
    poisson: 0.38,
  },
};

/**
 * Maps normalized stress [0..1] to an engineering FEA thermal RGB colormap:
 * Deep Blue (0.0) -> Cyan (0.25) -> Green (0.50) -> Yellow (0.75) -> Crimson Red (1.0)
 */
export function stressRatioToRgb(ratio: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, ratio));
  if (t < 0.25) {
    const k = t / 0.25;
    return [0.07, 0.25 + k * 0.65, 0.88 + k * 0.1];
  }
  if (t < 0.5) {
    const k = (t - 0.25) / 0.25;
    return [0.07 + k * 0.12, 0.9 - k * 0.04, 0.98 - k * 0.65];
  }
  if (t < 0.75) {
    const k = (t - 0.5) / 0.25;
    return [0.19 + k * 0.78, 0.86 + k * 0.06, 0.33 - k * 0.25];
  }
  const k = (t - 0.75) / 0.25;
  return [0.97, 0.92 - k * 0.78, 0.08 + k * 0.08];
}

/**
 * Computes structural Von Mises stress field, peak deflection, safety factor,
 * certification compliance, and per-part / per-BIM-rib stress distribution.
 */
export function evaluateStructuralFea(
  surface: NurbsSurfaceData,
  meshData: EvaluatedMesh,
  params: ParametricDesignParams,
  materialFinish: MaterialFinish,
  feaSettings: FeaSettings,
  isolationTarget = 'all',
  profile?: PartEngineeringProfile,
  importedModel?: ImportedCadModel | null,
  featureOps: CadFeatureOperation[] = [],
  ganStiffnessFactor = 1.0
): FeaResult {
  const effectiveGanBoost = Math.max(1, ganStiffnessFactor);
  const effectiveFinish = profile?.primaryMaterial ?? materialFinish;
  const spec = MATERIAL_MECHANICAL_SPECS[effectiveFinish] ?? MATERIAL_MECHANICAL_SPECS.aluminum;
  const vertexCount = meshData.vertexCount;
  const stresses = new Float32Array(vertexCount);
  const stressColors = new Float32Array(vertexCount * 3);

  const useImportedBox = Boolean(
    importedModel && (isolationTarget === 'imported' || isolationTarget.startsWith('COMP-') || (importedModel.components?.length ?? 0) > 0)
  );
  const activeBounds = useImportedBox && importedModel ? importedModel.boundingBox : meshData.boundingBox;

  const bboxSize = activeBounds.size;
  const halfX = Math.max(10, bboxSize[0] / 2);
  const halfZ = Math.max(10, bboxSize[2] / 2);
  const thickness = Math.max(
    0.8,
    useImportedBox ? Math.max(params.thicknessMm, Math.min(18, bboxSize[0] * 0.045)) : surface.thicknessMm
  );
  const spanRef = useImportedBox
    ? Math.max(bboxSize[0], bboxSize[1], bboxSize[2])
    : Math.max(params.spanX, params.spanY);

  const effectiveRibCount =
    isolationTarget === 'shell' ? 0 : params.ribCountU + params.ribCountV;
  const ribInertiaFactor =
    1 +
    effectiveRibCount * Math.pow(Math.max(4, params.ribHeightMm) / 14, 1.35) * 0.11;

  const archRatio = Math.abs(params.archHeight) / Math.max(40, spanRef);
  const shellActionDivisor = 1 + archRatio * 2.8;

  const effectiveWidthMm = useImportedBox
    ? Math.max(32, Math.min(bboxSize[0], Math.max(bboxSize[2], 35)))
    : Math.max(25, Math.min(params.spanX, params.spanY));

  const baseBendingMpa =
    ((feaSettings.loadNewtons * spanRef * (useImportedBox ? 0.085 : 0.18)) /
      (effectiveWidthMm * thickness * thickness)) /
    (ribInertiaFactor * shellActionDivisor * Math.pow(effectiveGanBoost, 0.35));

  const minX = meshData.boundingBox.min[0];
  const maxX = meshData.boundingBox.max[0];
  const minZ = meshData.boundingBox.min[2];
  const maxZ = meshData.boundingBox.max[2];
  const mHalfX = Math.max(10, meshData.boundingBox.size[0] / 2);
  const mHalfZ = Math.max(10, meshData.boundingBox.size[2] / 2);

  let maxStress = 0;
  let minStress = Infinity;
  let sumStress = 0;
  let criticalPos: [number, number, number] = [0, 0, 0];

  for (let i = 0; i < vertexCount; i++) {
    const px = meshData.positions[i * 3];
    const py = meshData.positions[i * 3 + 1];
    const pz = meshData.positions[i * 3 + 2];

    const nx = (px - (minX + maxX) * 0.5) / mHalfX;
    const nz = (pz - (minZ + maxZ) * 0.5) / mHalfZ;
    const r = Math.min(1.42, Math.hypot(nx, nz));

    let momentFactor = 1.0;
    if (feaSettings.supportMode === 'edge-clamped') {
      const centerBend = Math.max(0.18, 1 - 0.55 * r * r);
      const rimShear = Math.pow(Math.max(Math.abs(nx), Math.abs(nz)), 3) * 0.68;
      momentFactor = centerBend + rimShear;
    } else if (feaSettings.supportMode === 'four-corner-pins') {
      const cornerProx =
        Math.exp(-Math.pow(1 - Math.abs(nx), 2) * 5) *
        Math.exp(-Math.pow(1 - Math.abs(nz), 2) * 5);
      momentFactor = 0.52 + (1 - 0.35 * r * r) * 0.55 + cornerProx * 1.15;
    } else {
      const distFromRoot = Math.max(0, 1 - (nx + 1) * 0.5);
      momentFactor = 0.22 + Math.pow(distFromRoot, 1.35) * 1.65;
    }

    let loadFactor = 1.0;
    if (feaSettings.loadPattern === 'center-point') {
      loadFactor = 0.45 + 1.35 * Math.exp(-r * r * 3.8);
    } else if (feaSettings.loadPattern === 'torsion-tip') {
      loadFactor = 0.55 + Math.abs(nx * nz) * 1.65 + (Math.abs(params.twistDeg) / 90) * 0.35;
    } else {
      loadFactor = 0.82 + (1 - 0.3 * r) * 0.42;
    }

    const curvRed = meshData.colors[i * 3] ?? 0.2;
    let concentrationKt = 1.0 + curvRed * 0.42;

    if (featureOps.length > 0) {
      for (const op of featureOps) {
        const dx = px - op.point[0];
        const dy = py - op.point[1];
        const dz = pz - op.point[2];
        const dist = Math.hypot(dx, dy, dz);
        const charLen = Math.max(op.diameterMm, op.widthMm, op.lengthMm, 8);
        const influenceR = Math.max(12, charLen * 1.45);
        if (dist < influenceR) {
          const proximity = Math.exp(-Math.pow(dist / (influenceR * 0.52), 2));
          if (op.kind === 'slot-cutout' || op.kind === 'through-hole' || op.kind === 'blender-boolean-mod') {
            concentrationKt += proximity * 0.95;
          } else if (op.kind === 'threaded-bolt') {
            concentrationKt += proximity * 0.32;
          } else if (op.kind === 'rib-boss' || op.kind.startsWith('bim-ifc-')) {
            concentrationKt = Math.max(0.72, concentrationKt - proximity * 0.22);
          }
        }
      }
    }

    const sigma = Math.max(0.25, baseBendingMpa * momentFactor * loadFactor * concentrationKt);
    stresses[i] = sigma;
    sumStress += sigma;

    if (sigma > maxStress) {
      maxStress = sigma;
      criticalPos = [Number(px.toFixed(1)), Number(py.toFixed(1)), Number(pz.toFixed(1))];
    }
    if (sigma < minStress) minStress = sigma;
  }

  // Per-component / per-BIM-element stress distribution
  let elementStresses: FeaElementStress[] = [];
  if (useImportedBox && importedModel?.components && importedModel.components.length > 0) {
    elementStresses = importedModel.components.map((comp, idx) => {
      const compSpec =
        MATERIAL_MECHANICAL_SPECS[comp.inferredMaterial] ?? MATERIAL_MECHANICAL_SPECS.aluminum;
      const isCrownOrBrace = /coroa|crown|ponte|brace|espiga|steerer/i.test(
        `${comp.name} ${comp.subFamily}`
      );
      const isIsolated = isolationTarget === comp.id;
      const ktFactor = isCrownOrBrace ? 1.38 : 0.84 + (idx % 4) * 0.11;
      const compStress = Math.max(
        1.2,
        maxStress * ktFactor * (isIsolated ? 1.12 : 1.0)
      );
      return {
        elementId: comp.id,
        label: comp.name,
        ifcClass: comp.subFamily,
        maxStressMpa: Number(compStress.toFixed(2)),
        utilizationRatio: Number((compStress / compSpec.yieldStrengthMpa).toFixed(3)),
      };
    });
    if (isolationTarget.startsWith('COMP-')) {
      const targetComp = elementStresses.find((e) => e.elementId === isolationTarget);
      if (targetComp) {
        maxStress = targetComp.maxStressMpa;
      }
    }
  } else {
    elementStresses = meshData.bimElements.map((el, idx) => {
      const isIsolatedRib = isolationTarget === el.id;
      const sectionModulus = (el.size[0] * Math.pow(Math.max(4, el.size[1]), 2)) / 6;
      const shareLoad = isIsolatedRib
        ? feaSettings.loadNewtons * 0.72
        : feaSettings.loadNewtons / Math.max(1, meshData.bimElements.length * 0.65);
      const bendingMoment = shareLoad * (el.lengthMm * 0.16);
      const ribStress = Math.max(
        0.5,
        (bendingMoment / Math.max(10, sectionModulus)) * (1 + (idx % 3) * 0.08)
      );
      return {
        elementId: el.id,
        label: el.label,
        ifcClass: el.ifcClass,
        maxStressMpa: Number(ribStress.toFixed(2)),
        utilizationRatio: Number((ribStress / spec.yieldStrengthMpa).toFixed(3)),
      };
    });

    if (isolationTarget.startsWith('BIM-')) {
      const targetRib = elementStresses.find((e) => e.elementId === isolationTarget);
      if (targetRib) {
        maxStress = Math.max(maxStress, targetRib.maxStressMpa);
      }
    }
  }

  const scaleCeiling = Math.max(1, maxStress);
  for (let i = 0; i < vertexCount; i++) {
    const ratio = stresses[i] / scaleCeiling;
    const [r, g, b] = stressRatioToRgb(ratio);
    stressColors[i * 3] = r;
    stressColors[i * 3 + 1] = g;
    stressColors[i * 3 + 2] = b;
  }

  const eMpa = spec.youngsModulusGpa * 1000;
  const shellI = (effectiveWidthMm * Math.pow(thickness, 3)) / 12;
  const featureCutRatio = featureOps.reduce((acc, op) => {
    if (op.kind === 'slot-cutout' || op.kind === 'through-hole' || op.kind === 'blender-boolean-mod') {
      return Math.max(0.55, acc - 0.045);
    }
    if (op.kind === 'rib-boss' || op.kind.startsWith('bim-ifc-')) {
      return Math.min(1.35, acc + 0.06);
    }
    return acc;
  }, 1.0);
  const effI = shellI * ribInertiaFactor * shellActionDivisor * featureCutRatio * effectiveGanBoost;
  const supportCoeff =
    feaSettings.supportMode === 'cantilever-u'
      ? 3
      : feaSettings.supportMode === 'four-corner-pins'
        ? 24
        : 48;
  const maxDeflectionMm = Number(
    Math.min(
      95,
      (feaSettings.loadNewtons * Math.pow(spanRef, 3)) /
        (supportCoeff * eMpa * Math.max(1, effI))
    ).toFixed(3)
  );

  const shellMassKg = (meshData.volumeCm3 * spec.densityGcm3) / 1000;
  const ribsMassKg =
    isolationTarget === 'shell'
      ? 0
      : meshData.bimElements.reduce((acc, el) => acc + el.massKg, 0);

  let importedMassEstKg = 0;
  if (useImportedBox && importedModel) {
    const computeMeshVolCm3 = (pos: Float32Array): number => {
      const ox = pos[0], oy = pos[1], oz = pos[2];
      let signedMm3 = 0;
      for (let t = 0; t + 8 < pos.length; t += 9) {
        const ax = pos[t] - ox, ay = pos[t + 1] - oy, az = pos[t + 2] - oz;
        const bx = pos[t + 3] - ox, by = pos[t + 4] - oy, bz = pos[t + 5] - oz;
        const cx = pos[t + 6] - ox, cy = pos[t + 7] - oy, cz = pos[t + 8] - oz;
        const crossX = by * cz - bz * cy;
        const crossY = bz * cx - bx * cz;
        const crossZ = bx * cy - by * cx;
        signedMm3 += (ax * crossX + ay * crossY + az * crossZ) / 6;
      }
      return Math.abs(signedMm3) / 1000;
    };

    let volCm3 = 0;
    if (importedModel.components && importedModel.components.length > 0) {
      for (const comp of importedModel.components) {
        if (comp.positions && comp.positions.length >= 9) {
          const cv = computeMeshVolCm3(comp.positions);
          volCm3 += cv > 0.01 ? cv : (Math.max(4, comp.size[0]) * Math.max(4, comp.size[1]) * Math.max(4, comp.size[2]) * 0.18) / 1000;
        }
      }
    }
    if (volCm3 <= 0.01 && importedModel.positions.length >= 9) {
      volCm3 = computeMeshVolCm3(importedModel.positions);
    }
    if (volCm3 <= 0.01) {
      const sz = importedModel.boundingBox.size;
      volCm3 = (Math.max(4, sz[0]) * Math.max(4, sz[1]) * Math.max(4, sz[2]) * 0.18) / 1000;
    }
    importedMassEstKg = Math.max(0.02, (volCm3 * spec.densityGcm3) / 1000);
  }
  const totalMassKg = Number(
    Math.max(0.02, useImportedBox ? importedMassEstKg : shellMassKg + ribsMassKg).toFixed(2)
  );

  const safetyFactor = Number(
    Math.min(99, spec.yieldStrengthMpa / Math.max(0.1, maxStress)).toFixed(2)
  );
  const meanStressMpa = Number((sumStress / Math.max(1, vertexCount)).toFixed(2));
  const stiffnessToMass = Number(
    (feaSettings.loadNewtons / Math.max(0.001, maxDeflectionMm * totalMassKg)).toFixed(1)
  );

  const minReqSf = profile?.safetyCriteria.minSafetyFactor ?? feaSettings.targetSafetyFactor;
  const maxDeflLimit = profile?.safetyCriteria.maxDeflectionMm ?? 4.5;
  const primaryNorm = profile?.certifications[0] ?? 'Critério Técnico Ativo';

  const passesCert = safetyFactor >= minReqSf && maxDeflectionMm <= maxDeflLimit;

  const status: FeaResult['status'] = passesCert
    ? 'seguro'
    : safetyFactor >= 1.15
      ? 'alerta'
      : 'critico';

  const complianceNote = passesCert
    ? `Aprovado (${primaryNorm}): SF ${safetyFactor} ≥ ${minReqSf} · δ ${maxDeflectionMm} ≤ ${maxDeflLimit} mm`
    : `Atenção (${primaryNorm}): SF ${safetyFactor} (alvo ≥ ${minReqSf}) · δ ${maxDeflectionMm} mm (máx ${maxDeflLimit} mm)`;

  return {
    materialName: spec.name,
    yieldStrengthMpa: spec.yieldStrengthMpa,
    youngsModulusGpa: spec.youngsModulusGpa,
    loadNewtons: feaSettings.loadNewtons,
    supportMode: feaSettings.supportMode,
    loadPattern: feaSettings.loadPattern,
    isolatedScope: isolationTarget,
    vertexStressesMpa: stresses,
    stressColors,
    maxStressMpa: Number(maxStress.toFixed(2)),
    meanStressMpa,
    minStressMpa: Number((Number.isFinite(minStress) ? minStress : 0).toFixed(2)),
    maxDeflectionMm,
    safetyFactor,
    totalMassKg,
    stiffnessToMass,
    criticalLocationMm: criticalPos,
    elementStresses,
    status,
    complianceNote,
    timestamp: new Date().toLocaleTimeString('pt-BR'),
  };
}

export type OptimizationObjective = 'minimize-stress' | 'minimize-mass' | 'balanced';

/**
 * Generates an improved parametric geometry based on the current structural FEA state,
 * returning the new parameters + concise engineering rationale.
 */
export function synthesizeOptimizedParams(
  current: ParametricDesignParams,
  beforeFea: FeaResult,
  objective: OptimizationObjective,
  targetSafetyFactor: number
): { nextParams: ParametricDesignParams; strategySummary: string } {
  const sfGap = targetSafetyFactor / Math.max(0.2, beforeFea.safetyFactor);
  const next: ParametricDesignParams = { ...current };
  const changes: string[] = [];

  if (objective === 'minimize-stress') {
    const thickGain = sfGap > 1 ? Math.min(8, Math.ceil((sfGap - 1) * 5) + 2) : 2.5;
    next.thicknessMm = Number(Math.min(20, current.thicknessMm + thickGain).toFixed(1));
    next.archHeight = Math.round(Math.min(110, current.archHeight + 16));
    next.ribCountU = Math.min(10, Math.max(current.ribCountU + 2, 6));
    next.ribCountV = Math.min(10, Math.max(current.ribCountV + 2, 5));
    next.ribHeightMm = Math.round(Math.min(36, current.ribHeightMm + 8));
    next.waveAmplitude = Math.round(Math.max(4, current.waveAmplitude * 0.72));
    if (current.preset === 'cavity') next.preset = 'diagrid';
    changes.push(
      `Espessura +${(next.thicknessMm - current.thicknessMm).toFixed(1)}mm`,
      `Flecha do arco -> ${next.archHeight}mm`,
      `Grade BIM ${next.ribCountU}x${next.ribCountV} (h=${next.ribHeightMm}mm)`
    );
  } else if (objective === 'minimize-mass') {
    next.thicknessMm = Number(Math.max(2.0, current.thicknessMm * 0.78).toFixed(1));
    next.archHeight = Math.round(Math.min(105, current.archHeight + 14));
    next.ribHeightMm = Math.round(Math.min(34, current.ribHeightMm + 6));
    next.ribCountU = Math.max(3, Math.min(7, current.ribCountU));
    next.ribCountV = Math.max(3, Math.min(7, current.ribCountV));
    next.preset = 'diagrid';
    changes.push(
      `Alívio de espessura -> ${next.thicknessMm}mm`,
      `Tipologia Diagrid + Arco ${next.archHeight}mm`,
      `Nervuras esbeltas h=${next.ribHeightMm}mm`
    );
  } else {
    const neededThick = beforeFea.safetyFactor < targetSafetyFactor ? 2.0 : 0.8;
    next.thicknessMm = Number(Math.min(18, current.thicknessMm + neededThick).toFixed(1));
    next.archHeight = Math.round(Math.min(105, current.archHeight + 12));
    next.ribCountU = Math.min(9, current.ribCountU + 1);
    next.ribCountV = Math.min(9, current.ribCountV + 1);
    next.ribHeightMm = Math.round(Math.min(32, current.ribHeightMm + 6));
    next.waveAmplitude = Math.round(Math.max(6, current.waveAmplitude * 0.82));
    changes.push(
      `Espessura -> ${next.thicknessMm}mm`,
      `Arco parabólico -> ${next.archHeight}mm`,
      `Costelas BIM ${next.ribCountU}x${next.ribCountV} (h=${next.ribHeightMm}mm)`
    );
  }

  return {
    nextParams: next,
    strategySummary: `Otimização (${objective}): ${changes.join(' · ')}`,
  };
}

export function buildFeaComparisonReport(
  before: FeaResult,
  after: FeaResult,
  beforeParams: ParametricDesignParams,
  afterParams: ParametricDesignParams,
  strategySummary: string,
  profile?: PartEngineeringProfile
): FeaComparisonReport {
  const pct = (b: number, a: number) =>
    b === 0 ? 0 : Number((((a - b) / Math.abs(b)) * 100).toFixed(1));

  const minSf = profile?.safetyCriteria.minSafetyFactor ?? 1.5;
  const maxDefl = profile?.safetyCriteria.maxDeflectionMm ?? 4.5;

  return {
    before,
    after,
    beforeParams,
    afterParams,
    strategySummary,
    stressDeltaPct: pct(before.maxStressMpa, after.maxStressMpa),
    deflectionDeltaPct: pct(before.maxDeflectionMm, after.maxDeflectionMm),
    safetyFactorDeltaPct: pct(before.safetyFactor, after.safetyFactor),
    massDeltaPct: pct(before.totalMassKg, after.totalMassKg),
    certificationPassedBefore: before.safetyFactor >= minSf && before.maxDeflectionMm <= maxDefl,
    certificationPassedAfter: after.safetyFactor >= minSf && after.maxDeflectionMm <= maxDefl,
  };
}
