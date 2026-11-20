import type {
  AdditiveCamSummary,
  AdditiveManufacturingSettings,
  AdditiveProcessKind,
  AdditiveSinteringAtmosphere,
  AdditiveSupportPattern,
  CamSettings,
  CamTool,
  EvaluatedMesh,
  ManualOperationStep,
  NurbsSurfaceData,
  RobotJointState,
  ToolpathPoint,
  ToolpathResult,
} from '../types/cad';
import { evaluateNurbsPointAndNormal } from './nurbs';

export const CAM_TOOLS: CamTool[] = [
  {
    id: 'tool-ball-8',
    name: 'Fresa Esférica Ø8mm Metal Duro',
    type: 'ball',
    diameterMm: 8,
    flutes: 4,
    lengthMm: 65,
    material: 'Alumínio / Ligas Leves / Resina',
    recommendedVc: 180,
    recommendedFz: 0.045,
  },
  {
    id: 'tool-flat-10',
    name: 'Fresa Topo Plano Ø10mm 4 Cortes',
    type: 'flat',
    diameterMm: 10,
    flutes: 4,
    lengthMm: 75,
    material: 'Alumínio 6061 / Aço Macio',
    recommendedVc: 150,
    recommendedFz: 0.055,
  },
  {
    id: 'tool-flat-12',
    name: 'Fresa Topo Plano Ø12mm 4 Cortes',
    type: 'flat',
    diameterMm: 12,
    flutes: 4,
    lengthMm: 80,
    material: 'Alumínio 6061 / Aço 1045',
    recommendedVc: 145,
    recommendedFz: 0.06,
  },
  {
    id: 'tool-bull-12',
    name: 'Fresa Toroidal Ø12mm R1.5',
    type: 'bull',
    diameterMm: 12,
    flutes: 4,
    lengthMm: 80,
    material: 'Aço Matriz / Titânio',
    recommendedVc: 110,
    recommendedFz: 0.04,
    cornerRadiusMm: 1.5,
  },
  {
    id: 'tool-ball-4',
    name: 'Micro-Fresa Esférica Ø4mm Acabamento',
    type: 'ball',
    diameterMm: 4,
    flutes: 2,
    lengthMm: 50,
    material: 'Detalhes NURBS Alta Precisão',
    recommendedVc: 200,
    recommendedFz: 0.025,
  },
  {
    id: 'tool-robot-spindle',
    name: 'Eletromandril Robótico HSD 4.5kW Ø16mm',
    type: 'spindle-robot',
    diameterMm: 16,
    flutes: 3,
    lengthMm: 110,
    material: 'Madeira Lamelada / Compósitos / Espuma',
    recommendedVc: 240,
    recommendedFz: 0.08,
  },
];

const ATMOSPHERE_LABELS: Record<AdditiveSinteringAtmosphere, string> = {
  argon: 'Argônio Inerte (Ar 99.999%)',
  nitrogen: 'Nitrogênio (N₂ Técnico)',
  vacuum: 'Alto Vácuo (<10⁻³ mbar)',
  'uv-chamber': 'Câmara UV 405nm + Convecção',
};

const SUPPORT_PATTERN_FACTORS: Record<AdditiveSupportPattern, number> = {
  none: 0,
  'tree-branch': 0.55,
  'lattice-grid': 0.85,
  'linear-fin': 1.0,
};

export function getDefaultAdditiveSettings(
  processKind: AdditiveProcessKind
): AdditiveManufacturingSettings {
  if (processKind === 'resin-sla') {
    return {
      layerThicknessUm: 25,
      supportPattern: 'tree-branch',
      supportDensityPct: 16,
      overhangAngleDeg: 42,
      sinterLaserPowerW: 0.35,
      sinterScanSpeedMmS: 1800,
      sinterTempC: 60,
      sinterHoldMinutes: 35,
      atmosphere: 'uv-chamber',
      hatchSpacingMm: 0.08,
    };
  }
  return {
    layerThicknessUm: 30,
    supportPattern: 'lattice-grid',
    supportDensityPct: 22,
    overhangAngleDeg: 45,
    sinterLaserPowerW: 400,
    sinterScanSpeedMmS: 950,
    sinterTempC: 1150,
    sinterHoldMinutes: 90,
    atmosphere: 'argon',
    hatchSpacingMm: 0.11,
  };
}

