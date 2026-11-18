import { useEffect, useMemo, useRef, useState } from 'react';
import { LogIn, LogOut, Save, ShieldCheck, X } from 'lucide-react';
import { CadFilesPanel } from './components/CadFilesPanel';
import { CamRoboticsPanel } from './components/CamRoboticsPanel';
import { GrasshopperCanvas } from './components/GrasshopperCanvas';
import { McpToolsPanel } from './components/McpToolsPanel';
import { OnboardingHelpView } from './components/OnboardingHelpView';
import { ParametricSidebar } from './components/ParametricSidebar';
import { PluginsSdkPanel } from './components/PluginsSdkPanel';
import { Viewport3D } from './components/Viewport3D';
import { useAuth } from './contexts/AuthContext';
import {
  buildIsolatedEvaluatedMesh,
  exportAsciiDXF,
  exportBinarySTL,
  exportOpenNurbs3DM,
  triggerBlobDownload,
} from './kernel/cadFormats';
import { generateCamToolpath } from './kernel/camRobotics';
import {
  SEGMENT_CATALOG,
  buildParametricComponentParts,
  resolvePartEngineeringProfile,
} from './kernel/componentClassifier';
import { GRAPH_TEMPLATES, evaluateGraphPipeline } from './kernel/graphEngine';
import {
  MCP_TOOLS_CATALOG,
  type McpRuntimeContext,
  executeMcpToolCall,
} from './kernel/mcpServer';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from './kernel/nurbs';
import { DEFAULT_PLUGINS, applyActivePlugins } from './kernel/plugins';
import {
  type OptimizationObjective,
  buildFeaComparisonReport,
  evaluateStructuralFea,
  synthesizeOptimizedParams,
} from './kernel/structuralFea';
import {
  type SavedCadProject,
  deleteUserCadProject,
  saveUserCadProject,
  saveUserDeliverable,
  subscribeUserDeliverables,
  subscribeUserProjects,
} from './services/userWorkspaceStore';
import type {
  AgentChatMessage,
  ApplicationSegment,
  CadComponentPart,
  CadPlugin,
  CamSettings,
  ControlPoint4D,
  FeaComparisonReport,
  FeaResult,
  FeaSettings,
  GraphNode,
  GraphWire,
  ImportedCadModel,
  ParametricDesignParams,
  PartEngineeringProfile,
  RagSourceDocument,
  SessionDeliverable,
  ViewportDisplayState,
  WorkspaceTab,
} from './types/cad';

