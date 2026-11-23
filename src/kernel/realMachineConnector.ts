/**
 * @gos7-header v1.0
 * arquivo: src/kernel/realMachineConnector.ts
 * responsabilidade: Associação real entre processos CAM (8 modos) e máquinas físicas/rede (OPC-UA, Moonraker HTTP, SSH KUKA, GRBL WS, MQTT) sem fallback simulado.
 */
import type {
  CamProductionProgram,
  MachineType,
  PostProcessorFormat,
  RemoteMachineTarget,
} from '../types/cad';
import { CAM_PRODUCTION_PROGRAMS, PROCESS_LABELS } from './camProcessEngine';

export interface MachineProcessCapability {
  machineType: MachineType;
  label: string;
  supportedProtocols: RemoteMachineTarget['protocol'][];
  defaultPostFormat: PostProcessorFormat;
  defaultPortByProtocol: Record<RemoteMachineTarget['protocol'], number>;
}

export const MACHINE_PROCESS_CAPABILITIES: Record<MachineType, MachineProcessCapability> = {
  'cnc-5axis': {
    machineType: 'cnc-5axis',
    label: PROCESS_LABELS['cnc-5axis'],
    supportedProtocols: ['OPC-UA', 'HTTP-Moonraker', 'GRBL-Serial-WS', 'MQTT'],
    defaultPostFormat: 'fanuc-nc',
    defaultPortByProtocol: {
      'OPC-UA': 4840,
      'HTTP-Moonraker': 7125,
      'SSH-KUKA-Bridge': 22,
      'GRBL-Serial-WS': 81,
      MQTT: 1883,
    },
  },
  'cnc-3axis': {
    machineType: 'cnc-3axis',
    label: PROCESS_LABELS['cnc-3axis'],
    supportedProtocols: ['GRBL-Serial-WS', 'HTTP-Moonraker', 'OPC-UA', 'MQTT'],
    defaultPostFormat: 'grbl-gcode',
    defaultPortByProtocol: {
      'OPC-UA': 4840,
      'HTTP-Moonraker': 7125,
      'SSH-KUKA-Bridge': 22,
      'GRBL-Serial-WS': 81,
      MQTT: 1883,
    },
  },
  'robot-6axis': {
    machineType: 'robot-6axis',
    label: PROCESS_LABELS['robot-6axis'],
    supportedProtocols: ['SSH-KUKA-Bridge', 'OPC-UA', 'MQTT'],
    defaultPostFormat: 'kuka-krl',
    defaultPortByProtocol: {
      'OPC-UA': 4840,
      'HTTP-Moonraker': 7125,
      'SSH-KUKA-Bridge': 22,
      'GRBL-Serial-WS': 81,
      MQTT: 1883,
    },
  },
  'powder-metal': {
    machineType: 'powder-metal',
    label: PROCESS_LABELS['powder-metal'],
    supportedProtocols: ['HTTP-Moonraker', 'OPC-UA', 'MQTT'],
    defaultPostFormat: 'slm-powder',
    defaultPortByProtocol: {
      'OPC-UA': 4840,
      'HTTP-Moonraker': 7125,
      'SSH-KUKA-Bridge': 22,
      'GRBL-Serial-WS': 81,
      MQTT: 1883,
    },
  },
  'resin-sla': {
    machineType: 'resin-sla',
    label: PROCESS_LABELS['resin-sla'],
    supportedProtocols: ['HTTP-Moonraker', 'MQTT'],
    defaultPostFormat: 'sla-resin',
    defaultPortByProtocol: {
      'OPC-UA': 4840,
      'HTTP-Moonraker': 7126,
      'SSH-KUKA-Bridge': 22,
      'GRBL-Serial-WS': 81,
      MQTT: 1883,
    },
  },
  'robot-weld': {
    machineType: 'robot-weld',
    label: PROCESS_LABELS['robot-weld'],
    supportedProtocols: ['SSH-KUKA-Bridge', 'OPC-UA', 'MQTT'],
    defaultPostFormat: 'weld-tig-mig',
    defaultPortByProtocol: {
      'OPC-UA': 4840,
      'HTTP-Moonraker': 7125,
      'SSH-KUKA-Bridge': 22,
      'GRBL-Serial-WS': 81,
      MQTT: 1883,
    },
  },
  'laser-cut': {
    machineType: 'laser-cut',
    label: PROCESS_LABELS['laser-cut'],
    supportedProtocols: ['GRBL-Serial-WS', 'HTTP-Moonraker', 'OPC-UA', 'MQTT'],
    defaultPostFormat: 'laser-g',
    defaultPortByProtocol: {
      'OPC-UA': 4840,
      'HTTP-Moonraker': 7125,
      'SSH-KUKA-Bridge': 22,
      'GRBL-Serial-WS': 81,
      MQTT: 1883,
    },
  },
  manual: {
    machineType: 'manual',
    label: PROCESS_LABELS.manual,
    supportedProtocols: ['MQTT', 'HTTP-Moonraker'],
    defaultPostFormat: 'manual-sheet',
    defaultPortByProtocol: {
      'OPC-UA': 4840,
      'HTTP-Moonraker': 7125,
      'SSH-KUKA-Bridge': 22,
      'GRBL-Serial-WS': 81,
      MQTT: 1883,
    },
  },
};