export function resolveAdditiveSettings(settings: CamSettings): AdditiveManufacturingSettings {
  const kind: AdditiveProcessKind =
    settings.machineType === 'resin-sla' ? 'resin-sla' : 'powder-metal';
  const merged: AdditiveManufacturingSettings = {
    ...getDefaultAdditiveSettings(kind),
    ...(settings.additiveConfig ?? {}),
  };
  return {
    layerThicknessUm: Math.max(10, Math.min(150, merged.layerThicknessUm)),
    supportPattern: merged.supportPattern,
    supportDensityPct: Math.max(0, Math.min(60, merged.supportDensityPct)),
    overhangAngleDeg: Math.max(15, Math.min(75, merged.overhangAngleDeg)),
    sinterLaserPowerW: Math.max(0.05, Math.min(1200, merged.sinterLaserPowerW)),
    sinterScanSpeedMmS: Math.max(100, Math.min(5000, merged.sinterScanSpeedMmS)),
    sinterTempC: Math.max(25, Math.min(1500, merged.sinterTempC)),
    sinterHoldMinutes: Math.max(5, Math.min(360, merged.sinterHoldMinutes)),
    atmosphere: merged.atmosphere,
    hatchSpacingMm: Math.max(0.03, Math.min(0.4, merged.hatchSpacingMm)),
  };
}

export function computeAdditiveSummary(
  mesh: EvaluatedMesh,
  cuttingLengthMm: number,
  settings: CamSettings,
  processKind: AdditiveProcessKind
): AdditiveCamSummary {
  const cfg = resolveAdditiveSettings(settings);
  const bbox = mesh.boundingBox;
  const heightMm = Math.max(4, bbox.size[1]);
  const layerCount = Math.max(10, Math.round((heightMm * 1000) / cfg.layerThicknessUm));

  // Estimate overhang area fraction from mesh surface normals (downward faces exceeding overhang angle)
  const cosThreshold = -Math.cos((cfg.overhangAngleDeg * Math.PI) / 180);
  let overhangVerts = 0;
  const totalNormals = Math.floor(mesh.normals.length / 3);
  for (let i = 0; i < totalNormals; i++) {
    if (mesh.normals[i * 3 + 1] < cosThreshold) {
      overhangVerts++;
    }
  }
  const rawOverhangPct = totalNormals > 0 ? (overhangVerts / totalNormals) * 100 : 0;
  const overhangAreaRatioPct = Number(Math.max(12, Math.min(85, rawOverhangPct)).toFixed(1));

  const partVolumeCm3 = Number(Math.max(4, mesh.volumeCm3).toFixed(2));
  const envelopeCm3 = Math.max(
    10,
    (bbox.size[0] * bbox.size[1] * bbox.size[2]) / 1000
  );
  const patternFactor = SUPPORT_PATTERN_FACTORS[cfg.supportPattern];
  const supportVolumeCm3 = Number(
    (
      envelopeCm3 *
      (overhangAreaRatioPct / 100) *
      0.32 *
      (cfg.supportDensityPct / 100) *
      patternFactor
    ).toFixed(2)
  );
  const densityGcm3 = processKind === 'powder-metal' ? 4.43 : 1.15;
  const supportMassGrams = Number((supportVolumeCm3 * densityGcm3).toFixed(1));

  // Volumetric Energy Density: VED = P / (v * h * t) in J/mm^3
  const layerMm = cfg.layerThicknessUm / 1000;
  const energyDensityJMm3 = Number(
    (
      cfg.sinterLaserPowerW /
      Math.max(0.001, cfg.sinterScanSpeedMmS * cfg.hatchSpacingMm * layerMm)
    ).toFixed(2)
  );

  // Build time combines laser/UV scan vector time + per-layer recoater/peel time
  const scanPathPerLayerMm = Math.max(45, (cuttingLengthMm * 0.25) / Math.max(1, cfg.hatchSpacingMm * 10));
  const recoaterSecPerLayer = processKind === 'powder-metal' ? 3.2 : 1.8;
  const totalScanSeconds = (layerCount * scanPathPerLayerMm) / cfg.sinterScanSpeedMmS;
  const buildMinutes = Number(
    ((totalScanSeconds + layerCount * recoaterSecPerLayer) / 60).toFixed(2)
  );

  const thermalRampMinutes =
    processKind === 'powder-metal' ? cfg.sinterTempC / 28 : cfg.sinterTempC / 10;
  const sinteringOrPostCureMinutes = Number(
    (cfg.sinterHoldMinutes + thermalRampMinutes).toFixed(1)
  );
  const totalCycleMinutes = Number((buildMinutes + sinteringOrPostCureMinutes).toFixed(1));

  return {
    processKind,
    layerCount,
    layerThicknessUm: cfg.layerThicknessUm,
    partVolumeCm3,
    supportVolumeCm3,
    supportMassGrams,
    overhangAreaRatioPct,
    energyDensityJMm3,
    buildMinutes,
    sinteringOrPostCureMinutes,
    totalCycleMinutes,
    sinteringTempC: cfg.sinterTempC,
    atmosphereLabel: ATMOSPHERE_LABELS[cfg.atmosphere],
  };
}

