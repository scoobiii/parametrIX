import type {
  AuthUserProfile,
  AutonomousAgentConfig,
  ComputeShareNode,
  EcosystemRole,
  ErpCrmRecord,
  LogisticsModal,
  LogisticsTelemetryNode,
} from '../types/cad';
import { buildVucExecutionProof } from './vucHash';

export interface RoleDefinition {
  role: EcosystemRole;
  label: string;
  shortTag: string;
  defaultHandle: string;
  defaultPhone: string;
  defaultAddress: string;
  agentDefaultName: string;
  capabilities: string[];
}

export const ECOSYSTEM_ROLE_DEFINITIONS: Record<EcosystemRole, RoleDefinition> = {
  client: {
    role: 'client',
    label: 'Cliente / Solicitante Industrial',
    shortTag: 'Cliente',
    defaultHandle: '@cliente.parametrix',
    defaultPhone: '+55 11 98100-1001',
    defaultAddress: 'Av. Paulista 1578, São Paulo - SP',
    agentDefaultName: 'Agente Concierge Cliente',
    capabilities: [
      'Aprovar cotações ERP/CRM',
      'Solicitar produção CAM + prova VUC',
      'Acompanhar rastreio GPS ponto a ponto',
    ],
  },
  cam_provider: {
    role: 'cam_provider',
    label: 'Provedor CAM (Torno · Fresa · Robôs · Foxconn)',
    shortTag: 'Provedor CAM',
    defaultHandle: '@foxconn.cam.br',
    defaultPhone: '+55 11 98200-2002',
    defaultAddress: 'Rod. Anhanguera Km 52, Jundiaí - SP (Hub Fabril)',
    agentDefaultName: 'Agente Orquestrador CNC/Robô',
    capabilities: [
      'Aceitar lotes G-Code / KUKA KRL / LPBF',
      'Executar máquina remota via OPC-UA / SSH',
      'Emitir laudo VUC + despacho logístico',
    ],
  },
  logistics: {
    role: 'logistics',
    label: 'Logística & Entregadores (iFood · 99 · Autônomo)',
    shortTag: 'Logística GPS',
    defaultHandle: '@logistica.99ifood',
    defaultPhone: '+55 11 98300-3003',
    defaultAddress: 'Hub Multimodal Rodo-Ferro-Aero-Fluvial Santos/Viracopos',
    agentDefaultName: 'Agente Despachante Multimodal',
    capabilities: [
      'Coletar telemetria GPS em tempo real',
      'Rotear carga Rodo/Ferro/Aéreo/Fluvial',
      'Confirmar entrega com assinatura VUC',
    ],
  },
  supplier: {
    role: 'supplier',
    label: 'Fornecedor de Insumos por Segmento',
    shortTag: 'Fornecedor',
    defaultHandle: '@insumos.ligas.br',
    defaultPhone: '+55 19 98400-4004',
    defaultAddress: 'Distrito Metalúrgico, Piracicaba - SP',
    agentDefaultName: 'Agente Reposição Matéria-Prima',
    capabilities: [
      'Fornecer Ti-6Al-4V, Alumínio 7075, Pó SLM, Resina UV',
      'Garantir certificado de corrida ISO 9001',
      'Integrar saldo BOM no ERP Open',
    ],
  },
  compute_node: {
    role: 'compute_node',
    label: 'Colaborador Compute-Share (20% CPU/GPU)',
    shortTag: 'Nó 20% GPU',
    defaultHandle: '@node20.cluster',
    defaultPhone: '+55 48 98500-5005',
    defaultAddress: 'Cluster Distribuído Edge / Florianópolis - SC',
    agentDefaultName: 'Agente Malha Compute 20%',
    capabilities: [
      'Compartilhar 20% da capacidade local CPU/GPU',
      'Executar tesselação NURBS & FEA distribuído',
      'Validar hashes VUC em quórum',
    ],
  },
};

export function createDefaultAgentForRole(
  role: EcosystemRole,
  override?: Partial<AutonomousAgentConfig>
): AutonomousAgentConfig {
  const def = ECOSYSTEM_ROLE_DEFINITIONS[role];
  return {
    enabled: true,
    agentName: def.agentDefaultName,
    handleAt: def.defaultHandle,
    phone: def.defaultPhone,
    address: def.defaultAddress,
    autoRestartCam: role === 'cam_provider',
    autoAssignLogistics: role === 'logistics' || role === 'client',
    targetCapabilities: [...def.capabilities],
    ...override,
  };
}

