import type {
  ApplicationSegment,
  CadFeatureOperation,
  CamServiceJob,
  CamSettings,
  CarbonFootprintReport,
  EvaluatedMesh,
  FeaResult,
  FeaSettings,
  ImportedCadModel,
  LayerToleranceComplianceReport,
  LogisticsModal,
  MachineType,
  MaterialFinish,
  NurbsSurfaceData,
  PartEngineeringProfile,
  RemoteMachineTarget,
  ToolpathResult,
} from '../types/cad';
import { estimateMultimodalLogisticsRoute } from './ecosystemErpLogistics';
import { buildVucExecutionProof } from './vucHash';

export type ErpTaxRegime = 'simples' | 'presumido' | 'real';

export interface OpenErpBomLine {
  sku: string;
  name: string;
  category: 'materia-prima' | 'sucata-credito' | 'fixacao-iso' | 'consumivel-cam' | 'energia';
  quantity: number;
  unit: string;
  unitCostBrl: number;
  subtotalBrl: number;
  sourceArea: 'CAD' | 'CAE' | 'CAM';
}

export interface OpenErpTaxBreakdown {
  regime: ErpTaxRegime;
  regimeLabel: string;
  icmsBrl: number;
  ipiBrl: number;
  pisCofinsOrDasBrl: number;
  totalTaxBrl: number;
  effectiveRatePct: number;
}

export interface OpenErpPricingAndRoi {
  commercialDisclosureBlocked: boolean;
  frostbiteNotice: string | null;
  batchQty: number;
  directManufacturingCostUnitBrl: number;
  logisticsUnitBrl: number;
  taxUnitBrl: number;
  totalCostUnitBrl: number;
  targetMarginPct: number;
  parametrixPriceUnitBrl: number;
  parametrixBatchTotalBrl: number;
  marketPriceUnitBrl: number | null;
  savingsVsMarketPct: number | null;
  roiPct: number | null;
  paybackBatches: number | null;
}

export interface OpenErpAreaCorrelation {
  area: 'CAD' | 'CAE' | 'CAM';
  erpModule: string;
  status: 'sincronizado' | 'alerta';
  headline: string;
  metricsSummary: string;
}

export interface OpenErpCrmLead {
  id: string;
  companySegment: string;
  vertical: ApplicationSegment;
  contactRole: string;
  estimatedOrderQty: number;
  estimatedTicketBrl: number;
  qualificationScorePct: number;
  stage: 'prospeccao' | 'cotacao-tecnica' | 'aprovacao-vuc';
  rationale: string;
}

export interface OpenErpWorkspaceSnapshot {
  partName: string;
  modelCode: string;
  segment: ApplicationSegment;
  activeOperatorEmail: string;
  activeOperatorHandle: string;
  bomLines: OpenErpBomLine[];
  bomTotalBatchBrl: number;
  routingCost: {
    machineType: MachineType;
    machineHourlyRateBrl: number;
    cycleMinutesPerUnit: number;
    setupCostBatchBrl: number;
    qaAndVucFeeBatchBrl: number;
    machiningTotalBatchBrl: number;
  };
  logistics: {
    modal: LogisticsModal;
    modalLabel: string;
    distanceKm: number;
    cargoMassKg: number;
    estimatedHours: number;
    totalFreightBrl: number;
    co2Kg: number;
  };
  taxBreakdown: OpenErpTaxBreakdown;
  pricingAndRoi: OpenErpPricingAndRoi;
  correlatedAreas: OpenErpAreaCorrelation[];
  crmLeads: OpenErpCrmLead[];
  biSummary: {
    activePipelineOrders: number;
    weightedCrmValueBrl: number;
    avgMarginPct: number;
    techReadinessPct: number;
  };
  vucHash: string;
}

const MATERIAL_UNIT_PRICES_BRL_KG: Record<MaterialFinish, number> = {
  aluminum: 68,
  titanium: 440,
  'carbon-fiber': 320,
  'matte-plastic': 54,
  glass: 46,
  clay: 28,
  oak: 36,
};

const MATERIAL_DENSITY_G_CM3: Record<MaterialFinish, number> = {
  aluminum: 2.71,
  titanium: 4.43,
  'carbon-fiber': 1.58,
  'matte-plastic': 1.18,
  glass: 2.5,
  clay: 1.65,
  oak: 0.72,
};