export function computeCuttingParameters(tool: CamTool, speedMultiplier: number) {
  const rawRpm = (1000 * tool.recommendedVc) / (Math.PI * tool.diameterMm);
  const spindleRpm = Math.round(Math.min(24000, Math.max(1200, rawRpm)) / 50) * 50;
  const feedRateMmMin = Math.round(
    spindleRpm * tool.flutes * tool.recommendedFz * speedMultiplier
  );
  return { spindleRpm, feedRateMmMin };
}

/**
 * Generates real 3D/5-Axis/6-Axis & Additive CAM Toolpaths directly from the evaluated NURBS surface.
 * Output coordinates are in CNC/Robot frame: X = worldX, Y = -worldZ, Z = worldY_up
 */
export function generateCamToolpath(
  surface: NurbsSurfaceData,
  mesh: EvaluatedMesh,
  settings: CamSettings
): ToolpathResult {
  const tool = CAM_TOOLS.find((t) => t.id === settings.toolId) ?? CAM_TOOLS[0];
  const isAdditive =
    settings.machineType === 'powder-metal' || settings.machineType === 'resin-sla';
  const additiveKind: AdditiveProcessKind =
    settings.machineType === 'resin-sla' ? 'resin-sla' : 'powder-metal';
  const additiveCfg = isAdditive ? resolveAdditiveSettings(settings) : null;

  const baseCutting = computeCuttingParameters(tool, settings.cutSpeedMultiplier);
  const spindleRpm = isAdditive ? 0 : baseCutting.spindleRpm;
  const feedRateMmMin = additiveCfg
    ? Math.round(Math.min(120000, Math.max(600, additiveCfg.sinterScanSpeedMmS * 60)))
    : baseCutting.feedRateMmMin;

  const bbox = mesh.boundingBox;
  const safeZ = bbox.max[1] + settings.safeZMm;
  const points: ToolpathPoint[] = [];
  const stepoverMm = additiveCfg
    ? Math.max(1.5, additiveCfg.hatchSpacingMm * 40)
    : Math.max(2, (tool.diameterMm * settings.stepoverPct) / 100);

  const pushPt = (
    wx: number,
    wyUp: number,
    wz: number,
    nx: number,
    nyUp: number,
    nz: number,
    rapid: boolean
  ) => {
    points.push({
      x: Number(wx.toFixed(3)),
      y: Number((-wz).toFixed(3)),
      z: Number(wyUp.toFixed(3)),
      nx: Number(nx.toFixed(4)),
      ny: Number((-nz).toFixed(4)),
      nz: Number(nyUp.toFixed(4)),
      rapid,
      feedMmMin: rapid ? 6000 : feedRateMmMin,
      lineNumber: points.length + 1,
    });
  };

  const isMultiAxis =
    settings.machineType === 'cnc-5axis' ||
    settings.machineType === 'robot-6axis' ||
    settings.machineType === 'robot-weld';

  if (settings.strategy === 'isoparm' || settings.strategy === 'raster') {
    const spanApprox = Math.max(40, bbox.size[2]);
    const passCount = Math.max(5, Math.min(24, Math.round(spanApprox / stepoverMm)));
    const uSamples = settings.strategy === 'isoparm' ? 28 : 24;

    for (let p = 0; p < passCount; p++) {
      const v = p / (passCount - 1);
      const reverse = p % 2 === 1;

      // Rapid move above start of pass
      const uStart = reverse ? 1 : 0;
      const startEval = evaluateNurbsPointAndNormal(surface, uStart, v);
      const startNorm = isMultiAxis ? startEval.normal : ([0, 1, 0] as [number, number, number]);

      pushPt(
        startEval.point[0],
        safeZ,
        startEval.point[2],
        startNorm[0],
        startNorm[1],
        startNorm[2],
        true
      );

      for (let s = 0; s <= uSamples; s++) {
        const u = reverse ? 1 - s / uSamples : s / uSamples;
        const { point, normal } = evaluateNurbsPointAndNormal(surface, u, v);
        const effNorm: [number, number, number] = isMultiAxis ? normal : [0, 1, 0];

        // Offset tip by stock margin along normal (or Z for 3-axis)
        const px = point[0] + effNorm[0] * settings.stockMarginMm;
        const py = point[1] + effNorm[1] * settings.stockMarginMm;
        const pz = point[2] + effNorm[2] * settings.stockMarginMm;

        pushPt(px, py, pz, effNorm[0], effNorm[1], effNorm[2], false);
      }

      // Retract at end of pass
      const uEnd = reverse ? 0 : 1;
      const endEval = evaluateNurbsPointAndNormal(surface, uEnd, v);
      const endNorm = isMultiAxis ? endEval.normal : ([0, 1, 0] as [number, number, number]);
      pushPt(
        endEval.point[0],
        safeZ,
        endEval.point[2],
        endNorm[0],
        endNorm[1],
        endNorm[2],
        true
      );
    }
  } else {
    // Contour perimeter + concentric offsets
    const loops = Math.max(3, Math.min(8, Math.round(45 / stepoverMm)));
    const perimSteps = 32;
    for (let loop = 0; loop < loops; loop++) {
      const inset = (loop / loops) * 0.42;
      const minU = inset;
      const maxU = 1 - inset;
      const minV = inset;
      const maxV = 1 - inset;

      const loopUVs: [number, number][] = [];
      for (let i = 0; i < perimSteps; i++) {
        loopUVs.push([minU + (i / perimSteps) * (maxU - minU), minV]);
      }
      for (let i = 0; i < perimSteps; i++) {
        loopUVs.push([maxU, minV + (i / perimSteps) * (maxV - minV)]);
      }
      for (let i = 0; i < perimSteps; i++) {
        loopUVs.push([maxU - (i / perimSteps) * (maxU - minU), maxV]);
      }
      for (let i = 0; i <= perimSteps; i++) {
        loopUVs.push([minU, maxV - (i / perimSteps) * (maxV - minV)]);
      }

      const firstEval = evaluateNurbsPointAndNormal(surface, loopUVs[0][0], loopUVs[0][1]);
      pushPt(firstEval.point[0], safeZ, firstEval.point[2], 0, 1, 0, true);

      for (const [u, v] of loopUVs) {
        const { point, normal } = evaluateNurbsPointAndNormal(surface, u, v);
        const effNorm: [number, number, number] = isMultiAxis ? normal : [0, 1, 0];
        pushPt(
          point[0] + effNorm[0] * settings.stockMarginMm,
          point[1] + effNorm[1] * settings.stockMarginMm,
          point[2] + effNorm[2] * settings.stockMarginMm,
          effNorm[0],
          effNorm[1],
          effNorm[2],
          false
        );
      }

      const lastEval = evaluateNurbsPointAndNormal(surface, loopUVs[0][0], loopUVs[0][1]);
      pushPt(lastEval.point[0], safeZ, lastEval.point[2], 0, 1, 0, true);
    }
  }

  // Additive Support Base Anchors (integrated into CAM path when support pattern !== 'none')
  if (additiveCfg && additiveCfg.supportPattern !== 'none' && additiveCfg.supportDensityPct > 0) {
    const anchorCols = Math.max(2, Math.min(6, Math.round(additiveCfg.supportDensityPct / 8)));
    const baseZ = bbox.min[1];
    for (let c = 0; c < anchorCols; c++) {
      const u = (c + 0.5) / anchorCols;
      const e0 = evaluateNurbsPointAndNormal(surface, u, 0.25);
      const e1 = evaluateNurbsPointAndNormal(surface, u, 0.75);
      pushPt(e0.point[0], baseZ, e0.point[2], 0, 1, 0, true);
      pushPt(e0.point[0], e0.point[1], e0.point[2], 0, 1, 0, false);
      pushPt(e1.point[0], e1.point[1], e1.point[2], 0, 1, 0, false);
      pushPt(e1.point[0], baseZ, e1.point[2], 0, 1, 0, false);
    }
  }

  // Compute cutting/rapid distances
  let cuttingLengthMm = 0;
  let rapidLengthMm = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (b.rapid) rapidLengthMm += dist;
    else cuttingLengthMm += dist;
  }

  const additiveSummary = isAdditive
    ? computeAdditiveSummary(mesh, cuttingLengthMm, settings, additiveKind)
    : undefined;

  const estimatedMinutes = additiveSummary
    ? additiveSummary.totalCycleMinutes
    : cuttingLengthMm / Math.max(100, feedRateMmMin) + rapidLengthMm / 6000;
  const removedVolumeCm3 = additiveSummary
    ? Number((additiveSummary.partVolumeCm3 + additiveSummary.supportVolumeCm3).toFixed(1))
    : Number(((cuttingLengthMm * tool.diameterMm * settings.stepdownMm) / 1000).toFixed(1));

  const manualSteps = buildManualProcessSheet(
    surface,
    mesh,
    tool,
    spindleRpm,
    feedRateMmMin,
    settings,
    additiveCfg,
    additiveSummary
  );
  const postCode = generatePostProcessorCode(
    points,
    tool,
    spindleRpm,
    feedRateMmMin,
    settings,
    manualSteps,
    additiveCfg,
    additiveSummary
  );

  return {
    points,
    cuttingLengthMm: Number(cuttingLengthMm.toFixed(1)),
    rapidLengthMm: Number(rapidLengthMm.toFixed(1)),
    estimatedMinutes: Number(estimatedMinutes.toFixed(2)),
    spindleRpm,
    feedRateMmMin,
    removedVolumeCm3,
    postCode,
    manualSteps,
    additiveSummary,
  };
}

