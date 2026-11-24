import { MATERIAL_MECHANICAL_SPECS } from './structuralFea';
import type {
  CadFeatureOperation,
  CamSettings,
  CarbonFootprintReport,
  EvaluatedMesh,
  ImportedCadModel,
  MachineCarbonBenchmark,
  MachineType,
  MaterialFinish,
  ToolpathResult,
} from '../types/cad';

export interface MaterialCarbonLcaSpec {
  embodiedCo2PerKg: number; // Cradle-to-gate primary production kgCO2e/kg
  recyclingCreditPerKg: number; // Credit recovered from recycled swarf/chips kgCO2e/kg
  machinabilityPowerFactor: number; // Specific cutting energy multiplier
}

export const MATERIAL_CARBON_LCA: Record<MaterialFinish, MaterialCarbonLcaSpec> = {
  aluminum: {
    embodiedCo2PerKg: 8.24,
    recyclingCreditPerKg: 5.4,
    machinabilityPowerFactor: 0.72,
  },
  titanium: {
    embodiedCo2PerKg: 36.4,
    recyclingCreditPerKg: 14.5,
    machinabilityPowerFactor: 1.68,
  },
  'carbon-fiber': {
    embodiedCo2PerKg: 24.8,
    recyclingCreditPerKg: 1.8,
    machinabilityPowerFactor: 0.95,
  },
  'matte-plastic': {
    embodiedCo2PerKg: 4.15,
    recyclingCreditPerKg: 1.4,
    machinabilityPowerFactor: 0.35,
  },
  glass: {
    embodiedCo2PerKg: 1.45,
    recyclingCreditPerKg: 0.45,
    machinabilityPowerFactor: 1.1,
  },
  clay: {
    embodiedCo2PerKg: 0.42,
    recyclingCreditPerKg: 0.1,
    machinabilityPowerFactor: 0.22,
  },
  oak: {
    embodiedCo2PerKg: 0.38,
    recyclingCreditPerKg: 0.05,
    machinabilityPowerFactor: 0.28,
  },
};

export interface MachineEnergySpec {
  label: string;
  baseSpindleKw: number;
  servoAuxiliaryKw: number;
  kineticEfficiencyPct: number;
  cycleSpeedMultiplier: number;
}

export const MACHINE_ENERGY_SPECS: Record<MachineType, MachineEnergySpec> = {
  manual: {
    label: 'Fresadora Convencional (DRO)',
    baseSpindleKw: 2.6,
    servoAuxiliaryKw: 0.45,
    kineticEfficiencyPct: 68,
    cycleSpeedMultiplier: 1.85,
  },
  'cnc-3axis': {
    label: 'Centro CNC 3-Eixos',
    baseSpindleKw: 4.8,
    servoAuxiliaryKw: 1.4,
    kineticEfficiencyPct: 81,
    cycleSpeedMultiplier: 1.15,
  },
  'cnc-5axis': {
    label: 'Centro CNC 5-Eixos Trunnion',
    baseSpindleKw: 6.2,
    servoAuxiliaryKw: 2.1,
    kineticEfficiencyPct: 85,
    cycleSpeedMultiplier: 0.95,
  },
  'robot-6axis': {
    label: 'Robô Industrial KUKA 6-Eixos (Eixo Regenerativo)',
    baseSpindleKw: 3.4,
    servoAuxiliaryKw: 1.15,
    kineticEfficiencyPct: 92,
    cycleSpeedMultiplier: 1.0,
  },
  'powder-metal': {
    label: 'Impressão 3D Pó Metálico (LPBF Laser)',
    baseSpindleKw: 1.8,
    servoAuxiliaryKw: 2.4,
    kineticEfficiencyPct: 79,
    cycleSpeedMultiplier: 1.4,
  },
  'resin-sla': {
    label: 'Impressão 3D Resina UV (SLA / DLP)',
    baseSpindleKw: 0.45,
    servoAuxiliaryKw: 0.35,
    kineticEfficiencyPct: 88,
    cycleSpeedMultiplier: 1.25,
  },
  'robot-weld': {
    label: 'Robô Solda MIG/TIG (Arco + Fio)',
    baseSpindleKw: 5.2,
    servoAuxiliaryKw: 1.1,
    kineticEfficiencyPct: 84,
    cycleSpeedMultiplier: 0.9,
  },
  'laser-cut': {
    label: 'Cabeçote Laser Fibra 4 kW',
    baseSpindleKw: 4.0,
    servoAuxiliaryKw: 1.25,
    kineticEfficiencyPct: 86,
    cycleSpeedMultiplier: 0.72,
  },
};

