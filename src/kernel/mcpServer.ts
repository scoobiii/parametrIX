import type {
  ApplicationSegment,
  CadComponentPart,
  CamSettings,
  EvaluatedMesh,
  FeaComparisonReport,
  FeaResult,
  FeaSettings,
  MaterialFinish,
  McpExecutionLog,
  McpToolDefinition,
  NurbsSurfaceData,
  ParametricDesignParams,
  PartEngineeringProfile,
  SessionDeliverable,
  ToolpathResult,
  ViewportDisplayState,
} from '../types/cad';
import type { OptimizationObjective } from './structuralFea';

const ALL_SEGMENTS: ApplicationSegment[] = [
  'ciclismo-mobilidade',
  'automotivo',
  'aeroespacial',
  'arquitetura-bim',
  'industrial-cnc',
  'robotica',
  'medico',
];

export const MCP_TOOLS_CATALOG: McpToolDefinition[] = [
  {
    name: 'cad_detect_part_context',
    category: 'Geometria',
    segments: ALL_SEGMENTS,
    description:
      'Inspeciona a identidade de engenharia da peça/conjunto ativo (fabricante, modelo, especificações, certificações, uso e subcomponentes classificados).',
    inputSchema: { type: 'object', properties: {} },
    exampleArgs: {},
  },
  {
    name: 'cad_set_segment_profile',
    category: 'FEA / Otimização',
    segments: ALL_SEGMENTS,
    description:
      'Seleciona o segmento de aplicação (ciclismo-mobilidade, automotivo, aeroespacial, arquitetura-bim, industrial-cnc, robotica, medico) aplicando normas e critérios de segurança.',
    inputSchema: {
      type: 'object',
      required: ['segment'],
      properties: {
        segment: { type: 'string', enum: ALL_SEGMENTS },
        partName: { type: 'string' },
        manufacturer: { type: 'string' },
        intendedUse: { type: 'string' },
      },
    },
    exampleArgs: {
      segment: 'ciclismo-mobilidade',
    },
  },
  {
    name: 'cad_explode_assembly',
    category: 'Geometria',
    segments: ALL_SEGMENTS,
    description:
      'Aplica vista explodida estilo GrabCAD no conjunto 3D (explodeFactor de 0.0 a 1.0) separando subcomponentes e nervuras.',
    inputSchema: {
      type: 'object',
      required: ['explodeFactor'],
      properties: {
        explodeFactor: { type: 'number', minimum: 0, maximum: 1 },
      },
    },
    exampleArgs: {
      explodeFactor: 0.65,
    },
  },
  {
    name: 'cad_rotate_component',
    category: 'Geometria',
    segments: ALL_SEGMENTS,
    description:
      'Rotaciona o conjunto ("assembly") ou um componente específico (ex: "COMP-1") nos eixos X, Y e Z em graus.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', default: 'assembly' },
        rx: { type: 'number', minimum: -180, maximum: 180 },
        ry: { type: 'number', minimum: -180, maximum: 180 },
        rz: { type: 'number', minimum: -180, maximum: 180 },
      },
    },
    exampleArgs: {
      componentId: 'assembly',
      rx: 0,
      ry: 45,
      rz: 0,
    },
  },
  {
    name: 'cad_set_component_material',
    category: 'Geometria',
    segments: ALL_SEGMENTS,
    description:
      'Altera o acabamento PBR de um componente individual ou ativa a renderização por componente / máscara de objetos.',
    inputSchema: {
      type: 'object',
      properties: {
        componentId: { type: 'string', default: 'all' },
        materialFinish: {
          type: 'string',
          enum: [
            'aluminum',
            'titanium',
            'clay',
            'oak',
            'glass',
            'carbon-fiber',
            'matte-plastic',
          ],
        },
        mode: {
          type: 'string',
          enum: ['component-pbr', 'object-mask', 'solid', 'stress-heatmap'],
        },
      },
    },
    exampleArgs: {
      componentId: 'COMP-1',
      materialFinish: 'carbon-fiber',
      mode: 'component-pbr',
    },
  },
  {
    name: 'cad_set_parametric_params',
    category: 'Geometria',
    segments: ['arquitetura-bim', 'aeroespacial', 'industrial-cnc', 'medico'],
    description:
      'Atualiza parâmetros da superfície NURBS (tipologia, vão X/Y, flecha Z, amplitude de onda, torção, espessura, nervuras BIM) e recalcula a malha sólida.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: {
          type: 'string',
          enum: ['shell', 'impeller', 'cavity', 'diagrid'],
        },
        spanX: { type: 'number', minimum: 100, maximum: 320 },
        spanY: { type: 'number', minimum: 80, maximum: 240 },
        archHeight: { type: 'number', minimum: 10, maximum: 110 },
        waveAmplitude: { type: 'number', minimum: 0, maximum: 45 },
        twistDeg: { type: 'number', minimum: -90, maximum: 90 },
        thicknessMm: { type: 'number', minimum: 1, maximum: 20 },
        ribCountU: { type: 'number', minimum: 0, maximum: 10 },
        ribCountV: { type: 'number', minimum: 0, maximum: 10 },
        ribHeightMm: { type: 'number', minimum: 4, maximum: 40 },
      },
    },
    exampleArgs: {
      preset: 'impeller',
      archHeight: 64,
      twistDeg: 38,
      thicknessMm: 5,
    },
  },
  {
    name: 'cad_isolate_part',
    category: 'Geometria',
    segments: ALL_SEGMENTS,
    description:
      'Isola uma peça específica ou subconjunto na viewport 3D ("all", "shell", "ribs-u", "ribs-v", "imported", "BIM-U-1", "COMP-1" ou nome do componente).',
    inputSchema: {
      type: 'object',
      required: ['partId'],
      properties: {
        partId: {
          type: 'string',
          description: 'ID ou nome da peça a isolar.',
        },
      },
    },
    exampleArgs: {
      partId: 'COMP-1',
    },
  },
  {
    name: 'cad_evaluate_nurbs_metrics',
    category: 'Geometria',
    segments: ['arquitetura-bim', 'aeroespacial', 'industrial-cnc'],
    description:
      'Inspeciona graus UV, pontos de controle, caixa envoltória (mm), área superficial (cm²), volume (cm³) e lista estrutural BIM Waffle.',
    inputSchema: {
      type: 'object',
      properties: {
        includeBimBom: { type: 'boolean', default: true },
      },
    },
    exampleArgs: {
      includeBimBom: true,
    },
  },
  {
    name: 'cad_set_material_finish',
    category: 'Geometria',
    segments: ALL_SEGMENTS,
    description:
      'Alterna o acabamento PBR do shader 3D ou modo (solid, component-pbr, object-mask, wireframe, zebra, curvature, stress-heatmap, xray).',
    inputSchema: {
      type: 'object',
      properties: {
        materialFinish: {
          type: 'string',
          enum: [
            'aluminum',
            'titanium',
            'clay',
            'oak',
            'glass',
            'carbon-fiber',
            'matte-plastic',
          ],
        },
        mode: {
          type: 'string',
          enum: [
            'solid',
            'component-pbr',
            'object-mask',
            'wireframe',
            'zebra',
            'curvature',
            'stress-heatmap',
            'xray',
          ],
        },
      },
    },
    exampleArgs: {
      materialFinish: 'carbon-fiber',
      mode: 'component-pbr',
    },
  },
  {
    name: 'cad_run_structural_fea',
    category: 'FEA / Otimização',
    segments: ALL_SEGMENTS,
    description:
      'Executa cálculo de resistência estrutural (tensão equivalente de Von Mises em MPa, deflexão máxima em mm, fator de segurança e conformidade normativa) ativando o mapa de calor 3D.',
    inputSchema: {
      type: 'object',
      properties: {
        loadNewtons: { type: 'number', minimum: 100, maximum: 50000 },
        supportMode: {
          type: 'string',
          enum: ['edge-clamped', 'four-corner-pins', 'cantilever-u'],
        },
        loadPattern: {
          type: 'string',
          enum: ['uniform-pressure', 'center-point', 'torsion-tip'],
        },
        showHeatmap: { type: 'boolean', default: true },
      },
    },
    exampleArgs: {
      loadNewtons: 5400,
      supportMode: 'four-corner-pins',
      loadPattern: 'torsion-tip',
      showHeatmap: true,
    },
  },
  {
    name: 'cad_generate_optimized_geometry',
    category: 'FEA / Otimização',
    segments: ALL_SEGMENTS,
    description:
      'Após analisar a geometria atual (Antes), gera nova geometria otimizada e compara a resistência estrutural Antes vs Depois com mapa de calor de estresse e conformidade de certificação.',
    inputSchema: {
      type: 'object',
      properties: {
        objective: {
          type: 'string',
          enum: ['minimize-stress', 'minimize-mass', 'balanced'],
        },
        targetSafetyFactor: { type: 'number', minimum: 1.2, maximum: 6.0 },
      },
    },
    exampleArgs: {
      objective: 'minimize-stress',
      targetSafetyFactor: 2.5,
    },
  },
  {
    name: 'cad_generate_cam_toolpath',
    category: 'CAM',
    segments: ['industrial-cnc', 'automotivo', 'aeroespacial', 'robotica', 'medico'],
    description:
      'Configura máquina (manual, cnc-3axis, cnc-5axis, robot-6axis) e estratégia CAM, retornando RPM, avanço, tempo de ciclo e trecho de código pós-processado.',
    inputSchema: {
      type: 'object',
      properties: {
        machineType: {
          type: 'string',
          enum: ['manual', 'cnc-3axis', 'cnc-5axis', 'robot-6axis'],
        },
        strategy: {
          type: 'string',
          enum: ['raster', 'isoparm', 'contour'],
        },
        stepoverPct: { type: 'number', minimum: 10, maximum: 60 },
      },
    },
    exampleArgs: {
      machineType: 'robot-6axis',
      strategy: 'isoparm',
      stepoverPct: 22,
    },
  },
  {
    name: 'cad_export_deliverable',
    category: 'CAM',
    segments: ALL_SEGMENTS,
    description:
      'Exporta e baixa um artefato de engenharia (.3dm, .stl, .dxf, .nc, .src), podendo exportar o conjunto completo ou apenas a peça isolada.',
    inputSchema: {
      type: 'object',
      required: ['format'],
      properties: {
        format: {
          type: 'string',
          enum: ['3dm', 'stl', 'dxf', 'nc', 'src'],
        },
        scope: {
          type: 'string',
          enum: ['assembly', 'isolated'],
        },
      },
    },
    exampleArgs: {
      format: 'stl',
      scope: 'isolated',
    },
  },
  {
    name: 'cad_run_plugin_script',
    category: 'Plugins',
    segments: ['industrial-cnc', 'aeroespacial', 'arquitetura-bim', 'robotica'],
    description:
      'Registra ou executa um script JavaScript de extensão sobre a grade de pontos de controle NURBS em sandbox.',
    inputSchema: {
      type: 'object',
      required: ['name', 'code'],
      properties: {
        name: { type: 'string' },
        code: { type: 'string' },
      },
    },
    exampleArgs: {
      name: 'MCP Ondulação Senoidal',
      code: 'for (let u=0; u<surface.uCount; u++) { for (let v=0; v<surface.vCount; v++) { surface.controlPoints[u][v].y += Math.sin(u * 0.9) * 8; } }\nreturn { summary: "Deformação MCP aplicada" };',
    },
  },
  {
    name: 'session_get_deliverables_summary',
    category: 'Sessão',
    segments: ALL_SEGMENTS,
    description:
      'Retorna o tempo decorrido da sessão, estado paramétrico atual, FEA ativo e todos os entregáveis gerados até o momento.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    exampleArgs: {},
  },
];

