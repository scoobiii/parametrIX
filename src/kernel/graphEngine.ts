import type {
  CamSettings,
  GraphNode,
  GraphWire,
  ParametricDesignParams,
} from '../types/cad';

export interface GraphTemplate {
  id: string;
  name: string;
  description: string;
  nodes: GraphNode[];
  wires: GraphWire[];
}

export const GRAPH_TEMPLATES: GraphTemplate[] = [
  {
    id: 'tpl-bim-shell',
    name: 'Casca NURBS + Estrutura BIM Waffle',
    description: 'Automação completa de cobertura paramétrica com costelas estruturais e saída CAM.',
    nodes: [
      {
        id: 'n-span',
        type: 'slider',
        title: 'Vão Longitudinal (X)',
        category: 'input',
        x: 40,
        y: 50,
        params: { value: 210, min: 100, max: 320, step: 5, unit: 'mm' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Valor', dataType: 'number' }],
      },
      {
        id: 'n-arch',
        type: 'slider',
        title: 'Altura do Arco',
        category: 'input',
        x: 40,
        y: 205,
        params: { value: 52, min: 10, max: 110, step: 2, unit: 'mm' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Valor', dataType: 'number' }],
      },
      {
        id: 'n-wave',
        type: 'slider',
        title: 'Amplitude Ondulação',
        category: 'input',
        x: 40,
        y: 360,
        params: { value: 16, min: 0, max: 45, step: 1, unit: 'mm' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Valor', dataType: 'number' }],
      },
      {
        id: 'n-nurbs',
        type: 'nurbs_generator',
        title: 'Superfície NURBS Grau 3',
        category: 'nurbs',
        x: 340,
        y: 120,
        params: { preset: 'shell', thicknessMm: 6, uDivisions: 34, vDivisions: 34 },
        inputs: [
          { id: 'spanX', label: 'Vão X', dataType: 'number' },
          { id: 'archHeight', label: 'Arco Z', dataType: 'number' },
          { id: 'waveAmplitude', label: 'Onda', dataType: 'number' },
        ],
        outputs: [{ id: 'surface', label: 'NURBS', dataType: 'surface' }],
      },
      {
        id: 'n-waffle',
        type: 'waffle_bim',
        title: 'Costelas BIM Waffle',
        category: 'bim',
        x: 660,
        y: 70,
        params: { ribCountU: 5, ribCountV: 4, ribHeightMm: 14 },
        inputs: [{ id: 'surface', label: 'Superfície', dataType: 'surface' }],
        outputs: [{ id: 'bim', label: 'IFC Waffle', dataType: 'bim' }],
      },
      {
        id: 'n-cam',
        type: 'cam_toolpath',
        title: 'Toolpath CNC / Robô',
        category: 'cam',
        x: 660,
        y: 265,
        params: { stepoverPct: 24, strategy: 'isoparm' },
        inputs: [{ id: 'surface', label: 'Superfície', dataType: 'surface' }],
        outputs: [{ id: 'toolpath', label: 'G-Code / KRL', dataType: 'toolpath' }],
      },
    ],
    wires: [
      { id: 'w1', fromNodeId: 'n-span', fromPortId: 'val', toNodeId: 'n-nurbs', toPortId: 'spanX' },
      { id: 'w2', fromNodeId: 'n-arch', fromPortId: 'val', toNodeId: 'n-nurbs', toPortId: 'archHeight' },
      { id: 'w3', fromNodeId: 'n-wave', fromPortId: 'val', toNodeId: 'n-nurbs', toPortId: 'waveAmplitude' },
      { id: 'w4', fromNodeId: 'n-nurbs', fromPortId: 'surface', toNodeId: 'n-waffle', toPortId: 'surface' },
      { id: 'w5', fromNodeId: 'n-nurbs', fromPortId: 'surface', toNodeId: 'n-cam', toPortId: 'surface' },
    ],
  },
  {
    id: 'tpl-turbine-5axis',
    name: 'Pá Helicoidal + Usinagem 5-Eixos',
    description: 'Geração de pá aerodinâmica torcida com acabamento isoparamétrico contínuo.',
    nodes: [
      {
        id: 'n-twist',
        type: 'slider',
        title: 'Torção Helicoidal (°)',
        category: 'input',
        x: 40,
        y: 80,
        params: { value: 42, min: -90, max: 90, step: 2, unit: '°' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Valor', dataType: 'number' }],
      },
      {
        id: 'n-arch2',
        type: 'slider',
        title: 'Arqueamento Corda',
        category: 'input',
        x: 40,
        y: 250,
        params: { value: 58, min: 15, max: 100, step: 2, unit: 'mm' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Valor', dataType: 'number' }],
      },
      {
        id: 'n-nurbs2',
        type: 'nurbs_generator',
        title: 'NURBS Aerodinâmica',
        category: 'nurbs',
        x: 340,
        y: 140,
        params: { preset: 'impeller', thicknessMm: 5, uDivisions: 38, vDivisions: 30 },
        inputs: [
          { id: 'twistDeg', label: 'Torção', dataType: 'number' },
          { id: 'archHeight', label: 'Arqueamento', dataType: 'number' },
        ],
        outputs: [{ id: 'surface', label: 'NURBS', dataType: 'surface' }],
      },
      {
        id: 'n-cam2',
        type: 'cam_toolpath',
        title: 'Estratégia 5-Eixos UV',
        category: 'cam',
        x: 660,
        y: 140,
        params: { stepoverPct: 18, strategy: 'isoparm' },
        inputs: [{ id: 'surface', label: 'Superfície', dataType: 'surface' }],
        outputs: [{ id: 'toolpath', label: 'Trajetória', dataType: 'toolpath' }],
      },
    ],
    wires: [
      { id: 'w21', fromNodeId: 'n-twist', fromPortId: 'val', toNodeId: 'n-nurbs2', toPortId: 'twistDeg' },
      { id: 'w22', fromNodeId: 'n-arch2', fromPortId: 'val', toNodeId: 'n-nurbs2', toPortId: 'archHeight' },
      { id: 'w23', fromNodeId: 'n-nurbs2', fromPortId: 'surface', toNodeId: 'n-cam2', toPortId: 'surface' },
    ],
  },
  {
    id: 'tpl-robot-plugin',
    name: 'Molde Cavidade + Robô 6-Eixos',
    description: 'Pipeline com atrator paramétrico por plugin e cinemática inversa robótica.',
    nodes: [
      {
        id: 'n-att',
        type: 'slider',
        title: 'Força Atrator Plugin',
        category: 'input',
        x: 40,
        y: 90,
        params: { value: 18, min: -40, max: 45, step: 2, unit: 'mm' },
        inputs: [],
        outputs: [{ id: 'val', label: 'Valor', dataType: 'number' }],
      },
      {
        id: 'n-nurbs3',
        type: 'nurbs_generator',
        title: 'Molde NURBS Cavidade',
        category: 'nurbs',
        x: 330,
        y: 90,
        params: { preset: 'cavity', thicknessMm: 8, uDivisions: 34, vDivisions: 34 },
        inputs: [{ id: 'attractorStrength', label: 'Atrator', dataType: 'number' }],
        outputs: [{ id: 'surface', label: 'NURBS', dataType: 'surface' }],
      },
      {
        id: 'n-plug3',
        type: 'plugin_modifier',
        title: 'Plugin SDK Modificador',
        category: 'plugin',
        x: 630,
        y: 70,
        params: { gain: 1.0 },
        inputs: [{ id: 'surface', label: 'NURBS', dataType: 'surface' }],
        outputs: [{ id: 'surface', label: 'NURBS Mod', dataType: 'surface' }],
      },
      {
        id: 'n-rob3',
        type: 'robot_kinematics',
        title: 'Cinemática Robô KUKA',
        category: 'cam',
        x: 630,
        y: 250,
        params: { stepoverPct: 22 },
        inputs: [{ id: 'surface', label: 'NURBS', dataType: 'surface' }],
        outputs: [{ id: 'toolpath', label: 'KRL 6-Eixos', dataType: 'toolpath' }],
      },
    ],
    wires: [
      { id: 'w31', fromNodeId: 'n-att', fromPortId: 'val', toNodeId: 'n-nurbs3', toPortId: 'attractorStrength' },
      { id: 'w32', fromNodeId: 'n-nurbs3', fromPortId: 'surface', toNodeId: 'n-plug3', toPortId: 'surface' },
      { id: 'w33', fromNodeId: 'n-plug3', fromPortId: 'surface', toNodeId: 'n-rob3', toPortId: 'surface' },
    ],
  },
];

export interface GraphEvaluationOutput {
  designPatch: Partial<ParametricDesignParams>;
  camPatch: Partial<CamSettings>;
  evalMs: number;
  nodeSummaries: Record<string, string>;
}

/**
 * Evaluates the Grasshopper-style DAG in topological order and maps outputs
 * directly into the parametric NURBS + BIM + CAM engineering state.
 */
export function evaluateGraphPipeline(
  nodes: GraphNode[],
  wires: GraphWire[],
  currentParams: ParametricDesignParams,
  currentCam: CamSettings
): GraphEvaluationOutput {
  const t0 = performance.now();
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, GraphWire[]>();

  for (const n of nodes) {
    inDegree.set(n.id, 0);
    adj.set(n.id, []);
  }
  for (const w of wires) {
    if (nodeMap.has(w.fromNodeId) && nodeMap.has(w.toNodeId)) {
      adj.get(w.fromNodeId)!.push(w);
      inDegree.set(w.toNodeId, inDegree.get(w.toNodeId)! + 1);
    }
  }

  // Kahn's topological sort
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const w of adj.get(id)!) {
      const nextDeg = inDegree.get(w.toNodeId)! - 1;
      inDegree.set(w.toNodeId, nextDeg);
      if (nextDeg === 0) queue.push(w.toNodeId);
    }
  }

  const values = new Map<string, Record<string, unknown>>();
  const designPatch: Partial<ParametricDesignParams> = {};
  const camPatch: Partial<CamSettings> = {};
  const nodeSummaries: Record<string, string> = {};

  for (const id of order) {
    const node = nodeMap.get(id)!;
    const incomingWires = wires.filter((w) => w.toNodeId === id);
    const inputsResolved: Record<string, unknown> = {};
    for (const w of incomingWires) {
      const srcVal = values.get(w.fromNodeId)?.[w.fromPortId];
      if (srcVal !== undefined) {
        inputsResolved[w.toPortId] = srcVal;
      }
    }

    if (node.type === 'slider') {
      const v = Number(node.params.value ?? 0);
      values.set(id, { val: v });
      nodeSummaries[id] = `${v} ${String(node.params.unit ?? '')}`.trim();
    } else if (node.type === 'nurbs_generator') {
      if (typeof inputsResolved.spanX === 'number') designPatch.spanX = inputsResolved.spanX;
      if (typeof inputsResolved.archHeight === 'number')
        designPatch.archHeight = inputsResolved.archHeight;
      if (typeof inputsResolved.waveAmplitude === 'number')
        designPatch.waveAmplitude = inputsResolved.waveAmplitude;
      if (typeof inputsResolved.twistDeg === 'number')
        designPatch.twistDeg = inputsResolved.twistDeg;
      if (typeof inputsResolved.attractorStrength === 'number')
        designPatch.attractorStrength = inputsResolved.attractorStrength;

      if (typeof node.params.preset === 'string') {
        designPatch.preset = node.params.preset as ParametricDesignParams['preset'];
      }
      if (typeof node.params.thicknessMm === 'number') {
        designPatch.thicknessMm = node.params.thicknessMm;
      }
      if (typeof node.params.uDivisions === 'number') {
        designPatch.uDivisions = node.params.uDivisions;
      }
      if (typeof node.params.vDivisions === 'number') {
        designPatch.vDivisions = node.params.vDivisions;
      }

      values.set(id, { surface: { ...currentParams, ...designPatch } });
      nodeSummaries[id] = `${designPatch.uDivisions ?? currentParams.uDivisions}×${
        designPatch.vDivisions ?? currentParams.vDivisions
      } UV`;
    } else if (node.type === 'waffle_bim') {
      const connected = Boolean(inputsResolved.surface);
      if (connected) {
        if (typeof node.params.ribCountU === 'number')
          designPatch.ribCountU = node.params.ribCountU;
        if (typeof node.params.ribCountV === 'number')
          designPatch.ribCountV = node.params.ribCountV;
        if (typeof node.params.ribHeightMm === 'number')
          designPatch.ribHeightMm = node.params.ribHeightMm;
        const totalRibs =
          (designPatch.ribCountU ?? currentParams.ribCountU) +
          (designPatch.ribCountV ?? currentParams.ribCountV);
        values.set(id, { bim: totalRibs });
        nodeSummaries[id] = `${totalRibs} longarinas IFC`;
      } else {
        nodeSummaries[id] = 'Aguardando NURBS';
      }
    } else if (node.type === 'panelize_uv') {
      const connected = Boolean(inputsResolved.surface);
      const u = Number(node.params.panelsU ?? 8);
      const v = Number(node.params.panelsV ?? 6);
      values.set(id, { mesh: u * v });
      nodeSummaries[id] = connected ? `${u * v} painéis` : 'Sem entrada';
    } else if (node.type === 'cam_toolpath') {
      const connected = Boolean(inputsResolved.surface);
      if (connected) {
        if (typeof node.params.stepoverPct === 'number')
          camPatch.stepoverPct = node.params.stepoverPct;
        if (typeof node.params.strategy === 'string')
          camPatch.strategy = node.params.strategy as CamSettings['strategy'];
        values.set(id, { toolpath: true });
        nodeSummaries[id] = `${camPatch.strategy ?? currentCam.strategy} (${
          camPatch.stepoverPct ?? currentCam.stepoverPct
        }%)`;
      } else {
        nodeSummaries[id] = 'Aguardando NURBS';
      }
    } else if (node.type === 'robot_kinematics') {
      const connected = Boolean(inputsResolved.surface);
      if (connected) {
        camPatch.machineType = 'robot-6axis';
        camPatch.postFormat = 'kuka-krl';
        if (typeof node.params.stepoverPct === 'number')
          camPatch.stepoverPct = node.params.stepoverPct;
        values.set(id, { toolpath: true });
        nodeSummaries[id] = 'IK 6-DOF KUKA KRL';
      } else {
        nodeSummaries[id] = 'Aguardando NURBS';
      }
    } else if (node.type === 'plugin_modifier') {
      const connected = Boolean(inputsResolved.surface);
      values.set(id, { surface: inputsResolved.surface });
      nodeSummaries[id] = connected ? 'Ativo no fluxo' : 'Desconectado';
    }
  }

  return {
    designPatch,
    camPatch,
    evalMs: Number((performance.now() - t0).toFixed(2)),
    nodeSummaries,
  };
}
