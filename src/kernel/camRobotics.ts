import type {
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

export function computeCuttingParameters(tool: CamTool, speedMultiplier: number) {
  const rawRpm = (1000 * tool.recommendedVc) / (Math.PI * tool.diameterMm);
  const spindleRpm = Math.round(Math.min(24000, Math.max(1200, rawRpm)) / 50) * 50;
  const feedRateMmMin = Math.round(
    spindleRpm * tool.flutes * tool.recommendedFz * speedMultiplier
  );
  return { spindleRpm, feedRateMmMin };
}

/**
 * Generates real 3D/5-Axis/6-Axis CAM Toolpaths directly from the evaluated NURBS surface.
 * Output coordinates are in CNC/Robot frame: X = worldX, Y = -worldZ, Z = worldY_up
 */
export function generateCamToolpath(
  surface: NurbsSurfaceData,
  mesh: EvaluatedMesh,
  settings: CamSettings
): ToolpathResult {
  const tool = CAM_TOOLS.find((t) => t.id === settings.toolId) ?? CAM_TOOLS[0];
  const { spindleRpm, feedRateMmMin } = computeCuttingParameters(
    tool,
    settings.cutSpeedMultiplier
  );

  const bbox = mesh.boundingBox;
  const safeZ = bbox.max[1] + settings.safeZMm;
  const points: ToolpathPoint[] = [];
  const stepoverMm = Math.max(2, (tool.diameterMm * settings.stepoverPct) / 100);

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
    settings.machineType === 'cnc-5axis' || settings.machineType === 'robot-6axis';

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

  const estimatedMinutes =
    cuttingLengthMm / Math.max(100, feedRateMmMin) + rapidLengthMm / 6000;
  const removedVolumeCm3 = Number(
    ((cuttingLengthMm * tool.diameterMm * settings.stepdownMm) / 1000).toFixed(1)
  );

  const manualSteps = buildManualProcessSheet(
    surface,
    mesh,
    tool,
    spindleRpm,
    feedRateMmMin,
    settings
  );
  const postCode = generatePostProcessorCode(
    points,
    tool,
    spindleRpm,
    feedRateMmMin,
    settings,
    manualSteps
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
  };
}

function buildManualProcessSheet(
  surface: NurbsSurfaceData,
  mesh: EvaluatedMesh,
  tool: CamTool,
  rpm: number,
  feed: number,
  settings: CamSettings
): ManualOperationStep[] {
  const b = mesh.boundingBox;
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = -(b.min[2] + b.max[2]) / 2;
  const zTop = b.max[1];
  const zMin = b.min[1];

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
  manualSteps: ManualOperationStep[]
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

  // Default: ISO G-Code (Fanuc / LinuxCNC / GRBL)
  const is5Axis = settings.machineType === 'cnc-5axis';
  const lines = [
    `%`,
    `O1001 (PARAMETRIX CAM - ${tool.name.toUpperCase()})`,
    `G21 G90 G17 G94`,
    `T01 M06`,
    `S${rpm} M03`,
    `G54`,
    `G00 Z${points[0].z.toFixed(3)}`,
  ];

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