export interface ParsedRealEndpoint {
  valid: boolean;
  scheme: string;
  host: string;
  port: number;
  path: string;
  transport: 'http' | 'tcp';
  reason?: string;
}

const ALLOWED_SCHEMES = new Set(['http:', 'https:', 'ws:', 'wss:', 'opc.tcp:', 'ssh:', 'mqtt:', 'mqtts:']);

export function validateRealMachineEndpoint(
  endpointUrl: string,
  protocol: RemoteMachineTarget['protocol']
): ParsedRealEndpoint {
  const clean = endpointUrl.trim();
  if (!clean) {
    return {
      valid: false,
      scheme: '',
      host: '',
      port: 0,
      path: '',
      transport: 'tcp',
      reason: 'Endpoint da máquina não informado.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return {
      valid: false,
      scheme: '',
      host: '',
      port: 0,
      path: '',
      transport: 'tcp',
      reason: `URL de endpoint inválida: "${clean}"`,
    };
  }

  if (!ALLOWED_SCHEMES.has(parsed.protocol) || !parsed.hostname) {
    return {
      valid: false,
      scheme: parsed.protocol,
      host: parsed.hostname,
      port: 0,
      path: parsed.pathname,
      transport: 'tcp',
      reason: `Protocolo "${parsed.protocol}" ou host ausente no endpoint.`,
    };
  }

  const defaultPorts: Record<string, number> = {
    'http:': protocol === 'HTTP-Moonraker' ? 7125 : 80,
    'https:': 443,
    'ws:': 81,
    'wss:': 443,
    'opc.tcp:': 4840,
    'ssh:': 22,
    'mqtt:': 1883,
    'mqtts:': 8883,
  };

  const port = parsed.port ? Number(parsed.port) : defaultPorts[parsed.protocol];
  const transport = parsed.protocol === 'http:' || parsed.protocol === 'https:' ? 'http' : 'tcp';

  return {
    valid: true,
    scheme: parsed.protocol,
    host: parsed.hostname,
    port,
    path: `${parsed.pathname}${parsed.search}`,
    transport,
  };
}

export function listProgramsCompatibleWithMachine(machineType: MachineType): CamProductionProgram[] {
  return CAM_PRODUCTION_PROGRAMS.filter((p) => p.machineType === machineType);
}

export function resolveMachineProcessAssociation(
  machine: RemoteMachineTarget,
  requestedProgramId?: string
): {
  machineType: MachineType;
  processLabel: string;
  postFormat: PostProcessorFormat;
  assignedProgram?: CamProductionProgram;
  compatiblePrograms: CamProductionProgram[];
  protocolSupported: boolean;
} {
  const cap = MACHINE_PROCESS_CAPABILITIES[machine.machineType];
  const compatiblePrograms = listProgramsCompatibleWithMachine(machine.machineType);
  const candidateId = requestedProgramId ?? machine.assignedProgramId;
  const assignedProgram =
    CAM_PRODUCTION_PROGRAMS.find((p) => p.id === candidateId) ?? compatiblePrograms[0];

  return {
    machineType: machine.machineType,
    processLabel: cap.label,
    postFormat: assignedProgram?.postFormat ?? cap.defaultPostFormat,
    assignedProgram,
    compatiblePrograms,
    protocolSupported: cap.supportedProtocols.includes(machine.protocol),
  };
}