const MACHINE_HOURLY_RATE_BRL: Record<MachineType, number> = {
  manual: 140,
  'cnc-3axis': 220,
  'cnc-5axis': 380,
  'robot-6axis': 340,
  'powder-metal': 560,
  'resin-sla': 195,
  'robot-weld': 275,
  'laser-cut': 310,
};

const MACHINE_SETUP_COST_BRL: Record<MachineType, number> = {
  manual: 120,
  'cnc-3axis': 260,
  'cnc-5axis': 480,
  'robot-6axis': 420,
  'powder-metal': 620,
  'resin-sla': 180,
  'robot-weld': 340,
  'laser-cut': 240,
};

const MARKET_INEFFICIENCY_MULTIPLIER: Record<ApplicationSegment, number> = {
  'ciclismo-mobilidade': 1.38,
  automotivo: 1.32,
  aeroespacial: 1.54,
  'arquitetura-bim': 1.29,
  'industrial-cnc': 1.34,
  robotica: 1.44,
  medico: 1.49,
};

export function isFrostbiteInternalArchitecture(
  partProfile: Pick<PartEngineeringProfile, 'partName' | 'modelCode' | 'manufacturer'>,
  presetId?: string
): boolean {
  if (presetId === 'preset-frostbite-rack' || presetId === 'preset-soc-hybrid') {
    return true;
  }
  const combined =
    `${partProfile.partName} ${partProfile.modelCode} ${partProfile.manufacturer}`.toLowerCase();
  return (
    combined.includes('frostbite') ||
    combined.includes('fb-7nm') ||
    combined.includes('soc-cpo-7nm') ||
    combined.includes('pré-silício') ||
    combined.includes('pre-silicio')
  );
}

export interface ComputeOpenErpInput {
  surface: NurbsSurfaceData;
  meshData: EvaluatedMesh;
  importedModel: ImportedCadModel | null;
  featureOps: CadFeatureOperation[];
  materialFinish: MaterialFinish;
  partProfile: PartEngineeringProfile;
  feaResult: FeaResult;
  feaSettings: FeaSettings;
  layerComplianceReport: LayerToleranceComplianceReport;
  carbonReport: CarbonFootprintReport;
  camSettings: CamSettings;
  toolpath: ToolpathResult;
  camServiceJobs: CamServiceJob[];
  remoteMachines: RemoteMachineTarget[];
  batchQty?: number;
  targetMarginPct?: number;
  taxRegime?: ErpTaxRegime;
  logisticsModal?: LogisticsModal;
  distanceKm?: number;
  activeOperatorEmail?: string;
  activeOperatorHandle?: string;
  presetId?: string;
}

function round2(val: number): number {
  return Number(val.toFixed(2));
}

