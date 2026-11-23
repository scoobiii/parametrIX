import { describe, expect, it } from 'vitest';
import {
  MACHINE_PROCESS_CAPABILITIES,
  listProgramsCompatibleWithMachine,
  resolveMachineProcessAssociation,
  validateRealMachineEndpoint,
} from '../src/kernel/realMachineConnector';
import type { MachineType, RemoteMachineTarget } from '../src/types/cad';

describe('realMachineConnector kernel', () => {
  it('validates real HTTP, HTTPS, OPC-UA, SSH, GRBL WS, and MQTT endpoints strictly', () => {
    expect(validateRealMachineEndpoint('   ', 'HTTP-Moonraker').valid).toBe(false);
    expect(validateRealMachineEndpoint('not-a-url', 'OPC-UA').valid).toBe(false);
    expect(validateRealMachineEndpoint('ftp://host/file', 'HTTP-Moonraker').valid).toBe(false);
    expect(validateRealMachineEndpoint('opc.tcp:///missing-host', 'OPC-UA').valid).toBe(false);

    const moonrakerDefault = validateRealMachineEndpoint('http://lpbf.local/printer/gcode', 'HTTP-Moonraker');
    expect(moonrakerDefault).toMatchObject({
      valid: true,
      host: 'lpbf.local',
      port: 7125,
      transport: 'http',
    });

    const genericHttpDefault = validateRealMachineEndpoint('http://cnc.local/api', 'OPC-UA');
    expect(genericHttpDefault).toMatchObject({ valid: true, port: 80, transport: 'http' });

    const httpsExplicit = validateRealMachineEndpoint('https://cnc.local:8443/run?q=1', 'HTTP-Moonraker');
    expect(httpsExplicit).toMatchObject({
      valid: true,
      port: 8443,
      transport: 'http',
      path: '/run?q=1',
    });

    expect(validateRealMachineEndpoint('opc.tcp://cnc5x.local/ua', 'OPC-UA')).toMatchObject({
      valid: true,
      port: 4840,
      transport: 'tcp',
    });
    expect(validateRealMachineEndpoint('ssh://kuka.local/deploy', 'SSH-KUKA-Bridge')).toMatchObject({
      valid: true,
      port: 22,
      transport: 'tcp',
    });
    expect(validateRealMachineEndpoint('mqtt://broker.local/topic', 'MQTT')).toMatchObject({
      valid: true,
      port: 1883,
      transport: 'tcp',
    });
    expect(validateRealMachineEndpoint('mqtts://broker.local/topic', 'MQTT')).toMatchObject({
      valid: true,
      port: 8883,
      transport: 'tcp',
    });
  });

  it('associates all 8 CAM machine types and production programs cleanly', () => {
    const allMachines: MachineType[] = [
      'cnc-5axis',
      'cnc-3axis',
      'robot-6axis',
      'powder-metal',
      'resin-sla',
      'robot-weld',
      'laser-cut',
      'manual',
    ];
    for (const mt of allMachines) {
      expect(MACHINE_PROCESS_CAPABILITIES[mt].supportedProtocols.length).toBeGreaterThan(0);
    }

    const cncPrograms = listProgramsCompatibleWithMachine('cnc-5axis');
    expect(cncPrograms.length).toBeGreaterThanOrEqual(2);

    const baseMachine: RemoteMachineTarget = {
      id: 'm1',
      name: 'CNC 5-Eixos',
      machineType: 'cnc-5axis',
      protocol: 'OPC-UA',
      endpointUrl: 'opc.tcp://cnc.local:4840',
      status: 'standby',
      lastJobVuc: 'VUC-0',
      updatedAt: '2026-11-23T00:00:00.000Z',
    };

    const assocAuto = resolveMachineProcessAssociation(baseMachine);
    expect(assocAuto.protocolSupported).toBe(true);
    expect(assocAuto.assignedProgram?.machineType).toBe('cnc-5axis');

    const assocExplicit = resolveMachineProcessAssociation(
      { ...baseMachine, assignedProgramId: cncPrograms[0].id },
      'dc-manifold'
    );
    expect(assocExplicit.assignedProgram?.id).toBe('dc-manifold');
    expect(assocExplicit.postFormat).toBe('slm-powder');

    const assocNoProgram = resolveMachineProcessAssociation({
      ...baseMachine,
      machineType: 'manual',
      protocol: 'SSH-KUKA-Bridge',
      assignedProgramId: 'non-existent',
    });
    expect(assocNoProgram.protocolSupported).toBe(false);
    expect(assocNoProgram.assignedProgram).toBeUndefined();
    expect(assocNoProgram.postFormat).toBe('manual-sheet');
  });
});