export function calculateCarbonFootprint(params: {
  materialFinish: MaterialFinish;
  meshData: EvaluatedMesh;
  importedModel: ImportedCadModel | null;
  camSettings: CamSettings;
  toolpath: ToolpathResult;
  featureOps?: CadFeatureOperation[];
  gridEmissionFactorKgPerKwh?: number; // Brasil SIN ~0.085, Global ~0.475
}): CarbonFootprintReport {
  const {
    materialFinish,
    meshData,
    importedModel,
    camSettings,
    toolpath,
    featureOps = [],
    gridEmissionFactorKgPerKwh = 0.085,
  } = params;

  const mechSpec = MATERIAL_MECHANICAL_SPECS[materialFinish] ?? MATERIAL_MECHANICAL_SPECS.aluminum;
  const lcaSpec = MATERIAL_CARBON_LCA[materialFinish] ?? MATERIAL_CARBON_LCA.aluminum;
  const activeMachineSpec =
    MACHINE_ENERGY_SPECS[camSettings.machineType] ?? MACHINE_ENERGY_SPECS['cnc-5axis'];

  // Bounding dimensions in mm for billet calculation
  const bbox =
    importedModel && importedModel.positions.length > 0
      ? importedModel.boundingBox
      : meshData.boundingBox;
  const sizeX = Math.max(15, bbox.size[0]);
  const sizeY = Math.max(10, bbox.size[1]);
  const sizeZ = Math.max(15, bbox.size[2]);

  // Adjust net part volume for Magic Pen cutouts/additions
  let deltaFeatureCm3 = 0;
  for (const op of featureOps) {
    if (op.kind === 'slot-cutout' || op.kind === 'blender-boolean-mod') {
      deltaFeatureCm3 -= (op.widthMm * op.lengthMm * op.depthMm) / 1000;
    } else if (op.kind === 'through-hole') {
      const r = op.diameterMm / 2;
      deltaFeatureCm3 -= (Math.PI * r * r * op.depthMm) / 1000;
    } else if (op.kind === 'rib-boss' || op.kind.startsWith('bim-ifc-')) {
      deltaFeatureCm3 += (op.widthMm * op.lengthMm * op.depthMm) / 1000;
    }
  }

  const baseNetVolumeCm3 =
    importedModel && importedModel.positions.length > 0
      ? Math.max(12, (sizeX * sizeY * sizeZ * 0.28) / 1000)
      : Math.max(8, meshData.volumeCm3);
  const partNetVolumeCm3 = Math.max(5, baseNetVolumeCm3 + deltaFeatureCm3);

  // Raw billet includes stock margin + fixture clamping margin
  const allowance = Math.max(1, camSettings.stockMarginMm * 2 + camSettings.stepdownMm * 1.5);
  const billetRawVolumeCm3 = Math.max(
    partNetVolumeCm3 * 1.15,
    ((sizeX + allowance * 2) * (sizeY + allowance * 1.5) * (sizeZ + allowance * 2)) / 1000
  );

  // CAM toolpath removal vs billet difference
  const removedByCam = Math.max(toolpath.removedVolumeCm3, billetRawVolumeCm3 - partNetVolumeCm3);
  const wasteVolumeCm3 = Math.max(2, removedByCam);

  const densityGcm3 = mechSpec.densityGcm3;
  const partNetMassKg = (partNetVolumeCm3 * densityGcm3) / 1000;
  const billetRawMassKg = (billetRawVolumeCm3 * densityGcm3) / 1000;
  const wasteMassKg = (wasteVolumeCm3 * densityGcm3) / 1000;
  const buyToFlyRatio = billetRawMassKg / Math.max(0.01, partNetMassKg);
  const machiningWasteRatePct =
    (wasteVolumeCm3 / Math.max(1, billetRawVolumeCm3)) * 100;

  const materialEmbodiedCo2Kg = partNetMassKg * lcaSpec.embodiedCo2PerKg;
  // Net waste impact = embodied production of swarf minus scrap recycling credit
  const netChipCarbonPerKg = Math.max(0.25, lcaSpec.embodiedCo2PerKg - lcaSpec.recyclingCreditPerKg);
  const wasteNetCo2Kg = wasteMassKg * netChipCarbonPerKg;

  // Power & Energy calculation for active machine
  const computeMachineMetrics = (mType: MachineType): MachineCarbonBenchmark => {
    const mSpec = MACHINE_ENERGY_SPECS[mType];
    const rpmFactor = Math.min(1.6, Math.max(0.45, toolpath.spindleRpm / 12000));
    const loadPowerKw =
      mSpec.baseSpindleKw * rpmFactor * lcaSpec.machinabilityPowerFactor + mSpec.servoAuxiliaryKw;
    const effectivePowerKw = loadPowerKw / (mSpec.kineticEfficiencyPct / 100);
    const cycleMinutes =
      Math.max(1.5, toolpath.estimatedMinutes) *
      (mSpec.cycleSpeedMultiplier / activeMachineSpec.cycleSpeedMultiplier);
    const energyKwh = effectivePowerKw * (cycleMinutes / 60);
    const energyCo2Kg = energyKwh * gridEmissionFactorKgPerKwh;
    const efficiencyScore = Math.round(
      Math.min(100, mSpec.kineticEfficiencyPct * (1 / Math.max(0.7, energyKwh * 0.18)))
    );
    return {
      machineType: mType,
      label: mSpec.label,
      energyKwh: Number(energyKwh.toFixed(3)),
      energyCo2Kg: Number(energyCo2Kg.toFixed(4)),
      cycleMinutes: Number(cycleMinutes.toFixed(1)),
      efficiencyScore,
    };
  };

  const machineBenchmarks: MachineCarbonBenchmark[] = (
    [
      'robot-6axis',
      'cnc-5axis',
      'cnc-3axis',
      'manual',
      'powder-metal',
      'resin-sla',
      'robot-weld',
      'laser-cut',
    ] as MachineType[]
  ).map(computeMachineMetrics);

  const activeBench =
    machineBenchmarks.find((b) => b.machineType === camSettings.machineType) ??
    machineBenchmarks[0];

  const totalCo2Kg = materialEmbodiedCo2Kg + wasteNetCo2Kg + activeBench.energyCo2Kg;

  // Eco-grade A+..E based on carbon intensity per net kg & buy-to-fly efficiency
  const co2PerNetKg = totalCo2Kg / Math.max(0.05, partNetMassKg);
  let ecoGrade: CarbonFootprintReport['ecoGrade'] = 'B';
  if (co2PerNetKg <= 4 && buyToFlyRatio <= 2.2) ecoGrade = 'A+';
  else if (co2PerNetKg <= 12 && buyToFlyRatio <= 3.2) ecoGrade = 'A';
  else if (co2PerNetKg <= 24) ecoGrade = 'B';
  else if (co2PerNetKg <= 48) ecoGrade = 'C';
  else if (co2PerNetKg <= 85) ecoGrade = 'D';
  else ecoGrade = 'E';

  const optimizationTips: string[] = [];
  if (buyToFlyRatio > 2.6) {
    optimizationTips.push(
      `Razão Buy-to-Fly elevada (${buyToFlyRatio.toFixed(2)}:1). Reduza sobremetal (${camSettings.stockMarginMm} mm) ou aplique otimização de curvatura para reduzir massa e cavaco.`
    );
  }
  if (materialFinish === 'titanium' || materialFinish === 'carbon-fiber') {
    optimizationTips.push(
      `${mechSpec.name} possui alto carbono incorporado (${lcaSpec.embodiedCo2PerKg} kgCO₂e/kg). Avalie Alumínio 7075 ou redução de espessura quando SF permitir.`
    );
  }
  if (camSettings.machineType !== 'robot-6axis') {
    const robotBench = machineBenchmarks.find((b) => b.machineType === 'robot-6axis');
    if (robotBench && robotBench.energyKwh < activeBench.energyKwh) {
      optimizationTips.push(
        `Migrar para Robô 6-Eixos KUKA economizaria ${(activeBench.energyKwh - robotBench.energyKwh).toFixed(2)} kWh por peça graças à frenagem regenerativa (92% eficiência).`
      );
    }
  }
  if (optimizationTips.length === 0) {
    optimizationTips.push(
      'Conjunto material + CAM + cinemática encontra-se em faixa de alta eficiência energética e baixo desperdício.'
    );
  }

  return {
    materialName: mechSpec.name,
    densityGcm3,
    embodiedFactorKgCo2PerKg: lcaSpec.embodiedCo2PerKg,
    recyclingCreditKgCo2PerKg: lcaSpec.recyclingCreditPerKg,
    partNetVolumeCm3: Number(partNetVolumeCm3.toFixed(2)),
    partNetMassKg: Number(partNetMassKg.toFixed(3)),
    billetRawVolumeCm3: Number(billetRawVolumeCm3.toFixed(2)),
    billetRawMassKg: Number(billetRawMassKg.toFixed(3)),
    wasteVolumeCm3: Number(wasteVolumeCm3.toFixed(2)),
    wasteMassKg: Number(wasteMassKg.toFixed(3)),
    buyToFlyRatio: Number(buyToFlyRatio.toFixed(2)),
    machiningWasteRatePct: Number(machiningWasteRatePct.toFixed(1)),
    materialEmbodiedCo2Kg: Number(materialEmbodiedCo2Kg.toFixed(3)),
    wasteNetCo2Kg: Number(wasteNetCo2Kg.toFixed(3)),
    energyKwh: activeBench.energyKwh,
    spindlePowerKw: Number(
      (activeMachineSpec.baseSpindleKw * lcaSpec.machinabilityPowerFactor).toFixed(2)
    ),
    robotOrAxisEfficiencyPct: activeMachineSpec.kineticEfficiencyPct,
    gridEmissionFactorKgPerKwh,
    energyCo2Kg: activeBench.energyCo2Kg,
    totalCo2Kg: Number(totalCo2Kg.toFixed(3)),
    ecoGrade,
    machineBenchmarks,
    optimizationTips,
  };
}