function buildCrmLeadsForSegment(params: {
  segment: ApplicationSegment;
  partName: string;
  unitPriceBrl: number;
  techReadinessPct: number;
  commercialBlocked: boolean;
}): OpenErpCrmLead[] {
  const { segment, partName, unitPriceBrl, techReadinessPct, commercialBlocked } = params;
  const stage: OpenErpCrmLead['stage'] =
    techReadinessPct >= 88
      ? 'aprovacao-vuc'
      : techReadinessPct >= 70
        ? 'cotacao-tecnica'
        : 'prospeccao';

  if (commercialBlocked) {
    return [
      {
        id: 'crm-internal-dc',
        companySegment: 'Consórcio Interno P&D Infraestrutura Térmica (Pré-Silício)',
        vertical: segment,
        contactRole: 'Arquiteto de Datacenter & Cold-Plate',
        estimatedOrderQty: 2,
        estimatedTicketBrl: round2(unitPriceBrl * 2),
        qualificationScorePct: techReadinessPct,
        stage,
        rationale: `Validação mecânica/térmica de chassi e cold-plate para "${partName}" (sem divulgação pública de CAPEX/OPEX/ROI de silício 7nm).`,
      },
    ];
  }

  const catalogBySegment: Record<
    ApplicationSegment,
    { companySegment: string; contactRole: string; qty: number; bonusScore: number }[]
  > = {
    'ciclismo-mobilidade': [
      {
        companySegment: 'Montadoras OEM E-Bike & Downhill BR/LatAm',
        contactRole: 'Gerente de Produto & Chassi',
        qty: 24,
        bonusScore: 6,
      },
      {
        companySegment: 'Equipes Oficiais Enduro & Oficina Suspensão CNC',
        contactRole: 'Engenheiro de Pista / Compras',
        qty: 10,
        bonusScore: 2,
      },
    ],
    aeroespacial: [
      {
        companySegment: 'Integradores Tier-1 Turbomáquinas & Propulsão VANT',
        contactRole: 'Diretor de Engenharia AS9100',
        qty: 12,
        bonusScore: 7,
      },
      {
        companySegment: 'Operadoras MRO Aviação Executiva & Drones Pesados',
        contactRole: 'Coordenador de Aeronavegabilidade',
        qty: 6,
        bonusScore: 3,
      },
    ],
    'industrial-cnc': [
      {
        companySegment: 'Sistemistas Automação, Redutores e Bombas Centrífugas',
        contactRole: 'Comprador Técnico Industrial',
        qty: 50,
        bonusScore: 5,
      },
      {
        companySegment: 'Plantas Siderúrgicas & Papel/Celulose (Reposição Rápida)',
        contactRole: 'Gerente de Manutenção Confiabilidade',
        qty: 20,
        bonusScore: 2,
      },
    ],
    'arquitetura-bim': [
      {
        companySegment: 'Construtoras & Escritórios Coberturas Paramétricas BIM',
        contactRole: 'Coordenador BIM / Estruturas',
        qty: 4,
        bonusScore: 4,
      },
      {
        companySegment: 'Fabricantes de Estruturas Especiais & Fachadas',
        contactRole: 'Engenheiro Orçamentista',
        qty: 6,
        bonusScore: 1,
      },
    ],
    robotica: [
      {
        companySegment: 'Células Robotizadas KUKA/ABB Autopeças & Solda',
        contactRole: 'Líder de Integração Robótica',
        qty: 12,
        bonusScore: 6,
      },
      {
        companySegment: 'Centros de Logística Automatizada & Efetuadores CFRP',
        contactRole: 'Gerente de Automação',
        qty: 16,
        bonusScore: 3,
      },
    ],
    automotivo: [
      {
        companySegment: 'Sistemistas Motorsport, Powertrain & Suspensão',
        contactRole: 'Gerente de Manufatura CNC',
        qty: 30,
        bonusScore: 5,
      },
      {
        companySegment: 'Frotistas Elétricos & Conversão Veicular Especial',
        contactRole: 'Engenheiro de Homologação',
        qty: 18,
        bonusScore: 2,
      },
    ],
    medico: [
      {
        companySegment: 'Laboratórios Microfluídica, Óptica & Dispositivos ISO 13485',
        contactRole: 'Diretor P&D Dispositivos Médicos',
        qty: 30,
        bonusScore: 5,
      },
      {
        companySegment: 'Indústria Odontológica & Moldes SLA Alta Precisão',
        contactRole: 'Responsável Técnico Produção',
        qty: 25,
        bonusScore: 2,
      },
    ],
  };

  return catalogBySegment[segment].map((entry, idx) => {
    const score = Math.min(99, Math.max(45, techReadinessPct + entry.bonusScore));
    return {
      id: `crm-${segment}-${idx + 1}`,
      companySegment: entry.companySegment,
      vertical: segment,
      contactRole: entry.contactRole,
      estimatedOrderQty: entry.qty,
      estimatedTicketBrl: round2(unitPriceBrl * entry.qty),
      qualificationScorePct: score,
      stage,
      rationale: `Aderente a "${partName}" · Prontidão CAD/CAE/CAM ${score}% com certificado VUC Ed25519.`,
    };
  });
}