export interface McpRuntimeContext {
  designParams: ParametricDesignParams;
  surface: NurbsSurfaceData;
  meshData: EvaluatedMesh;
  camSettings: CamSettings;
  toolpath: ToolpathResult;
  display: ViewportDisplayState;
  feaSettings: FeaSettings;
  feaResult: FeaResult;
  feaComparison: FeaComparisonReport | null;
  activeSegment: ApplicationSegment;
  partProfile: PartEngineeringProfile;
  components: CadComponentPart[];
  sessionSeconds: number;
  deliverables: SessionDeliverable[];
  onUpdateDesignParams: (patch: Partial<ParametricDesignParams>) => void;
  onUpdateDisplay: (patch: Partial<ViewportDisplayState>) => void;
  onUpdateCamSettings: (patch: Partial<CamSettings>) => void;
  onSetSegment: (segment: ApplicationSegment) => void;
  onUpdatePartProfile: (patch: Partial<PartEngineeringProfile>) => void;
  onRunFea: (patch?: Partial<FeaSettings>, activateHeatmap?: boolean) => FeaResult;
  onGenerateOptimizedGeometry: (
    objective: OptimizationObjective,
    targetSafetyFactor?: number
  ) => FeaComparisonReport;
  onExportFormat: (
    fmt: '3dm' | 'stl' | 'dxf' | 'nc' | 'src',
    scope?: 'assembly' | 'isolated'
  ) => string;
  onRegisterAndRunPlugin: (name: string, code: string) => void;
}