export function buildUserProfileWithRole(
  base: Pick<AuthUserProfile, 'id' | 'email' | 'displayName' | 'provider' | 'offlineMode'>,
  role: EcosystemRole,
  agentOverride?: Partial<AutonomousAgentConfig>
): AuthUserProfile {
  const def = ECOSYSTEM_ROLE_DEFINITIONS[role];
  const agentConfig = createDefaultAgentForRole(role, agentOverride);
  return {
    ...base,
    role,
    handleAt: agentConfig.handleAt || def.defaultHandle,
    phone: agentConfig.phone || def.defaultPhone,
    address: agentConfig.address || def.defaultAddress,
    computeSharePct: 20,
    agentConfig,
  };
}

export interface MultimodalRouteEstimate {
  modal: LogisticsModal;
  modalLabel: string;
  distanceKm: number;
  estimatedHours: number;
  costBrl: number;
  co2Kg: number;
  vucHash: string;
}

const MODAL_RATES: Record<
  LogisticsModal,
  { label: string; speedKmh: number; brlPerKm: number; co2PerKm: number; hubHops: string }
> = {
  road: {
    label: 'Rodoviário (iFood/99/Autônomo + Caminhão)',
    speedKmh: 58,
    brlPerKm: 2.8,
    co2PerKm: 0.14,
    hubHops: 'Porta Fábrica -> Rodovia',
  },
  rail: {
    label: 'Ferroviário (Corredor Carga Pesada)',
    speedKmh: 72,
    brlPerKm: 1.35,
    co2PerKm: 0.045,
    hubHops: 'Terminal Ferroviário <-> Porto Seco',
  },
  air: {
    label: 'Aéreo (Expresso Viracopos / Guarulhos)',
    speedKmh: 680,
    brlPerKm: 7.4,
    co2PerKm: 0.58,
    hubHops: 'Aeroporto Carga -> Última Milha',
  },
  river: {
    label: 'Fluvial / Hidroviário (Tietê-Paraná / Cabotagem)',
    speedKmh: 26,
    brlPerKm: 0.85,
    co2PerKm: 0.028,
    hubHops: 'Terminal Fluvial -> Retroporto',
  },
};

export function estimateMultimodalLogisticsRoute(
  modal: LogisticsModal,
  distanceKm: number,
  cargoMassKg: number
): MultimodalRouteEstimate {
  const dist = Math.max(1, Number(distanceKm) || 10);
  const mass = Math.max(0.5, Number(cargoMassKg) || 1);
  const spec = MODAL_RATES[modal];
  const estimatedHours = Number((dist / spec.speedKmh + 0.4).toFixed(2));
  const costBrl = Number((dist * spec.brlPerKm + mass * 1.4).toFixed(2));
  const co2Kg = Number((dist * spec.co2PerKm * (0.6 + mass / 40)).toFixed(3));
  const proof = buildVucExecutionProof('LOGISTICS_ROUTE', `${spec.label} (${dist} km)`, {
    modal,
    dist,
    mass,
    costBrl,
    co2Kg,
  });
  return {
    modal,
    modalLabel: spec.label,
    distanceKm: dist,
    estimatedHours,
    costBrl,
    co2Kg,
    vucHash: proof.vucHash,
  };
}

export function aggregateComputeSharePool(nodes: ComputeShareNode[]) {
  const activeNodes = nodes.filter((n) => n.active);
  const totalCoresContributed = activeNodes.reduce(
    (acc, n) => acc + Number(((n.cpuCores * n.sharePct) / 100).toFixed(2)),
    0
  );
  const totalTflopsContributed = activeNodes.reduce(
    (acc, n) => acc + Number(((n.tflopsEst * n.sharePct) / 100).toFixed(2)),
    0
  );
  const proof = buildVucExecutionProof('COMPUTE_SHARE_POOL', 'Cluster 20% Distribuído', {
    activeCount: activeNodes.length,
    totalCoresContributed,
    totalTflopsContributed,
  });
  return {
    activeCount: activeNodes.length,
    totalCoresContributed: Number(totalCoresContributed.toFixed(2)),
    totalTflopsContributed: Number(totalTflopsContributed.toFixed(2)),
    vucHash: proof.vucHash,
  };
}

export function summarizeErpCrmPipeline(
  records: ErpCrmRecord[],
  logistics: LogisticsTelemetryNode[]
) {
  const totalPipelineBrl = records.reduce((s, r) => s + r.amountBrl, 0);
  const openOrders = records.filter((r) => r.status !== 'concluido').length;
  const completedOrders = records.filter((r) => r.status === 'concluido').length;
  const activeCouriers = logistics.filter((l) => l.status !== 'entregue').length;
  return {
    totalPipelineBrl: Number(totalPipelineBrl.toFixed(2)),
    openOrders,
    completedOrders,
    activeCouriers,
  };
}