export function buildLiveErpWorkspaceSnapshot(
  input: ComputeOpenErpInput
): OpenErpWorkspaceSnapshot {
  const batchQty = Math.max(1, Math.min(500, Math.round(input.batchQty ?? 10)));
  const targetMarginPct = Math.max(5, Math.min(65, Number(input.targetMarginPct ?? 28)));
  const taxRegime: ErpTaxRegime = input.taxRegime ?? 'presumido';
  const logisticsModal: LogisticsModal = input.logisticsModal ?? 'road';
  const distanceKm = Math.max(10, Math.round(input.distanceKm ?? 220));
  const partName = input.importedModel ? input.importedModel.filename : input.partProfile.partName;

  const netVolumeCm3 = Math.max(
    18,
    input.importedModel
      ? ((input.importedModel.boundingBox.size[0] *
          input.importedModel.boundingBox.size[1] *
          input.importedModel.boundingBox.size[2]) /
          1000) *
          0.42
      : input.meshData.volumeCm3
  );
  const densityGCm3 = MATERIAL_DENSITY_G_CM3[input.materialFinish];
  const unitNetMassKg = Math.max(0.18, round2((netVolumeCm3 * densityGCm3) / 1000));
  const buyToFly = Math.max(1.05, input.carbonReport.buyToFlyRatio);
  const unitGrossMassKg = round2(unitNetMassKg * buyToFly);
  const unitScrapKg = round2(Math.max(0, unitGrossMassKg - unitNetMassKg));

  const matPricePerKg = MATERIAL_UNIT_PRICES_BRL_KG[input.materialFinish];
  const rawMaterialCostBatch = round2(unitGrossMassKg * batchQty * matPricePerKg);
  const scrapCreditBatch = round2(-unitScrapKg * batchQty * matPricePerKg * 0.22);

  const boltCount = input.featureOps.filter((op) => op.kind === 'threaded-bolt').length;
  const effectiveFastenersPerUnit = Math.max(boltCount, input.featureOps.length > 0 ? 1 : 0);
  const fastenerCostBatch = round2(effectiveFastenersPerUnit * batchQty * 6.8);

  const isAdditive =
    input.camSettings.machineType === 'powder-metal' ||
    input.camSettings.machineType === 'resin-sla';
  const consumableUnitName = isAdditive
    ? input.camSettings.machineType === 'powder-metal'
      ? 'Gás Argônio 5.0 + Peneiramento Pó'
      : 'Álcool IPA Pós-Cura UV 405nm'
    : 'Fluido Dielétrico / Corte + Pastilha';
  const consumableRateUnit = isAdditive ? 32.5 : 14.2;
  const consumableBatch = round2(batchQty * consumableRateUnit);

  const cycleMinutesPerUnit = Math.max(2, round2(input.toolpath.estimatedMinutes));
  const machineRateHr = MACHINE_HOURLY_RATE_BRL[input.camSettings.machineType];
  const kwhPerUnit = round2((cycleMinutesPerUnit / 60) * 4.8);
  const energyBatchBrl = round2(kwhPerUnit * batchQty * 0.89);

  const bomLines: OpenErpBomLine[] = [
    {
      sku: `MAT-${input.materialFinish.toUpperCase()}`,
      name: `Matéria-Prima Bruta (${input.materialFinish})`,
      category: 'materia-prima',
      quantity: round2(unitGrossMassKg * batchQty),
      unit: 'kg',
      unitCostBrl: matPricePerKg,
      subtotalBrl: rawMaterialCostBatch,
      sourceArea: 'CAD',
    },
    {
      sku: `SCRAP-${input.materialFinish.toUpperCase()}`,
      name: 'Crédito Cavaco / Pó Reciclável (-22%)',
      category: 'sucata-credito',
      quantity: round2(unitScrapKg * batchQty),
      unit: 'kg',
      unitCostBrl: round2(-matPricePerKg * 0.22),
      subtotalBrl: scrapCreditBatch,
      sourceArea: 'CAM',
    },
  ];

  if (effectiveFastenersPerUnit > 0) {
    bomLines.push({
      sku: 'ISO-BOLT-M6M8',
      name: 'Kit Fixadores Métricos ISO (Inox A2-70)',
      category: 'fixacao-iso',
      quantity: effectiveFastenersPerUnit * batchQty,
      unit: 'un',
      unitCostBrl: 6.8,
      subtotalBrl: fastenerCostBatch,
      sourceArea: 'CAD',
    });
  }

  bomLines.push(
    {
      sku: `CONS-${input.camSettings.machineType.toUpperCase()}`,
      name: consumableUnitName,
      category: 'consumivel-cam',
      quantity: batchQty,
      unit: 'kit',
      unitCostBrl: consumableRateUnit,
      subtotalBrl: consumableBatch,
      sourceArea: 'CAM',
    },
    {
      sku: 'ENG-KWH-SIN',
      name: 'Energia Elétrica Operacional (SIN)',
      category: 'energia',
      quantity: round2(kwhPerUnit * batchQty),
      unit: 'kWh',
      unitCostBrl: 0.89,
      subtotalBrl: energyBatchBrl,
      sourceArea: 'CAE',
    }
  );

  const bomTotalBatchBrl = round2(bomLines.reduce((acc, line) => acc + line.subtotalBrl, 0));

  const setupCostBatchBrl = MACHINE_SETUP_COST_BRL[input.camSettings.machineType];
  const machineRuntimeBatchBrl = round2((cycleMinutesPerUnit / 60) * machineRateHr * batchQty);
  const qaAndVucFeeBatchBrl = round2(140 + batchQty * 12.5);
  const machiningTotalBatchBrl = round2(
    setupCostBatchBrl + machineRuntimeBatchBrl + qaAndVucFeeBatchBrl
  );

  const totalCargoMassKg = round2(Math.max(1, unitNetMassKg * batchQty));
  const route = estimateMultimodalLogisticsRoute(logisticsModal, distanceKm, totalCargoMassKg);

  const directBatchBrl = round2(bomTotalBatchBrl + machiningTotalBatchBrl);
  const directUnitBrl = round2(directBatchBrl / batchQty);
  const logisticsUnitBrl = round2(route.costBrl / batchQty);

  const preTaxTargetUnit = (directUnitBrl + logisticsUnitBrl) / (1 - targetMarginPct / 100);
  const baseBatchRevenue = round2(preTaxTargetUnit * batchQty);

  let icmsRate = 0.12;
  let ipiRate = 0.05;
  let pisCofinsRate = 0.0365;
  let regimeLabel = 'Lucro Presumido (ICMS + IPI + PIS/COFINS)';
  if (taxRegime === 'simples') {
    icmsRate = 0.035;
    ipiRate = 0.0;
    pisCofinsRate = 0.06;
    regimeLabel = 'Simples Nacional Anexo II (DAS Unificado)';
  } else if (taxRegime === 'real') {
    icmsRate = 0.11;
    ipiRate = 0.04;
    pisCofinsRate = 0.0625;
    regimeLabel = 'Lucro Real (Crédito Insumos Industriais)';
  }

  const icmsBrl = round2(baseBatchRevenue * icmsRate);
  const ipiBrl = round2(baseBatchRevenue * ipiRate);
  const pisCofinsOrDasBrl = round2(baseBatchRevenue * pisCofinsRate);
  const totalTaxBrl = round2(icmsBrl + ipiBrl + pisCofinsOrDasBrl);
  const effectiveRatePct = round2((totalTaxBrl / Math.max(1, baseBatchRevenue)) * 100);
  const taxUnitBrl = round2(totalTaxBrl / batchQty);

  const totalCostUnitBrl = round2(directUnitBrl + logisticsUnitBrl + taxUnitBrl);
  const parametrixPriceUnitBrl = round2(preTaxTargetUnit + taxUnitBrl);
  const parametrixBatchTotalBrl = round2(parametrixPriceUnitBrl * batchQty);

  const commercialDisclosureBlocked = isFrostbiteInternalArchitecture(
    input.partProfile,
    input.presetId
  );

  const marketMultiplier = MARKET_INEFFICIENCY_MULTIPLIER[input.partProfile.segment];
  const marketPriceUnitBrl = commercialDisclosureBlocked
    ? null
    : round2(parametrixPriceUnitBrl * marketMultiplier);
  const savingsVsMarketPct =
    marketPriceUnitBrl !== null
      ? round2(((marketPriceUnitBrl - parametrixPriceUnitBrl) / marketPriceUnitBrl) * 100)
      : null;

  const unitGrossProfit = parametrixPriceUnitBrl - directUnitBrl - taxUnitBrl;
  const roiPct = commercialDisclosureBlocked
    ? null
    : round2(
        ((unitGrossProfit * batchQty) / Math.max(1, directBatchBrl + route.costBrl)) * 100
      );
  const paybackBatches = commercialDisclosureBlocked
    ? null
    : round2(Math.max(1, setupCostBatchBrl / Math.max(25, unitGrossProfit * batchQty * 0.35)));

  const frostbiteNotice = commercialDisclosureBlocked
    ? 'FrostbiteEngine CMOS 7nm 500MHz pré-silício (~4,6× perf/Watt): apenas custos fabris internos de cold-plate/chassi; sem fornecedores comerciais, CAPEX, OPEX ou ROI públicos.'
    : null;

  const gdtPassed = input.layerComplianceReport.overallStatus === 'conforme';
  const caeOk = input.feaResult.status === 'seguro' && gdtPassed;
  const correlatedAreas: OpenErpAreaCorrelation[] = [
    {
      area: 'CAD',
      erpModule: 'Engenharia & Lista BOM',
      status: 'sincronizado',
      headline: `${partName} · ${unitNetMassKg} kg líq (${unitGrossMassKg} kg bruto)`,
      metricsSummary: `${input.meshData.triangleCount.toLocaleString('pt-BR')} tri · ${input.featureOps.length} feature(s) · ${bomLines.length} itens BOM`,
    },
    {
      area: 'CAE',
      erpModule: 'Qualidade, FEA, GD&T & LCA',
      status: caeOk ? 'sincronizado' : 'alerta',
      headline: `SF ${input.feaResult.safetyFactor}× (${input.feaResult.maxStressMpa} MPa) · ${input.carbonReport.ecoGrade}`,
      metricsSummary: `GD&T ${input.layerComplianceReport.passCount}/${input.layerComplianceReport.totalLayers} camadas · ${input.carbonReport.totalCo2Kg} kgCO₂e`,
    },
    {
      area: 'CAM',
      erpModule: 'Ordem Produção & Máquinas',
      status: input.camServiceJobs.length > 0 || input.remoteMachines.length > 0 ? 'sincronizado' : 'alerta',
      headline: `${input.camSettings.machineType} · ${cycleMinutesPerUnit} min/un · ${input.camSettings.postFormat}`,
      metricsSummary: `${input.camServiceJobs.length} job(s) · ${input.remoteMachines.length} máquina(s) remotas · R$ ${machiningTotalBatchBrl.toLocaleString('pt-BR')}`,
    },
  ];

  const techReadinessPct = Math.min(
    99,
    Math.round(
      (input.feaResult.status === 'seguro' ? 42 : 24) +
        (gdtPassed ? 30 : 18) +
        (input.toolpath.points.length > 0 ? 18 : 6) +
        (input.remoteMachines.length > 0 ? 6 : 2)
    )
  );

  const crmLeads = buildCrmLeadsForSegment({
    segment: input.partProfile.segment,
    partName,
    unitPriceBrl: parametrixPriceUnitBrl,
    techReadinessPct,
    commercialBlocked: commercialDisclosureBlocked,
  });

  const weightedCrmValueBrl = round2(
    crmLeads.reduce(
      (sum, lead) => sum + (lead.estimatedTicketBrl * lead.qualificationScorePct) / 100,
      0
    )
  );

  const proof = buildVucExecutionProof('ERP_OPEN_LIVE', partName, {
    batchQty,
    taxRegime,
    parametrixBatchTotalBrl,
    commercialDisclosureBlocked,
  });

  return {
    partName,
    modelCode: input.partProfile.modelCode,
    segment: input.partProfile.segment,
    activeOperatorEmail: input.activeOperatorEmail || 'operador@parametrix.local',
    activeOperatorHandle: input.activeOperatorHandle || '@parametrix.op',
    bomLines,
    bomTotalBatchBrl,
    routingCost: {
      machineType: input.camSettings.machineType,
      machineHourlyRateBrl: machineRateHr,
      cycleMinutesPerUnit,
      setupCostBatchBrl,
      qaAndVucFeeBatchBrl,
      machiningTotalBatchBrl,
    },
    logistics: {
      modal: logisticsModal,
      modalLabel: route.modalLabel,
      distanceKm,
      cargoMassKg: totalCargoMassKg,
      estimatedHours: route.estimatedHours,
      totalFreightBrl: route.costBrl,
      co2Kg: route.co2Kg,
    },
    taxBreakdown: {
      regime: taxRegime,
      regimeLabel,
      icmsBrl,
      ipiBrl,
      pisCofinsOrDasBrl,
      totalTaxBrl,
      effectiveRatePct,
    },
    pricingAndRoi: {
      commercialDisclosureBlocked,
      frostbiteNotice,
      batchQty,
      directManufacturingCostUnitBrl: directUnitBrl,
      logisticsUnitBrl,
      taxUnitBrl,
      totalCostUnitBrl,
      targetMarginPct,
      parametrixPriceUnitBrl,
      parametrixBatchTotalBrl,
      marketPriceUnitBrl,
      savingsVsMarketPct,
      roiPct,
      paybackBatches,
    },
    correlatedAreas,
    crmLeads,
    biSummary: {
      activePipelineOrders: batchQty,
      weightedCrmValueBrl,
      avgMarginPct: targetMarginPct,
      techReadinessPct,
    },
    vucHash: proof.vucHash,
  };
}