export function executeMcpToolCall(
  toolName: string,
  args: Record<string, unknown>,
  ctx: McpRuntimeContext
): McpExecutionLog {
  const t0 = performance.now();
  const id = `mcp-${Date.now()}`;
  const reqEnvelope = {
    jsonrpc: '2.0',
    id,
    method: toolName === 'tools/list' ? 'tools/list' : 'tools/call',
    params: toolName === 'tools/list' ? {} : { name: toolName, arguments: args },
  };

  try {
    let resultPayload: unknown;

    if (toolName === 'tools/list') {
      resultPayload = {
        activeSegment: ctx.activeSegment,
        tools: MCP_TOOLS_CATALOG.map((t) => ({
          name: t.name,
          category: t.category,
          segments: t.segments,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      };
    } else if (toolName === 'cad_detect_part_context') {
      resultPayload = {
        activeSegment: ctx.activeSegment,
        partProfile: ctx.partProfile,
        components: ctx.components.map((c) => ({
          id: c.id,
          name: c.name,
          family: c.family,
          subFamily: c.subFamily,
          maskColorHex: c.maskColorHex,
          material: ctx.display.componentMaterials[c.id] ?? c.inferredMaterial,
          triangleCount: c.triangleCount,
        })),
      };
    } else if (toolName === 'cad_set_segment_profile') {
      const segment = String(args.segment ?? ctx.activeSegment) as ApplicationSegment;
      ctx.onSetSegment(segment);
      const profilePatch: Partial<PartEngineeringProfile> = { segment };
      if (typeof args.partName === 'string' && args.partName.trim()) {
        profilePatch.partName = args.partName.trim();
      }
      if (typeof args.manufacturer === 'string' && args.manufacturer.trim()) {
        profilePatch.manufacturer = args.manufacturer.trim();
      }
      if (typeof args.intendedUse === 'string' && args.intendedUse.trim()) {
        profilePatch.intendedUse = args.intendedUse.trim();
      }
      ctx.onUpdatePartProfile(profilePatch);
      resultPayload = {
        appliedSegment: segment,
        updatedProfile: { ...ctx.partProfile, ...profilePatch },
        applicableTools: MCP_TOOLS_CATALOG.filter(
          (t) => !t.segments || t.segments.includes(segment)
        ).map((t) => t.name),
      };
    } else if (toolName === 'cad_explode_assembly') {
      const factor = Math.max(0, Math.min(1, Number(args.explodeFactor ?? 0.6)));
      ctx.onUpdateDisplay({ explodeFactor: factor });
      resultPayload = {
        explodeFactor: factor,
        componentsCount: ctx.components.length,
        status: `Vista explodida ajustada para ${Math.round(factor * 100)}%.`,
      };
    } else if (toolName === 'cad_rotate_component') {
      const target = String(args.componentId ?? 'assembly').trim() || 'assembly';
      const rx = Number(args.rx ?? 0);
      const ry = Number(args.ry ?? 0);
      const rz = Number(args.rz ?? 0);
      if (target === 'assembly' || target === 'all') {
        ctx.onUpdateDisplay({ assemblyRotationDeg: [rx, ry, rz] });
      } else {
        ctx.onUpdateDisplay({
          selectedComponentId: target,
          componentRotations: {
            ...ctx.display.componentRotations,
            [target]: [rx, ry, rz],
          },
        });
      }
      resultPayload = {
        componentId: target,
        rotationDeg: [rx, ry, rz],
        status: `Rotação aplicada a ${target}.`,
      };
    } else if (toolName === 'cad_set_component_material') {
      const compId = String(args.componentId ?? 'all').trim() || 'all';
      const finish = (args.materialFinish as MaterialFinish | undefined) ?? 'aluminum';
      const modePatch = typeof args.mode === 'string' ? (args.mode as ViewportDisplayState['mode']) : 'component-pbr';

      if (compId === 'all') {
        ctx.onUpdateDisplay({
          materialFinish: finish,
          mode: modePatch,
        });
      } else {
        ctx.onUpdateDisplay({
          selectedComponentId: compId,
          mode: modePatch,
          perComponentPbr: true,
          componentMaterials: {
            ...ctx.display.componentMaterials,
            [compId]: finish,
          },
        });
      }
      resultPayload = {
        componentId: compId,
        materialFinish: finish,
        mode: modePatch,
        status: `Material ${finish} aplicado ao componente ${compId}.`,
      };
    } else if (toolName === 'cad_set_parametric_params') {
      const patch: Partial<ParametricDesignParams> = {};
      if (typeof args.preset === 'string') {
        patch.preset = args.preset as ParametricDesignParams['preset'];
      }
      if (typeof args.spanX === 'number') patch.spanX = args.spanX;
      if (typeof args.spanY === 'number') patch.spanY = args.spanY;
      if (typeof args.archHeight === 'number') patch.archHeight = args.archHeight;
      if (typeof args.waveAmplitude === 'number') patch.waveAmplitude = args.waveAmplitude;
      if (typeof args.twistDeg === 'number') patch.twistDeg = args.twistDeg;
      if (typeof args.thicknessMm === 'number') patch.thicknessMm = args.thicknessMm;
      if (typeof args.ribCountU === 'number') patch.ribCountU = args.ribCountU;
      if (typeof args.ribCountV === 'number') patch.ribCountV = args.ribCountV;
      if (typeof args.ribHeightMm === 'number') patch.ribHeightMm = args.ribHeightMm;
      ctx.onUpdateDesignParams(patch);
      resultPayload = {
        updated: patch,
        status: 'Parâmetros aplicados ao kernel NURBS em tempo real.',
      };
    } else if (toolName === 'cad_isolate_part') {
      const rawQuery = String(args.partId ?? 'all').trim() || 'all';
      const matchedComp = ctx.components.find(
        (c) =>
          c.id.toLowerCase() === rawQuery.toLowerCase() ||
          c.name.toLowerCase().includes(rawQuery.toLowerCase()) ||
          c.subFamily.toLowerCase().includes(rawQuery.toLowerCase())
      );
      const resolvedId = matchedComp ? matchedComp.id : rawQuery;
      ctx.onUpdateDisplay({
        isolationTarget: resolvedId,
        selectedComponentId: resolvedId === 'all' ? null : resolvedId,
        fitViewTrigger: ctx.display.fitViewTrigger + 1,
      });
      const matchedRib = ctx.meshData.bimElements.find((b) => b.id === resolvedId);
      resultPayload = {
        isolationTarget: resolvedId,
        matchedPartLabel: matchedComp
          ? `${matchedComp.name} (${matchedComp.family} · ${matchedComp.subFamily})`
          : matchedRib
            ? `${matchedRib.label} (${matchedRib.ifcClass})`
            : resolvedId === 'shell'
              ? 'Casca NURBS Principal'
              : resolvedId === 'all'
                ? 'Conjunto Completo Restaurado'
                : resolvedId,
        availableParts: [
          'all',
          ...ctx.components.map((c) => `${c.id} (${c.name})`),
          ...ctx.meshData.bimElements.map((b) => b.id),
        ],
      };
    } else if (toolName === 'cad_evaluate_nurbs_metrics') {
      const includeBim = args.includeBimBom !== false;
      resultPayload = {
        surfaceName: ctx.surface.name,
        isolationTarget: ctx.display.isolationTarget,
        degreeUV: [ctx.surface.degreeU, ctx.surface.degreeV],
        controlGrid: `${ctx.surface.uCount}x${ctx.surface.vCount}`,
        triangleCount: ctx.meshData.triangleCount,
        surfaceAreaCm2: ctx.meshData.surfaceAreaCm2,
        volumeCm3: ctx.meshData.volumeCm3,
        boundingBoxMm: ctx.meshData.boundingBox.size.map((n) => Number(n.toFixed(2))),
        bimElements: includeBim ? ctx.meshData.bimElements : undefined,
      };
    } else if (toolName === 'cad_set_material_finish') {
      const patch: Partial<ViewportDisplayState> = {};
      if (typeof args.materialFinish === 'string') {
        patch.materialFinish = args.materialFinish as ViewportDisplayState['materialFinish'];
      }
      if (typeof args.mode === 'string') {
        patch.mode = args.mode as ViewportDisplayState['mode'];
      }
      ctx.onUpdateDisplay(patch);
      resultPayload = {
        applied: patch,
        message: 'Estado visual da viewport 3D atualizado.',
      };
    } else if (toolName === 'cad_run_structural_fea') {
      const patch: Partial<FeaSettings> = {};
      if (typeof args.loadNewtons === 'number') patch.loadNewtons = args.loadNewtons;
      if (typeof args.supportMode === 'string') {
        patch.supportMode = args.supportMode as FeaSettings['supportMode'];
      }
      if (typeof args.loadPattern === 'string') {
        patch.loadPattern = args.loadPattern as FeaSettings['loadPattern'];
      }
      const activateHeatmap = args.showHeatmap !== false;
      const fea = ctx.onRunFea(patch, activateHeatmap);
      resultPayload = {
        partProfile: ctx.partProfile.partName,
        certifications: ctx.partProfile.certifications,
        complianceNote: fea.complianceNote,
        material: fea.materialName,
        yieldStrengthMpa: fea.yieldStrengthMpa,
        loadNewtons: fea.loadNewtons,
        supportMode: fea.supportMode,
        isolatedScope: fea.isolatedScope,
        maxStressMpa: fea.maxStressMpa,
        meanStressMpa: fea.meanStressMpa,
        maxDeflectionMm: fea.maxDeflectionMm,
        safetyFactor: fea.safetyFactor,
        totalMassKg: fea.totalMassKg,
        status: fea.status,
        criticalLocationMm: fea.criticalLocationMm,
        topStressedElements: fea.elementStresses.slice(0, 6),
        heatmapActivated: activateHeatmap,
      };
    } else if (toolName === 'cad_generate_optimized_geometry') {
      const objective = (
        typeof args.objective === 'string' ? args.objective : 'balanced'
      ) as OptimizationObjective;
      const targetSf =
        typeof args.targetSafetyFactor === 'number' ? args.targetSafetyFactor : undefined;
      const report = ctx.onGenerateOptimizedGeometry(objective, targetSf);
      resultPayload = {
        partProfile: ctx.partProfile.partName,
        certifications: ctx.partProfile.certifications,
        strategySummary: report.strategySummary,
        certificationPassedBefore: report.certificationPassedBefore,
        certificationPassedAfter: report.certificationPassedAfter,
        before: {
          maxStressMpa: report.before.maxStressMpa,
          maxDeflectionMm: report.before.maxDeflectionMm,
          safetyFactor: report.before.safetyFactor,
          totalMassKg: report.before.totalMassKg,
          status: report.before.status,
          complianceNote: report.before.complianceNote,
        },
        after: {
          maxStressMpa: report.after.maxStressMpa,
          maxDeflectionMm: report.after.maxDeflectionMm,
          safetyFactor: report.after.safetyFactor,
          totalMassKg: report.after.totalMassKg,
          status: report.after.status,
          complianceNote: report.after.complianceNote,
        },
        deltasPct: {
          stressDeltaPct: report.stressDeltaPct,
          deflectionDeltaPct: report.deflectionDeltaPct,
          safetyFactorDeltaPct: report.safetyFactorDeltaPct,
          massDeltaPct: report.massDeltaPct,
        },
        newParams: report.afterParams,
      };
    } else if (toolName === 'cad_generate_cam_toolpath') {
      const patch: Partial<CamSettings> = {};
      if (typeof args.machineType === 'string') {
        patch.machineType = args.machineType as CamSettings['machineType'];
        if (patch.machineType === 'robot-6axis') patch.postFormat = 'kuka-krl';
        else if (patch.machineType === 'manual') patch.postFormat = 'manual-sheet';
        else patch.postFormat = 'fanuc-nc';
      }
      if (typeof args.strategy === 'string') {
        patch.strategy = args.strategy as CamSettings['strategy'];
      }
      if (typeof args.stepoverPct === 'number') {
        patch.stepoverPct = args.stepoverPct;
      }
      ctx.onUpdateCamSettings(patch);
      resultPayload = {
        appliedSettings: { ...ctx.camSettings, ...patch },
        spindleRpm: ctx.toolpath.spindleRpm,
        feedRateMmMin: ctx.toolpath.feedRateMmMin,
        cuttingLengthMm: ctx.toolpath.cuttingLengthMm,
        estimatedMinutes: ctx.toolpath.estimatedMinutes,
        previewLines: ctx.toolpath.postCode.split('\n').slice(0, 14),
      };
    } else if (toolName === 'cad_export_deliverable') {
      const fmt = String(args.format ?? 'stl') as '3dm' | 'stl' | 'dxf' | 'nc' | 'src';
      const scope = (
        typeof args.scope === 'string'
          ? args.scope
          : ctx.display.isolationTarget !== 'all'
            ? 'isolated'
            : 'assembly'
      ) as 'assembly' | 'isolated';
      const filename = ctx.onExportFormat(fmt, scope);
      resultPayload = {
        exported: true,
        filename,
        format: fmt.toUpperCase(),
        scope,
        isolationTarget: ctx.display.isolationTarget,
      };
    } else if (toolName === 'cad_run_plugin_script') {
      const name = String(args.name ?? 'Plugin via MCP');
      const code = String(args.code ?? '');
      if (!code.trim()) throw new Error('Parâmetro "code" obrigatório.');
      ctx.onRegisterAndRunPlugin(name, code);
      resultPayload = {
        registeredPlugin: name,
        executed: true,
      };
    } else if (toolName === 'session_get_deliverables_summary') {
      resultPayload = {
        sessionElapsedSeconds: ctx.sessionSeconds,
        activeModel: ctx.partProfile.partName || ctx.surface.name,
        activeSegment: ctx.activeSegment,
        isolationTarget: ctx.display.isolationTarget,
        feaSummary: {
          maxStressMpa: ctx.feaResult.maxStressMpa,
          safetyFactor: ctx.feaResult.safetyFactor,
          status: ctx.feaResult.status,
          complianceNote: ctx.feaResult.complianceNote,
        },
        deliverablesCount: ctx.deliverables.length,
        deliverables: ctx.deliverables,
      };
    } else {
      throw new Error(`Ferramenta MCP desconhecida: ${toolName}`);
    }

    const durationMs = Number((performance.now() - t0).toFixed(2));
    return {
      id,
      toolName,
      requestJson: JSON.stringify(reqEnvelope, null, 2),
      responseJson: JSON.stringify(
        {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(resultPayload, null, 2) }],
          },
        },
        null,
        2
      ),
      durationMs,
      status: 'ok',
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    };
  } catch (err) {
    const durationMs = Number((performance.now() - t0).toFixed(2));
    const msg = err instanceof Error ? err.message : String(err);
    return {
      id,
      toolName,
      requestJson: JSON.stringify(reqEnvelope, null, 2),
      responseJson: JSON.stringify(
        {
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: msg },
        },
        null,
        2
      ),
      durationMs,
      status: 'error',
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    };
  }
}

export function buildLocalIcsCalendarBlob(
  sessionSeconds: number,
  surfaceName: string,
  deliverables: SessionDeliverable[]
): Blob {
  const now = new Date();
  const start = new Date(now.getTime() - sessionSeconds * 1000);
  const fmtIcs = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const mins = Math.max(1, Math.round(sessionSeconds / 60));
  const delivText =
    deliverables.length > 0
      ? deliverables.map((d) => `- ${d.filename} (${d.kind}): ${d.summary}`).join('\\n')
      : 'Nenhum artefato exportado ainda nesta sessão.';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Parametrix CAD Studio//Session Summary//PT',
    'BEGIN:VEVENT',
    `UID:parametrix-${now.getTime()}@local`,
    `DTSTAMP:${fmtIcs(now)}`,
    `DTSTART:${fmtIcs(start)}`,
    `DTEND:${fmtIcs(now)}`,
    `SUMMARY:Sessao CAD Parametrix - ${surfaceName}`,
    `DESCRIPTION:Duracao da sessao: ${mins} min (${sessionSeconds}s)\\nEntregaveis:\\n${delivText}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
}