function buildManualProcessSheet(
  surface: NurbsSurfaceData,
  mesh: EvaluatedMesh,
  tool: CamTool,
  rpm: number,
  feed: number,
  settings: CamSettings,
  additiveCfg: AdditiveManufacturingSettings | null,
  additiveSummary?: AdditiveCamSummary
): ManualOperationStep[] {
  const b = mesh.boundingBox;
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = -(b.min[2] + b.max[2]) / 2;
  const zTop = b.max[1];
  const zMin = b.min[1];

  if (additiveCfg && additiveSummary) {
    const isSlm = additiveSummary.processKind === 'powder-metal';
    return [
      {
        step: 1,
        operation: isSlm
          ? 'Preparação da Mesa & Câmara Inerte LPBF'
          : 'Calibração da Cuba Fotopolimérica SLA 405nm',
        toolName: isSlm ? 'Recoater Lâmina Cerâmica' : 'Plataforma Z + Wiper Óptico',
        rpm: 0,
        feedMmMin: feed,
        targetX: Number(cx.toFixed(2)),
        targetY: Number(cy.toFixed(2)),
        targetZ: Number(zMin.toFixed(2)),
        depthAp: Number((additiveCfg.layerThicknessUm / 1000).toFixed(3)),
        notes: `Camada ${additiveCfg.layerThicknessUm} µm (${additiveSummary.layerCount} camadas) · Atmosfera: ${additiveSummary.atmosphereLabel}.`,
      },
      {
        step: 2,
        operation: `Geração de Suportes (${additiveCfg.supportPattern})`,
        toolName: isSlm ? 'Laser Fibra Yb Contorno Baixo' : 'Galvo UV Árvore / Âncora',
        rpm: 0,
        feedMmMin: feed,
        targetX: Number(b.min[0].toFixed(2)),
        targetY: Number((-b.max[2]).toFixed(2)),
        targetZ: Number(zMin.toFixed(2)),
        depthAp: Number((additiveCfg.layerThicknessUm / 1000).toFixed(3)),
        notes: `Densidade ${additiveCfg.supportDensityPct}% · Ângulo crítico ${additiveCfg.overhangAngleDeg}° · Volume suporte ${additiveSummary.supportVolumeCm3} cm³ (${additiveSummary.supportMassGrams} g).`,
      },
      {
        step: 3,
        operation: isSlm
          ? `Fusão Seletiva / Sinterização (${surface.name})`
          : `Fotopolimerização UV SLA (${surface.name})`,
        toolName: isSlm
          ? `Laser ${additiveCfg.sinterLaserPowerW}W`
          : `Laser UV ${additiveCfg.sinterLaserPowerW}W`,
        rpm: 0,
        feedMmMin: feed,
        targetX: Number(b.max[0].toFixed(2)),
        targetY: Number((-b.min[2]).toFixed(2)),
        targetZ: Number(zTop.toFixed(2)),
        depthAp: Number(additiveCfg.hatchSpacingMm.toFixed(2)),
        notes: `Hachura ${additiveCfg.hatchSpacingMm} mm · Varredura ${additiveCfg.sinterScanSpeedMmS} mm/s · VED ${additiveSummary.energyDensityJMm3} J/mm³.`,
      },
      {
        step: 4,
        operation: isSlm
          ? 'Ciclo de Sinterização & Alívio Térmico em Forno'
          : 'Lavagem IPA & Pós-Cura Térmica/UV',
        toolName: isSlm ? 'Forno Sinterização Controlado' : 'Estufa UV + Térmica',
        rpm: 0,
        feedMmMin: 0,
        targetX: Number(cx.toFixed(2)),
        targetY: Number(cy.toFixed(2)),
        targetZ: Number(zTop.toFixed(2)),
        depthAp: 0,
        notes: `${additiveCfg.sinterTempC} °C por ${additiveCfg.sinterHoldMinutes} min · Ciclo térmico total ${additiveSummary.sinteringOrPostCureMinutes} min.`,
      },
    ];
  }

  return [
    {
      step: 1,
      operation: 'Zeramento G54 & Fixação em Morsa',
      toolName: 'Apalpador Ø10mm / Relógio Comparador',
      rpm: 0,
      feedMmMin: 0,
      targetX: Number(cx.toFixed(2)),
      targetY: Number(cy.toFixed(2)),
      targetZ: Number((zTop + 5).toFixed(2)),
      depthAp: 0,
      notes: `Referenciar face superior do bloco (${b.size[0].toFixed(1)}×${b.size[2].toFixed(1)} mm) e conferir paralelismo ±0.02 mm.`,
    },
    {
      step: 2,
      operation: 'Faceamento Superior & Desbaste Inicial',
      toolName: 'Fresa Topo Plano Ø10mm 4 Cortes',
      rpm: Math.round(rpm * 0.85),
      feedMmMin: Math.round(feed * 0.9),
      targetX: Number(b.min[0].toFixed(2)),
      targetY: Number((-b.max[2]).toFixed(2)),
      targetZ: Number((zTop + settings.stockMarginMm).toFixed(2)),
      depthAp: Number(settings.stepdownMm.toFixed(2)),
      notes: 'Passes longitudinais no eixo X com fluido refrigerante solúvel.',
    },
    {
      step: 3,
      operation: `Perfilamento Contorno (${surface.name})`,
      toolName: tool.name,
      rpm,
      feedMmMin: feed,
      targetX: Number(b.max[0].toFixed(2)),
      targetY: Number((-b.min[2]).toFixed(2)),
      targetZ: Number(zMin.toFixed(2)),
      depthAp: Number((settings.stepdownMm * 0.75).toFixed(2)),
      notes: `Avanço por volante/DRO passo ${settings.stepoverPct}% (${((tool.diameterMm * settings.stepoverPct) / 100).toFixed(1)} mm).`,
    },
    {
      step: 4,
      operation: 'Acabamento Fino Superfície & Rebarbação',
      toolName: tool.name,
      rpm: Math.min(24000, Math.round(rpm * 1.15)),
      feedMmMin: Math.round(feed * 0.7),
      targetX: Number(cx.toFixed(2)),
      targetY: Number(cy.toFixed(2)),
      targetZ: Number(((zTop + zMin) / 2).toFixed(2)),
      depthAp: 0.3,
      notes: 'Inspecionar rugosidade superficial Ra ≤ 1.6 µm com rugosímetro.',
    },
  ];
}