export default function App() {
  const { user, authReady, authBusy, signInWithGoogle, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('onboarding');
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [deliverables, setDeliverables] = useState<SessionDeliverable[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedCadProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  // Core Parametric NURBS & BIM state
  const [designParams, setDesignParams] = useState<ParametricDesignParams>({
    preset: 'shell',
    spanX: 210,
    spanY: 145,
    archHeight: 52,
    waveAmplitude: 16,
    twistDeg: 18,
    thicknessMm: 6,
    uDivisions: 34,
    vDivisions: 34,
    ribCountU: 5,
    ribCountV: 4,
    ribHeightMm: 14,
    attractorStrength: 0,
  });

  const [cpOverrides, setCpOverrides] = useState<Record<string, Partial<ControlPoint4D>>>({});
  const [selectedControlPoint, setSelectedControlPoint] = useState<{ u: number; v: number } | null>(
    null
  );

  const [graphNodes, setGraphNodes] = useState<GraphNode[]>(GRAPH_TEMPLATES[0].nodes);
  const [graphWires, setGraphWires] = useState<GraphWire[]>(GRAPH_TEMPLATES[0].wires);

  const [plugins, setPlugins] = useState<CadPlugin[]>(DEFAULT_PLUGINS);

  const [camSettings, setCamSettings] = useState<CamSettings>({
    machineType: 'cnc-5axis',
    strategy: 'isoparm',
    toolId: 'tool-ball-8',
    stepoverPct: 24,
    stepdownMm: 2.5,
    stockMarginMm: 0.2,
    safeZMm: 25,
    cutSpeedMultiplier: 1.0,
    postFormat: 'fanuc-nc',
  });
  const [simPlaying, setSimPlaying] = useState(false);
  const [simProgress, setSimProgress] = useState(0);

  // Imported external CAD file & Segment Engineering Identity
  const [importedModel, setImportedModel] = useState<ImportedCadModel | null>(null);
  const [activeSegment, setActiveSegment] = useState<ApplicationSegment>('arquitetura-bim');
  const [partProfileOverride, setPartProfileOverride] = useState<Partial<PartEngineeringProfile>>(
    {}
  );

  // Structural FEA & Optimization state
  const [feaSettings, setFeaSettings] = useState<FeaSettings>({
    loadNewtons: 4500,
    supportMode: 'edge-clamped',
    loadPattern: 'center-point',
    targetSafetyFactor: 2.2,
  });
  const [feaBaseline, setFeaBaseline] = useState<{
    fea: FeaResult;
    params: ParametricDesignParams;
  } | null>(null);
  const [feaComparison, setFeaComparison] = useState<FeaComparisonReport | null>(null);

  // RAG + Agent MCP state
  const [ragDocs, setRagDocs] = useState<RagSourceDocument[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([]);
  const [exportIsolatedOnly, setExportIsolatedOnly] = useState(true);

  // 3D GrabCAD Viewport Display state
  const [display, setDisplay] = useState<ViewportDisplayState>({
    mode: 'component-pbr',
    materialFinish: 'aluminum',
    showIsocurves: true,
    showControlCage: true,
    showBimRibs: true,
    showToolpath: true,
    showMachine: true,
    showImportedOverlay: true,
    cameraPreset: 'perspective',
    cameraTrigger: 0,
    fitViewTrigger: 0,
    isolationTarget: 'all',
    stressComparisonView: 'current',
    explodeFactor: 0,
    autoRotate: false,
    sectionEnabled: false,
    sectionAxis: 'y',
    sectionFlipped: false,
    sectionRatio: 0.55,
    selectedComponentId: null,
    hiddenComponentIds: [],
    componentMaterials: {},
    componentRotations: {},
    assemblyRotationDeg: [0, 0, 0],
    perComponentPbr: true,
    transformMode: 'none',
  });

  // 1. Evaluate Grasshopper DAG
  const graphEval = useMemo(
    () => evaluateGraphPipeline(graphNodes, graphWires, designParams, camSettings),
    [graphNodes, graphWires, designParams, camSettings]
  );

  const effectiveDesignParams = useMemo<ParametricDesignParams>(
    () =>
      activeTab === 'grasshopper'
        ? { ...designParams, ...graphEval.designPatch }
        : designParams,
    [activeTab, designParams, graphEval.designPatch]
  );

  const effectiveCamSettings = useMemo<CamSettings>(
    () =>
      activeTab === 'grasshopper'
        ? { ...camSettings, ...graphEval.camPatch }
        : camSettings,
    [activeTab, camSettings, graphEval.camPatch]
  );

  // 2. Build NURBS surface
  const { surface, logs: pluginLogs } = useMemo(() => {
    const base = buildNurbsSurfaceFromParams(effectiveDesignParams);
    for (const [key, patch] of Object.entries(cpOverrides)) {
      const [uStr, vStr] = key.split('-');
      const u = parseInt(uStr, 10);
      const v = parseInt(vStr, 10);
      if (base.controlPoints[u]?.[v]) {
        base.controlPoints[u][v] = { ...base.controlPoints[u][v], ...patch };
      }
    }
    return applyActivePlugins(base, plugins, {
      amplitude: effectiveDesignParams.waveAmplitude || 14,
    });
  }, [effectiveDesignParams, cpOverrides, plugins]);

  // 3. Tessellate solid thickened NURBS mesh + BIM Waffle Ribs
  const meshData = useMemo(
    () =>
      tessellateNurbsSurface(
        surface,
        effectiveDesignParams.ribCountU,
        effectiveDesignParams.ribCountV,
        effectiveDesignParams.ribHeightMm
      ),
    [
      surface,
      effectiveDesignParams.ribCountU,
      effectiveDesignParams.ribCountV,
      effectiveDesignParams.ribHeightMm,
    ]
  );

  // 4. Resolve Engineering Identity & Component Hierarchy (Object Mask + Material Context)
  const partProfile = useMemo<PartEngineeringProfile>(() => {
    const base =
      importedModel?.detectedProfile && activeSegment === importedModel.detectedProfile.segment
        ? importedModel.detectedProfile
        : resolvePartEngineeringProfile({
            filename: importedModel?.filename,
            layers: importedModel?.layers,
            preset: effectiveDesignParams.preset,
            segmentOverride: activeSegment,
            surfaceName: surface.name,
          });
    return {
      ...base,
      ...partProfileOverride,
      segment: activeSegment,
    };
  }, [importedModel, activeSegment, effectiveDesignParams.preset, surface.name, partProfileOverride]);

  const components = useMemo<CadComponentPart[]>(() => {
    if (importedModel?.components && importedModel.components.length > 0) {
      return importedModel.components;
    }
    return buildParametricComponentParts(surface, meshData, partProfile);
  }, [importedModel, surface, meshData, partProfile]);

  // 5. Generate CAM Toolpath
  const toolpath = useMemo(
    () => generateCamToolpath(surface, meshData, effectiveCamSettings),
    [surface, meshData, effectiveCamSettings]
  );

  // 6. Evaluate Structural FEA with Certification Thresholds
  const feaResult = useMemo(
    () =>
      evaluateStructuralFea(
        surface,
        meshData,
        effectiveDesignParams,
        display.materialFinish,
        feaSettings,
        display.isolationTarget,
        partProfile,
        importedModel
      ),
    [
      surface,
      meshData,
      effectiveDesignParams,
      display.materialFinish,
      feaSettings,
      display.isolationTarget,
      partProfile,
      importedModel,
    ]
  );

  // Unified handler whenever any CAD file is loaded (via RAG Upload/URL/GDrive OR Files Tab)
  // Automatically opens GrabCAD 3D Viewer & Editor, frames the geometry, and sets context!
  const handleLoadImportedModel = (model: ImportedCadModel | null) => {
    setImportedModel(model);
    setPartProfileOverride({});
    setFeaBaseline(null);
    setFeaComparison(null);

    if (model) {
      const detected = model.detectedProfile;
      if (detected) {
        setActiveSegment(detected.segment);
        setFeaSettings({
          loadNewtons: detected.safetyCriteria.recommendedLoadN,
          supportMode: detected.safetyCriteria.supportMode,
          loadPattern: detected.safetyCriteria.loadPattern,
          targetSafetyFactor: detected.safetyCriteria.minSafetyFactor,
        });
      }
      setDisplay((d) => ({
        ...d,
        showImportedOverlay: true,
        isolationTarget: 'all',
        selectedComponentId: null,
        hiddenComponentIds: [],
        componentMaterials: {},
        componentRotations: {},
        assemblyRotationDeg: [0, 0, 0],
        explodeFactor: 0,
        mode: 'component-pbr',
        perComponentPbr: true,
        materialFinish: detected?.primaryMaterial ?? d.materialFinish,
        fitViewTrigger: d.fitViewTrigger + 1,
      }));
      setActiveTab('viewport');
    } else {
      setDisplay((d) => ({
        ...d,
        isolationTarget: 'all',
        selectedComponentId: null,
        hiddenComponentIds: [],
        fitViewTrigger: d.fitViewTrigger + 1,
      }));
    }
  };

  const handleSetSegment = (seg: ApplicationSegment) => {
    setActiveSegment(seg);
    const segDef = SEGMENT_CATALOG.find((s) => s.id === seg);
    if (segDef) {
      setFeaSettings((prev) => ({
        ...prev,
        loadNewtons: segDef.recommendedLoadN,
        targetSafetyFactor: segDef.recommendedSf,
      }));
    }
  };

  const handleApplyProfileCriteriaToFea = () => {
    setFeaSettings({
      loadNewtons: partProfile.safetyCriteria.recommendedLoadN,
      supportMode: partProfile.safetyCriteria.supportMode,
      loadPattern: partProfile.safetyCriteria.loadPattern,
      targetSafetyFactor: partProfile.safetyCriteria.minSafetyFactor,
    });
  };

  const handleLoadTemplate = (templateId: string) => {
    const tpl = GRAPH_TEMPLATES.find((t) => t.id === templateId);
    if (!tpl) return;
    setGraphNodes(tpl.nodes.map((n) => ({ ...n, params: { ...n.params } })));
    setGraphWires(tpl.wires.map((w) => ({ ...w })));
    const nextEval = evaluateGraphPipeline(tpl.nodes, tpl.wires, designParams, camSettings);
    setDesignParams((prev) => ({ ...prev, ...nextEval.designPatch }));
    setCamSettings((prev) => ({ ...prev, ...nextEval.camPatch }));
  };

  const handleGraphNodesChange = (nextNodes: GraphNode[]) => {
    setGraphNodes(nextNodes);
    const nextEval = evaluateGraphPipeline(nextNodes, graphWires, designParams, camSettings);
    if (Object.keys(nextEval.designPatch).length > 0) {
      setDesignParams((prev) => ({ ...prev, ...nextEval.designPatch }));
    }
    if (Object.keys(nextEval.camPatch).length > 0) {
      setCamSettings((prev) => ({ ...prev, ...nextEval.camPatch }));
    }
  };

  const handleGraphWiresChange = (nextWires: GraphWire[]) => {
    setGraphWires(nextWires);
    const nextEval = evaluateGraphPipeline(graphNodes, nextWires, designParams, camSettings);
    if (Object.keys(nextEval.designPatch).length > 0) {
      setDesignParams((prev) => ({ ...prev, ...nextEval.designPatch }));
    }
    if (Object.keys(nextEval.camPatch).length > 0) {
      setCamSettings((prev) => ({ ...prev, ...nextEval.camPatch }));
    }
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSessionSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified) {
      setSavedProjects([]);
      setActiveProjectId(null);
      return;
    }
    const unsubProjects = subscribeUserProjects(user.uid, (projects) => {
      setSavedProjects(projects);
    });
    const unsubDeliverables = subscribeUserDeliverables(user.uid, (cloudDeliverables) => {
      setDeliverables((local) => {
        const merged = new Map<string, SessionDeliverable>();
        for (const item of cloudDeliverables) merged.set(item.id, item);
        for (const item of local) {
          if (!merged.has(item.id)) merged.set(item.id, item);
        }
        return Array.from(merged.values());
      });
    });
    return () => {
      unsubProjects();
      unsubDeliverables();
    };
  }, [authReady, user]);

  const recordDeliverable = (d: Omit<SessionDeliverable, 'id' | 'timestamp'>) => {
    const nextItem: SessionDeliverable = {
      ...d,
      id: `deliv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString('pt-BR'),
    };
    setDeliverables((prev) => [nextItem, ...prev]);
    if (user && user.emailVerified) {
      void saveUserDeliverable(user.uid, nextItem, sessionSeconds);
    }
  };

  const handleSaveCloudProject = async (projectName: string) => {
    if (!user || !user.emailVerified) return;
    setCloudBusy(true);
    try {
      const targetId = activeProjectId ?? `proj_${Date.now()}`;
      const savedId = await saveUserCadProject(user.uid, targetId, {
        name: projectName,
        materialFinish: display.materialFinish,
        displayMode: display.mode,
        designParams,
        camSettings,
        sessionSeconds,
      });
      setActiveProjectId(savedId);
    } finally {
      setCloudBusy(false);
    }
  };

  const handleLoadCloudProject = (proj: SavedCadProject) => {
    setDesignParams(proj.designParams);
    setCamSettings(proj.camSettings);
    setDisplay((d) => ({
      ...d,
      materialFinish: proj.materialFinish,
      mode: proj.displayMode,
    }));
    setActiveProjectId(proj.id);
    setAccountModalOpen(false);
  };

  const handleDeleteCloudProject = async (projectId: string) => {
    if (!user || !user.emailVerified) return;
    setCloudBusy(true);
    try {
      await deleteUserCadProject(user.uid, projectId);
      if (activeProjectId === projectId) {
        setActiveProjectId(null);
      }
    } finally {
      setCloudBusy(false);
    }
  };

  const handleRunFea = (
    patch?: Partial<FeaSettings>,
    activateHeatmap = true
  ): FeaResult => {
    const nextFeaSettings = patch ? { ...feaSettings, ...patch } : feaSettings;
    if (patch) {
      setFeaSettings(nextFeaSettings);
    }
    const evaluatedFea = evaluateStructuralFea(
      surface,
      meshData,
      effectiveDesignParams,
      display.materialFinish,
      nextFeaSettings,
      display.isolationTarget,
      partProfile,
      importedModel
    );
    if (!feaBaseline) {
      setFeaBaseline({ fea: evaluatedFea, params: effectiveDesignParams });
    }
    if (activateHeatmap) {
      setDisplay((d) => ({
        ...d,
        mode: 'stress-heatmap',
        stressComparisonView: 'current',
      }));
    }
    return evaluatedFea;
  };

  const handleGenerateOptimizedGeometry = (
    objective: OptimizationObjective,
    targetSafetyFactor?: number
  ): FeaComparisonReport => {
    const beforeFea = feaResult;
    const beforeParams = effectiveDesignParams;
    const targetSf =
      targetSafetyFactor ?? partProfile.safetyCriteria.minSafetyFactor ?? feaSettings.targetSafetyFactor;

    const { nextParams, strategySummary } = synthesizeOptimizedParams(
      beforeParams,
      beforeFea,
      objective,
      targetSf
    );

    const baseAfterSurface = buildNurbsSurfaceFromParams(nextParams);
    for (const [key, patch] of Object.entries(cpOverrides)) {
      const [uStr, vStr] = key.split('-');
      const u = parseInt(uStr, 10);
      const v = parseInt(vStr, 10);
      if (baseAfterSurface.controlPoints[u]?.[v]) {
        baseAfterSurface.controlPoints[u][v] = {
          ...baseAfterSurface.controlPoints[u][v],
          ...patch,
        };
      }
    }
    const { surface: afterSurface } = applyActivePlugins(baseAfterSurface, plugins, {
      amplitude: nextParams.waveAmplitude || 14,
    });
    const afterMesh = tessellateNurbsSurface(
      afterSurface,
      nextParams.ribCountU,
      nextParams.ribCountV,
      nextParams.ribHeightMm
    );
    const afterFea = evaluateStructuralFea(
      afterSurface,
      afterMesh,
      nextParams,
      display.materialFinish,
      feaSettings,
      display.isolationTarget,
      partProfile,
      importedModel
    );

    const report = buildFeaComparisonReport(
      beforeFea,
      afterFea,
      beforeParams,
      nextParams,
      strategySummary,
      partProfile
    );

    setFeaBaseline({ fea: beforeFea, params: beforeParams });
    setFeaComparison(report);
    setDesignParams(nextParams);
    setDisplay((d) => ({
      ...d,
      mode: 'stress-heatmap',
      stressComparisonView: 'current',
    }));

    recordDeliverable({
      filename: `${afterSurface.id}_fea_antes_depois.md`,
      kind: 'REPORT',
      summary: `Otimização ${objective}: ${beforeFea.maxStressMpa}→${afterFea.maxStressMpa} MPa (SF ${beforeFea.safetyFactor}→${afterFea.safetyFactor})`,
    });

    return report;
  };

  const handleExportFormat = (
    fmt: '3dm' | 'stl' | 'dxf' | 'nc' | 'src',
    scope?: 'assembly' | 'isolated'
  ): string => {
    const effectiveScope =
      scope ?? (display.isolationTarget !== 'all' ? 'isolated' : 'assembly');
    const useIsolated = effectiveScope === 'isolated' && display.isolationTarget !== 'all';
    const { evaluated, partLabel } = buildIsolatedEvaluatedMesh(
      meshData,
      useIsolated ? display.isolationTarget : 'all',
      importedModel
    );
    const base = `${surface.id}${useIsolated ? `_${partLabel}` : ''}`;

    if (fmt === '3dm') {
      const name = `${base}.3dm`;
      triggerBlobDownload(exportOpenNurbs3DM(surface, evaluated), name);
      recordDeliverable({
        filename: name,
        kind: '3DM',
        summary: useIsolated
          ? `OpenNURBS peça isolada (${display.isolationTarget})`
          : `OpenNURBS v7 (${surface.uCount}x${surface.vCount} CPs)`,
      });
      return name;
    }
    if (fmt === 'stl') {
      const name = `${base}.stl`;
      triggerBlobDownload(exportBinarySTL(evaluated, surface.name), name);
      recordDeliverable({
        filename: name,
        kind: 'STL',
        summary: `${useIsolated ? `Peça ${display.isolationTarget}` : 'Malha binária'} (${evaluated.triangleCount} triângulos)`,
      });
      return name;
    }
    if (fmt === 'dxf') {
      const name = `${base}.dxf`;
      triggerBlobDownload(
        exportAsciiDXF(evaluated, evaluated.isocurves, useIsolated ? undefined : toolpath.points),
        name
      );
      recordDeliverable({
        filename: name,
        kind: 'DXF',
        summary: useIsolated
          ? `DXF R2000 peça isolada (${display.isolationTarget})`
          : `AutoCAD R2000 (3DFACE + Isocurvas + CAM)`,
      });
      return name;
    }
    const name = `${base}_cam.${fmt}`;
    triggerBlobDownload(new Blob([toolpath.postCode], { type: 'text/plain;charset=utf-8' }), name);
    recordDeliverable({
      filename: name,
      kind: fmt === 'src' ? 'SRC' : 'NC',
      summary: `Código CAM (${toolpath.spindleRpm} RPM, ${toolpath.cuttingLengthMm} mm)`,
    });
    return name;
  };

  const mcpContext: McpRuntimeContext = {
    designParams,
    surface,
    meshData,
    camSettings,
    toolpath,
    display,
    feaSettings,
    feaResult,
    feaComparison,
    activeSegment,
    partProfile,
    components,
    sessionSeconds,
    deliverables,
    onUpdateDesignParams: (patch) =>
      setDesignParams((prev) => ({ ...prev, ...patch })),
    onUpdateDisplay: (patch) => setDisplay((d) => ({ ...d, ...patch })),
    onUpdateCamSettings: (patch) =>
      setCamSettings((prev) => ({ ...prev, ...patch })),
    onSetSegment: handleSetSegment,
    onUpdatePartProfile: (patch) =>
      setPartProfileOverride((prev) => ({ ...prev, ...patch })),
    onRunFea: handleRunFea,
    onGenerateOptimizedGeometry: handleGenerateOptimizedGeometry,
    onExportFormat: handleExportFormat,
    onRegisterAndRunPlugin: (name, code) => {
      const newPlug: CadPlugin = {
        id: `plugin-mcp-${Date.now().toString().slice(-5)}`,
        name,
        author: 'Agente MCP',
        version: '1.0.0',
        category: 'Geometria',
        enabled: true,
        description: 'Plugin registrado via ferramenta MCP.',
        code,
      };
      setPlugins((prev) => [newPlug, ...prev]);
      recordDeliverable({
        filename: `${newPlug.id}.plugin.json`,
        kind: 'PLUGIN',
        summary: `Plugin MCP ativado: ${name}`,
      });
    },
  };

  const mcpContextRef = useRef(mcpContext);
  mcpContextRef.current = mcpContext;

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__PARAMETRIX_MCP__ = {
      protocol: '2024-11-05',
      listTools: () => MCP_TOOLS_CATALOG,
      callTool: (name: string, args: Record<string, unknown> = {}) =>
        executeMcpToolCall(name, args, mcpContextRef.current),
    };
  }, []);

  const navItems: { id: WorkspaceTab; label: string }[] = [
    { id: 'onboarding', label: 'Início / Ajuda' },
    { id: 'viewport', label: 'Modelagem 3D' },
    { id: 'grasshopper', label: 'Grasshopper' },
    { id: 'cam', label: 'CAM & Robô' },
    { id: 'mcp', label: 'MCP Tools' },
    { id: 'plugins', label: 'Plugins SDK' },
    { id: 'files', label: 'Arquivos CAD' },
  ];

  const handleTabSwitch = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    if (tab === 'cam') {
      setDisplay((d) => ({ ...d, showToolpath: true, showMachine: true }));
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0b0e14] text-slate-100 overflow-hidden">
      {/* Top Navigation Bar */}
      <header className="h-12 px-3 sm:px-5 border-b border-white/10 bg-[#0f141d] flex items-center justify-between gap-3 sm:gap-8 shrink-0">
        <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          Parametrix CAD
        </span>

        <nav className="flex items-center gap-4 sm:gap-6 overflow-x-auto">
          {navItems.map((item) => {
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabSwitch(item.id)}
                className={`py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-sky-400 text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          {authReady &&
            (user ? (
              <button
                type="button"
                onClick={() => setAccountModalOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium bg-[#141a24] border border-white/12 text-slate-200 hover:border-sky-400/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={`Conta isolada: ${user.email || ''}`}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Usuário'}
                    className="w-4 h-4 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="max-w-[80px] sm:max-w-[110px] truncate hidden sm:inline">
                  {user.displayName?.split(' ')[0] || 'Conta'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void signInWithGoogle()}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium bg-[#141a24] border border-white/12 text-slate-200 hover:border-white/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">{authBusy ? 'Entrando...' : 'Entrar Google'}</span>
              </button>
            ))}

          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="px-3 sm:px-4 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Exportar
          </button>
        </div>
      </header>

      {/* Main Active Workspace */}
      <main className="flex-1 min-h-0 flex overflow-hidden relative">
        {activeTab === 'onboarding' && (
          <OnboardingHelpView
            onNavigate={handleTabSwitch}
            sessionSeconds={sessionSeconds}
            surface={surface}
            meshData={meshData}
            deliverables={deliverables}
            onRecordDeliverable={recordDeliverable}
            savedProjects={savedProjects}
            activeProjectId={activeProjectId}
            cloudBusy={cloudBusy}
            onSaveCloudProject={handleSaveCloudProject}
            onLoadCloudProject={handleLoadCloudProject}
            onDeleteCloudProject={handleDeleteCloudProject}
          />
        )}

        {activeTab === 'viewport' && (
          <>
            <ParametricSidebar
              collapsed={sidebarCollapsed}
              onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
              params={designParams}
              onChangeParams={(patch) =>
                setDesignParams((prev) => ({ ...prev, ...patch }))
              }
              surface={surface}
              bimElements={meshData.bimElements}
              components={components}
              partProfile={partProfile}
              activeSegment={activeSegment}
              onChangeSegment={handleSetSegment}
              onApplyProfileCriteriaToFea={handleApplyProfileCriteriaToFea}
              display={display}
              onUpdateDisplay={(patch) => setDisplay((d) => ({ ...d, ...patch }))}
              selectedControlPoint={selectedControlPoint}
              onSelectControlPoint={setSelectedControlPoint}
              onUpdateControlPoint={(u, v, patch) =>
                setCpOverrides((prev) => ({
                  ...prev,
                  [`${u}-${v}`]: { ...(prev[`${u}-${v}`] ?? {}), ...patch },
                }))
              }
              onResetControlPointOverrides={() => setCpOverrides({})}
              hasOverrides={Object.keys(cpOverrides).length > 0}
              hasImportedModel={Boolean(importedModel)}
              feaSettings={feaSettings}
              onChangeFeaSettings={(patch) =>
                setFeaSettings((prev) => ({ ...prev, ...patch }))
              }
              feaResult={feaResult}
              feaComparison={feaComparison}
              onToggleHeatmap={() => {
                if (display.mode === 'stress-heatmap') {
                  setDisplay((d) => ({ ...d, mode: 'component-pbr' }));
                } else {
                  handleRunFea(undefined, true);
                }
              }}
              onOptimizeGeometry={(obj) => handleGenerateOptimizedGeometry(obj)}
            />
            <div className="flex-1 min-w-0 h-full">
              <Viewport3D
                surface={surface}
                meshData={meshData}
                display={display}
                onUpdateDisplay={(patch) => setDisplay((d) => ({ ...d, ...patch }))}
                toolpath={toolpath}
                machineType={camSettings.machineType}
                simPlaying={simPlaying}
                simProgress={simProgress}
                onSimProgressChange={setSimProgress}
                selectedControlPoint={selectedControlPoint}
                onSelectControlPoint={setSelectedControlPoint}
                importedModel={importedModel}
                components={components}
                partProfile={partProfile}
                feaResult={feaResult}
                beforeFeaResult={feaBaseline?.fea ?? null}
                onOpenHelp={() => setActiveTab('onboarding')}
              />
            </div>
          </>
        )}

        {activeTab === 'grasshopper' && (
          <div className="w-full h-full flex flex-col md:flex-row overflow-hidden">
            <div className="w-full md:w-[58%] h-1/2 md:h-full border-b md:border-b-0 md:border-r border-white/10 min-w-0">
              <GrasshopperCanvas
                nodes={graphNodes}
                wires={graphWires}
                nodeSummaries={graphEval.nodeSummaries}
                evalMs={graphEval.evalMs}
                onChangeNodes={handleGraphNodesChange}
                onChangeWires={handleGraphWiresChange}
                onLoadTemplate={handleLoadTemplate}
              />
            </div>
            <div className="w-full md:w-[42%] h-1/2 md:h-full min-w-0">
              <Viewport3D
                surface={surface}
                meshData={meshData}
                display={display}
                onUpdateDisplay={(patch) => setDisplay((d) => ({ ...d, ...patch }))}
                toolpath={toolpath}
                machineType={effectiveCamSettings.machineType}
                simPlaying={simPlaying}
                simProgress={simProgress}
                onSimProgressChange={setSimProgress}
                selectedControlPoint={selectedControlPoint}
                onSelectControlPoint={setSelectedControlPoint}
                importedModel={importedModel}
                components={components}
                partProfile={partProfile}
                feaResult={feaResult}
                beforeFeaResult={feaBaseline?.fea ?? null}
                compact
              />
            </div>
          </div>
        )}

        {activeTab === 'cam' && (
          <>
            <CamRoboticsPanel
              settings={camSettings}
              onChangeSettings={(patch) =>
                setCamSettings((prev) => ({ ...prev, ...patch }))
              }
              toolpath={toolpath}
              simPlaying={simPlaying}
              simProgress={simProgress}
              onTogglePlay={() => {
                setDisplay((d) => ({ ...d, showMachine: true, showToolpath: true }));
                setSimPlaying((p) => !p);
              }}
              onScrub={(val) => {
                setSimPlaying(false);
                setSimProgress(val);
              }}
              showToolpath={display.showToolpath}
              showMachine={display.showMachine}
              onToggleToolpath={() =>
                setDisplay((d) => ({ ...d, showToolpath: !d.showToolpath }))
              }
              onToggleMachine={() =>
                setDisplay((d) => ({ ...d, showMachine: !d.showMachine }))
              }
            />
            <div className="flex-1 min-w-0 h-full">
              <Viewport3D
                surface={surface}
                meshData={meshData}
                display={display}
                onUpdateDisplay={(patch) => setDisplay((d) => ({ ...d, ...patch }))}
                toolpath={toolpath}
                machineType={camSettings.machineType}
                simPlaying={simPlaying}
                simProgress={simProgress}
                onSimProgressChange={setSimProgress}
                selectedControlPoint={selectedControlPoint}
                onSelectControlPoint={setSelectedControlPoint}
                importedModel={importedModel}
                components={components}
                partProfile={partProfile}
                feaResult={feaResult}
                beforeFeaResult={feaBaseline?.fea ?? null}
                onOpenHelp={() => setActiveTab('onboarding')}
              />
            </div>
          </>
        )}

        {activeTab === 'mcp' && (
          <McpToolsPanel
            runtimeContext={mcpContext}
            ragDocs={ragDocs}
            onAddRagDoc={(doc, importedCad) => {
              setRagDocs((prev) => [doc, ...prev]);
              if (importedCad) {
                handleLoadImportedModel(importedCad);
              }
            }}
            onRemoveRagDoc={(id) =>
              setRagDocs((prev) => prev.filter((doc) => doc.id !== id))
            }
            chatMessages={agentMessages}
            onAddChatMessage={(msg) => setAgentMessages((prev) => [...prev, msg])}
            onOpenViewport={() => {
              setDisplay((d) => ({ ...d, fitViewTrigger: d.fitViewTrigger + 1 }));
              setActiveTab('viewport');
            }}
          />
        )}

        {activeTab === 'plugins' && (
          <PluginsSdkPanel
            plugins={plugins}
            pluginLogs={pluginLogs}
            onTogglePlugin={(id) =>
              setPlugins((prev) =>
                prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p))
              )
            }
            onUpdatePluginCode={(id, code) =>
              setPlugins((prev) =>
                prev.map((p) => (p.id === id ? { ...p, code } : p))
              )
            }
            onAddPlugin={(plug) => setPlugins((prev) => [plug, ...prev])}
            onDeletePlugin={(id) =>
              setPlugins((prev) => prev.filter((p) => p.id !== id))
            }
          />
        )}

        {activeTab === 'files' && (
          <CadFilesPanel
            surface={surface}
            meshData={meshData}
            toolpath={toolpath}
            importedModel={importedModel}
            isolationTarget={display.isolationTarget}
            showImportedOverlay={display.showImportedOverlay}
            onSetImportedModel={handleLoadImportedModel}
            onToggleImportedOverlay={() =>
              setDisplay((d) => ({ ...d, showImportedOverlay: !d.showImportedOverlay }))
            }
            onOpenViewport={() => {
              setDisplay((d) => ({ ...d, fitViewTrigger: d.fitViewTrigger + 1 }));
              setActiveTab('viewport');
            }}
          />
        )}
      </main>

      {/* Quick Export Modal triggered by Top Bar CTA */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-[#111620] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-100">
                Exportar Projeto & Fabricação
              </h3>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-2.5">
              {display.isolationTarget !== 'all' && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-amber-500/10 border border-amber-400/30 rounded-xl text-xs">
                  <span className="text-amber-200">
                    Peça isolada: <strong>{display.isolationTarget}</strong>
                  </span>
                  <label className="flex items-center gap-1.5 text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportIsolatedOnly}
                      onChange={(e) => setExportIsolatedOnly(e.target.checked)}
                      className="accent-amber-400"
                    />
                    Exportar só isolada
                  </label>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  handleExportFormat(
                    '3dm',
                    exportIsolatedOnly && display.isolationTarget !== 'all'
                      ? 'isolated'
                      : 'assembly'
                  );
                  setExportModalOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0c1017] hover:border-sky-400/60 border border-white/10 rounded-xl text-left transition-colors cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    OpenNURBS Rhino (.3DM)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {exportIsolatedOnly && display.isolationTarget !== 'all'
                      ? `Somente geometria isolada (${display.isolationTarget})`
                      : 'Superfície NURBS completa + malha sólida'}
                  </div>
                </div>
                <span className="text-xs font-mono-tabular text-sky-400">.3dm</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleExportFormat(
                    'stl',
                    exportIsolatedOnly && display.isolationTarget !== 'all'
                      ? 'isolated'
                      : 'assembly'
                  );
                  setExportModalOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0c1017] hover:border-sky-400/60 border border-white/10 rounded-xl text-left transition-colors cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Malha Binária Sólida (.STL)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {exportIsolatedOnly && display.isolationTarget !== 'all'
                      ? `Exportação isolada: ${display.isolationTarget}`
                      : `${meshData.triangleCount.toLocaleString('pt-BR')} triângulos estanques`}
                  </div>
                </div>
                <span className="text-xs font-mono-tabular text-sky-400">.stl</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  handleExportFormat(
                    'dxf',
                    exportIsolatedOnly && display.isolationTarget !== 'all'
                      ? 'isolated'
                      : 'assembly'
                  );
                  setExportModalOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0c1017] hover:border-sky-400/60 border border-white/10 rounded-xl text-left transition-colors cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    AutoCAD DXF R2000 (.DXF)
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {exportIsolatedOnly && display.isolationTarget !== 'all'
                      ? `Camada 3DFACE isolada (${display.isolationTarget})`
                      : 'Camadas 3DFACE, Isocurvas e Toolpath CAM'}
                  </div>
                </div>
                <span className="text-xs font-mono-tabular text-sky-400">.dxf</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const fmt = camSettings.postFormat === 'kuka-krl' ? 'src' : 'nc';
                  handleExportFormat(fmt, 'assembly');
                  setExportModalOpen(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-[#0c1017] hover:border-emerald-400/60 border border-white/10 rounded-xl text-left transition-colors cursor-pointer"
              >
                <div>
                  <div className="text-xs font-semibold text-slate-100">
                    Programa CNC / Robô / Folha Manual
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {toolpath.spindleRpm} RPM · {toolpath.feedRateMmMin} mm/min
                  </div>
                </div>
                <span className="text-xs font-mono-tabular text-emerald-400">
                  .{camSettings.postFormat === 'kuka-krl' ? 'src' : 'nc'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account & Isolated User Workspace Modal */}
      {accountModalOpen && user && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-[#111620] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="font-display text-base font-semibold text-slate-100">
                  Conta do Usuário (Espaço Isolado)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setAccountModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-[#0c1017] border border-white/8 rounded-xl">
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Avatar'}
                    className="w-9 h-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {user.displayName || 'Usuário Final'}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                  <div className="text-[10px] font-mono-tabular text-slate-500 truncate mt-0.5">
                    UID isolado: {user.uid}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Autenticação Firebase independente do ambiente Google AI Studio do desenvolvedor/PO, sem acesso a Drive ou Calendar.
              </p>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={cloudBusy}
                  onClick={async () => {
                    await handleSaveCloudProject(surface.name);
                    setAccountModalOpen(false);
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar Modelo Atual
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={async () => {
                    await logout();
                    setAccountModalOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0c1017] border border-white/12 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sair
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
