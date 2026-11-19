import { describe, it, expect } from 'vitest';
import { GRAPH_TEMPLATES, evaluateGraphPipeline } from '../src/kernel/graphEngine';
import type { CamSettings, GraphNode, GraphWire, ParametricDesignParams } from '../src/types/cad';

const baseParams: ParametricDesignParams = {
  preset: 'shell',
  spanX: 200,
  spanY: 160,
  archHeight: 48,
  waveAmplitude: 14,
  twistDeg: 0,
  thicknessMm: 6,
  uDivisions: 32,
  vDivisions: 32,
  ribCountU: 5,
  ribCountV: 4,
  ribHeightMm: 14,
  attractorStrength: 0,
};

const baseCam: CamSettings = {
  machineType: 'cnc-3axis',
  strategy: 'isoparm',
  toolId: 'tool-ball-8',
  stepoverPct: 24,
  stepdownMm: 2,
  stockMarginMm: 0.5,
  safeZMm: 25,
  cutSpeedMultiplier: 1.0,
  postFormat: 'fanuc-nc',
};

describe('graphEngine', () => {
  it('evaluates all predefined GRAPH_TEMPLATES in topological order', () => {
    expect(GRAPH_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    for (const tpl of GRAPH_TEMPLATES) {
      const out = evaluateGraphPipeline(tpl.nodes, tpl.wires, baseParams, baseCam);
      expect(out.evalMs).toBeGreaterThanOrEqual(0);
      expect(Object.keys(out.nodeSummaries).length).toBe(tpl.nodes.length);
    }

    const robotOut = evaluateGraphPipeline(
      GRAPH_TEMPLATES[2].nodes,
      GRAPH_TEMPLATES[2].wires,
      baseParams,
      baseCam
    );
    expect(robotOut.camPatch.machineType).toBe('robot-6axis');
    expect(robotOut.camPatch.postFormat).toBe('kuka-krl');
    expect(robotOut.designPatch.attractorStrength).toBe(18);
  });

  it('covers all node types, connected/disconnected states, and fallback params', () => {
    const nodes: GraphNode[] = [
      {
        id: 's-span',
        type: 'slider',
        title: 'Span',
        category: 'input',
        x: 0,
        y: 0,
        params: { value: 240, unit: 'mm' },
        inputs: [],
        outputs: [{ id: 'val', label: 'v', dataType: 'number' }],
      },
      {
        id: 's-arch',
        type: 'slider',
        title: 'Arch',
        category: 'input',
        x: 0,
        y: 0,
        params: {}, // value undefined -> 0, unit undefined -> ''
        inputs: [],
        outputs: [{ id: 'val', label: 'v', dataType: 'number' }],
      },
      {
        id: 's-wave',
        type: 'slider',
        title: 'Wave',
        category: 'input',
        x: 0,
        y: 0,
        params: { value: 22, unit: 'mm' },
        inputs: [],
        outputs: [{ id: 'val', label: 'v', dataType: 'number' }],
      },
      {
        id: 'nurbs-full',
        type: 'nurbs_generator',
        title: 'NURBS Full',
        category: 'nurbs',
        x: 100,
        y: 0,
        params: { preset: 'diagrid', thicknessMm: 9, uDivisions: 40, vDivisions: 36 },
        inputs: [],
        outputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
      },
      {
        id: 'nurbs-bare',
        type: 'nurbs_generator',
        title: 'NURBS Bare',
        category: 'nurbs',
        x: 100,
        y: 100,
        params: {}, // no params -> fallback to currentParams in summary
        inputs: [],
        outputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
      },
      {
        id: 'waffle-conn',
        type: 'waffle_bim',
        title: 'Waffle Connected',
        category: 'bim',
        x: 200,
        y: 0,
        params: { ribCountU: 6, ribCountV: 5, ribHeightMm: 18 },
        inputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
        outputs: [{ id: 'bim', label: 'b', dataType: 'bim' }],
      },
      {
        id: 'waffle-conn-empty',
        type: 'waffle_bim',
        title: 'Waffle Connected Bare',
        category: 'bim',
        x: 200,
        y: 20,
        params: {}, // no rib params -> fallback to designPatch/currentParams
        inputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
        outputs: [{ id: 'bim', label: 'b', dataType: 'bim' }],
      },
      {
        id: 'waffle-disc',
        type: 'waffle_bim',
        title: 'Waffle Disconnected',
        category: 'bim',
        x: 200,
        y: 50,
        params: {},
        inputs: [],
        outputs: [],
      },
      {
        id: 'pan-conn',
        type: 'panelize_uv',
        title: 'Panelize Connected',
        category: 'bim',
        x: 200,
        y: 100,
        params: { panelsU: 10, panelsV: 8 },
        inputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
        outputs: [],
      },
      {
        id: 'pan-disc',
        type: 'panelize_uv',
        title: 'Panelize Disconnected',
        category: 'bim',
        x: 200,
        y: 150,
        params: {}, // fallback 8 x 6
        inputs: [],
        outputs: [],
      },
      {
        id: 'cam-conn',
        type: 'cam_toolpath',
        title: 'CAM Connected',
        category: 'cam',
        x: 200,
        y: 200,
        params: { stepoverPct: 30, strategy: 'contour' },
        inputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
        outputs: [],
      },
      {
        id: 'cam-conn-bare',
        type: 'cam_toolpath',
        title: 'CAM Connected Bare',
        category: 'cam',
        x: 200,
        y: 220,
        params: {},
        inputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
        outputs: [],
      },
      {
        id: 'cam-disc',
        type: 'cam_toolpath',
        title: 'CAM Disconnected',
        category: 'cam',
        x: 200,
        y: 250,
        params: {},
        inputs: [],
        outputs: [],
      },
      {
        id: 'rob-disc',
        type: 'robot_kinematics',
        title: 'Robot Disconnected',
        category: 'cam',
        x: 200,
        y: 300,
        params: {},
        inputs: [],
        outputs: [],
      },
      {
        id: 'rob-conn-bare',
        type: 'robot_kinematics',
        title: 'Robot Connected Bare',
        category: 'cam',
        x: 200,
        y: 320,
        params: {},
        inputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
        outputs: [],
      },
      {
        id: 'plug-disc',
        type: 'plugin_modifier',
        title: 'Plugin Disconnected',
        category: 'plugin',
        x: 200,
        y: 350,
        params: {},
        inputs: [],
        outputs: [],
      },
      {
        id: 'unknown-type',
        type: 'custom_unknown' as GraphNode['type'],
        title: 'Unknown',
        category: 'plugin',
        x: 200,
        y: 400,
        params: {},
        inputs: [],
        outputs: [],
      },
    ];

    const wires: GraphWire[] = [
      { id: 'w1', fromNodeId: 's-span', fromPortId: 'val', toNodeId: 'nurbs-full', toPortId: 'spanX' },
      { id: 'w2', fromNodeId: 's-arch', fromPortId: 'val', toNodeId: 'nurbs-full', toPortId: 'archHeight' },
      { id: 'w3', fromNodeId: 's-wave', fromPortId: 'val', toNodeId: 'nurbs-full', toPortId: 'waveAmplitude' },
      { id: 'w4', fromNodeId: 'nurbs-full', fromPortId: 'surface', toNodeId: 'waffle-conn', toPortId: 'surface' },
      { id: 'w5', fromNodeId: 'nurbs-bare', fromPortId: 'surface', toNodeId: 'waffle-conn-empty', toPortId: 'surface' },
      { id: 'w6', fromNodeId: 'nurbs-full', fromPortId: 'surface', toNodeId: 'pan-conn', toPortId: 'surface' },
      { id: 'w7', fromNodeId: 'nurbs-full', fromPortId: 'surface', toNodeId: 'cam-conn', toPortId: 'surface' },
      { id: 'w8', fromNodeId: 'nurbs-bare', fromPortId: 'surface', toNodeId: 'cam-conn-bare', toPortId: 'surface' },
      { id: 'w9', fromNodeId: 'nurbs-bare', fromPortId: 'surface', toNodeId: 'rob-conn-bare', toPortId: 'surface' },
      // Wire from non-existent node / missing port should be safely ignored
      { id: 'w-ghost', fromNodeId: 'missing', fromPortId: 'val', toNodeId: 'nurbs-bare', toPortId: 'spanX' },
      { id: 'w-missing-port', fromNodeId: 's-span', fromPortId: 'nonexistent', toNodeId: 'nurbs-bare', toPortId: 'spanX' },
    ];

    const out = evaluateGraphPipeline(nodes, wires, baseParams, baseCam);
    expect(out.nodeSummaries['s-arch']).toBe('0');
    expect(out.nodeSummaries['nurbs-bare']).toBe('32×32 UV');
    expect(out.nodeSummaries['waffle-conn']).toBe('11 longarinas IFC');
    expect(out.nodeSummaries['waffle-disc']).toBe('Aguardando NURBS');
    expect(out.nodeSummaries['pan-conn']).toBe('80 painéis');
    expect(out.nodeSummaries['pan-disc']).toBe('Sem entrada');
    expect(out.nodeSummaries['cam-conn']).toBe('contour (30%)');
    expect(out.nodeSummaries['cam-disc']).toBe('Aguardando NURBS');
    expect(out.nodeSummaries['rob-disc']).toBe('Aguardando NURBS');
    expect(out.nodeSummaries['rob-conn-bare']).toBe('IK 6-DOF KUKA KRL');
    expect(out.nodeSummaries['plug-disc']).toBe('Desconectado');
  });

  it('uses currentParams fallback when nurbs_generator has no prior patches', () => {
    const out = evaluateGraphPipeline(
      [
        {
          id: 'n-only',
          type: 'nurbs_generator',
          title: 'Only',
          category: 'nurbs',
          x: 0,
          y: 0,
          params: {},
          inputs: [],
          outputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
        },
        {
          id: 'w-only',
          type: 'waffle_bim',
          title: 'WOnly',
          category: 'bim',
          x: 100,
          y: 0,
          params: {},
          inputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
          outputs: [],
        },
        {
          id: 'c-only',
          type: 'cam_toolpath',
          title: 'COnly',
          category: 'cam',
          x: 100,
          y: 50,
          params: {},
          inputs: [{ id: 'surface', label: 's', dataType: 'surface' }],
          outputs: [],
        },
      ],
      [
        { id: 'w1', fromNodeId: 'n-only', fromPortId: 'surface', toNodeId: 'w-only', toPortId: 'surface' },
        { id: 'w2', fromNodeId: 'n-only', fromPortId: 'surface', toNodeId: 'c-only', toPortId: 'surface' },
      ],
      baseParams,
      baseCam
    );

    expect(out.nodeSummaries['n-only']).toBe('32×32 UV');
    expect(out.nodeSummaries['w-only']).toBe('9 longarinas IFC');
    expect(out.nodeSummaries['c-only']).toBe('isoparm (24%)');
  });
});