function generatePostProcessorCode(
  points: ToolpathPoint[],
  tool: CamTool,
  rpm: number,
  feed: number,
  settings: CamSettings,
  manualSteps: ManualOperationStep[],
  additiveCfg: AdditiveManufacturingSettings | null,
  additiveSummary?: AdditiveCamSummary
): string {
  const fmt = settings.postFormat;
  const maxLines = Math.min(points.length, 220);

  if (fmt === 'manual-sheet') {
    const lines = [
      `FOLHA DE PROCESSO - USINAGEM MANUAL / DRO`,
      `Ferramenta Principal: ${tool.name} (D=${tool.diameterMm}mm, Z=${tool.flutes})`,
      `Rotação Nominal: ${rpm} RPM | Avanço: ${feed} mm/min`,
      `----------------------------------------------------------------`,
    ];
    for (const st of manualSteps) {
      lines.push(
        `OP ${String(st.step).padStart(2, '0')} | ${st.operation}`,
        `   DRO Alvo -> X:${st.targetX.toFixed(2)}  Y:${st.targetY.toFixed(2)}  Z:${st.targetZ.toFixed(2)} | ap=${st.depthAp}mm`,
        `   Parâmetros: ${st.rpm} RPM | F=${st.feedMmMin} mm/min | ${st.notes}`,
        ``
      );
    }
    return lines.join('\n');
  }

  if (fmt === 'kuka-krl') {
    const lines = [
      `&ACCESS RVP`,
      `&REL 1`,
      `DEF PARAMETRIX_JOB( )`,
      `  ; PÓS-PROCESSADOR KUKA KRL - ROBÔ 6 EIXOS`,
      `  ; FERRAMENTA: ${tool.name}`,
      `  BAS(#INITMOV, 0)`,
      `  $TOOL = TOOL_DATA[1]`,
      `  $BASE = BASE_DATA[1]`,
      `  $VEL.CP = ${(feed / 60000).toFixed(4)} ; m/s`,
      `  $APO.CDIS = 1.5`,
      ``,
    ];
    for (let i = 0; i < maxLines; i++) {
      const p = points[i];
      // Compute orientation A/B/C from tool normal
      const pitchB = (Math.acos(Math.max(-1, Math.min(1, p.nz))) * 180) / Math.PI;
      const yawA = (Math.atan2(p.ny, p.nx) * 180) / Math.PI;
      if (p.rapid) {
        lines.push(
          `  PTP {X ${p.x.toFixed(2)}, Y ${p.y.toFixed(2)}, Z ${p.z.toFixed(2)}, A ${yawA.toFixed(1)}, B ${pitchB.toFixed(1)}, C 0.0} C_PTP`
        );
      } else {
        lines.push(
          `  LIN {X ${p.x.toFixed(2)}, Y ${p.y.toFixed(2)}, Z ${p.z.toFixed(2)}, A ${yawA.toFixed(1)}, B ${pitchB.toFixed(1)}, C 0.0} C_DIS`
        );
      }
    }
    if (points.length > maxLines) {
      lines.push(`  ; ... +${points.length - maxLines} pontos LIN no arquivo exportado completo`);
    }
    lines.push(`END`);
    return lines.join('\n');
  }

  if (fmt === 'abb-rapid') {
    const lines = [
      `MODULE ParametrixJob`,
      `  ! ABB RAPID Post-Processor`,
      `  CONST speeddata vCut := [${Math.round(feed / 60)}, 500, 5000, 1000];`,
      `  PROC main()`,
    ];
    for (let i = 0; i < maxLines; i++) {
      const p = points[i];
      const cmd = p.rapid ? 'MoveJ' : 'MoveL';
      const spd = p.rapid ? 'v500' : 'vCut';
      lines.push(
        `    ${cmd} [[${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}],[0,0.7071,0.7071,0],[0,0,0,0],[9E9,9E9,9E9,9E9,9E9,9E9]], ${spd}, z1, tool0;`
      );
    }
    lines.push(`  ENDPROC`, `ENDMODULE`);
    return lines.join('\n');
  }

  // Default: ISO G-Code (Fanuc / LinuxCNC / GRBL / Additive SLM / SLA / Weld / Laser)
  const is5Axis = settings.machineType === 'cnc-5axis';
  const modeTag =
    fmt === 'slm-powder'
      ? 'LPBF METAL POWDER 400W'
      : fmt === 'sla-resin'
        ? 'SLA UV RESIN 405NM'
        : fmt === 'weld-tig-mig'
          ? 'ROBOTIC WIRE ARC MIG/TIG 195A'
          : fmt === 'laser-g'
            ? 'FIBER LASER 4KW'
            : tool.name.toUpperCase();
  const lines = [
    `%`,
    `O1001 (PARAMETRIX CAM - ${modeTag})`,
    `G21 G90 G17 G94`,
  ];

  if (additiveCfg && additiveSummary) {
    lines.push(
      `(ADDITIVE_LAYER_UM: ${additiveCfg.layerThicknessUm} | LAYERS: ${additiveSummary.layerCount})`,
      `(ADDITIVE_SUPPORT: ${additiveCfg.supportPattern} | DENSITY: ${additiveCfg.supportDensityPct}% | VOL: ${additiveSummary.supportVolumeCm3}cm3)`,
      `(ADDITIVE_SINTER: ${additiveCfg.sinterTempC}C | HOLD: ${additiveCfg.sinterHoldMinutes}min | ATM: ${additiveCfg.atmosphere} | VED: ${additiveSummary.energyDensityJMm3}J/mm3)`
    );
  }

  lines.push(
    `T01 M06`,
    `S${rpm} M03`,
    `G54`,
    `G00 Z${points[0].z.toFixed(3)}`
  );

  for (let i = 0; i < maxLines; i++) {
    const p = points[i];
    const nStr = `N${String((i + 1) * 10).padStart(4, '0')}`;
    const cmd = p.rapid ? 'G00' : 'G01';
    const feedStr = p.rapid ? '' : ` F${p.feedMmMin}`;
    let axis5Str = '';
    if (is5Axis) {
      const aDeg = (Math.atan2(p.ny, p.nz) * 180) / Math.PI;
      const bDeg = (Math.atan2(-p.nx, p.nz) * 180) / Math.PI;
      axis5Str = ` A${aDeg.toFixed(2)} B${bDeg.toFixed(2)}`;
    }
    lines.push(
      `${nStr} ${cmd} X${p.x.toFixed(3)} Y${p.y.toFixed(3)} Z${p.z.toFixed(3)}${axis5Str}${feedStr}`
    );
  }
  if (points.length > maxLines) {
    lines.push(`( ... +${points.length - maxLines} BLOCOS INCLUÍDOS NO ARQUIVO .NC )`);
  }
  lines.push(`G00 Z120.000`, `M05`, `M30`, `%`);
  return lines.join('\n');
}

/**
 * Analytical 6-Axis Industrial Robot Inverse Kinematics solver
 * Base located at Three.js world (-220, 0, 0) mm, reaching toward the machining bed at (0, y, 0).
 */
export function solveRobot6AxisIK(
  targetWorldX: number,
  targetWorldY: number,
  targetWorldZ: number,
  normalWorld: [number, number, number]
): RobotJointState {
  // Robot pedestal base position in Three.js world coordinates (mm)
  const baseX = -215;
  const baseY = 92; // shoulder pivot height above floor
  const baseZ = 0;

  // Offset target back along tool axis so wrist center sits at tool length
  const toolLen = 42;
  const wx = targetWorldX + normalWorld[0] * toolLen;
  const wy = targetWorldY + normalWorld[1] * toolLen;
  const wz = targetWorldZ + normalWorld[2] * toolLen;

  const dx = wx - baseX;
  const dy = wy - baseY;
  const dz = wz - baseZ;

  // J1: Base yaw
  const j1 = Math.atan2(-dz, dx);

  // Planar reach in arm plane
  const r = Math.hypot(dx, dz);
  const L1 = 175; // upper arm length (mm scaled)
  const L2 = 165; // forearm length (mm scaled)
  const dist = Math.min(L1 + L2 - 2, Math.max(Math.abs(L1 - L2) + 2, Math.hypot(r, dy)));

  const cosElbow = (L1 * L1 + L2 * L2 - dist * dist) / (2 * L1 * L2);
  const elbowInterior = Math.acos(Math.max(-1, Math.min(1, cosElbow)));
  const j3 = Math.PI - elbowInterior; // bend down toward workpiece

  const alpha = Math.atan2(dy, r);
  const cosShoulderOffset = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const beta = Math.acos(Math.max(-1, Math.min(1, cosShoulderOffset)));
  const j2 = alpha + beta;

  // Wrist orientation to align tool axis opposite surface normal
  const armPitch = j2 - j3;
  const targetPitch = Math.atan2(-normalWorld[1], Math.hypot(normalWorld[0], normalWorld[2]));
  const j5 = targetPitch - armPitch;
  const j4 = Math.atan2(normalWorld[2], normalWorld[0]) * 0.25;
  const j6 = 0;

  const maxReach = L1 + L2;
  const reachable = Math.hypot(r, dy) <= maxReach;

  return { j1, j2, j3, j4, j5, j6, reachable };
}
