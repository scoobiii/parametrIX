import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Boxes,
  Briefcase,
  ChevronDown,
  Cpu,
  ExternalLink,
  Flame,
  FolderOpen,
  Globe,
  Home,
  KeyRound,
  Leaf,
  LogIn,
  LogOut,
  MoreHorizontal,
  Network,
  Palette,
  Puzzle,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sigma,
  SlidersHorizontal,
  Terminal,
  X,
} from 'lucide-react';
import { AgentVoiceCommandBar } from './components/AgentVoiceCommandBar';
import { CadFilesPanel } from './components/CadFilesPanel';
const AdditiveCamConfigPanel = lazy(() => import('./components/AdditiveCamConfigPanel').then(m => ({ default: m.AdditiveCamConfigPanel })));
const CamRoboticsPanel = lazy(() => import('./components/CamRoboticsPanel').then(m => ({ default: m.CamRoboticsPanel })));
import type { CamServiceSubmissionInput } from './components/CamRoboticsPanel';
const EcosystemHubPanel = lazy(() => import('./components/EcosystemHubPanel').then(m => ({ default: m.EcosystemHubPanel })));
import type { RemoteMachineConfigInput } from './components/EcosystemHubPanel';
const FrostbiteRackDashboard = lazy(() => import('./components/FrostbiteRackDashboard').then(m => ({ default: m.FrostbiteRackDashboard })));
const GrasshopperCanvas = lazy(() => import('./components/GrasshopperCanvas').then(m => ({ default: m.GrasshopperCanvas })));
const LibraryCatalogPanel = lazy(() => import('./components/LibraryCatalogPanel').then(m => ({ default: m.LibraryCatalogPanel })));
const McpToolsPanel = lazy(() => import('./components/McpToolsPanel').then(m => ({ default: m.McpToolsPanel })));
const MediaStudioPanel = lazy(() => import('./components/MediaStudioPanel').then(m => ({ default: m.MediaStudioPanel })));
import { OfflineAuthModal } from './components/OfflineAuthModal';
import { OnboardingHelpView } from './components/OnboardingHelpView';
import { ParametricSidebar } from './components/ParametricSidebar';
const PluginsSdkPanel = lazy(() => import('./components/PluginsSdkPanel').then(m => ({ default: m.PluginsSdkPanel })));
import { type AreaWizardSubmission, ProjectWizardModal } from './components/ProjectWizardModal';
import { ScoobiiiVucModal } from './components/ScoobiiiVucModal';
const Viewport3D = lazy(() => import('./components/Viewport3D').then(m => ({ default: m.Viewport3D })));
const SustainabilityDashboard = lazy(() => import('./components/SustainabilityDashboard').then(m => ({ default: m.SustainabilityDashboard })));
import { useAuth } from './contexts/AuthContext';
import {
  buildAgentProvenanceMetadata,
  injectGos7ProvenanceIntoTextArtifact,
} from './kernel/agentProvenanceHeader';
import {
  buildIsolatedEvaluatedMesh,
  exportAsciiDXF,
  exportBinarySTL,
  exportOpenNurbs3DM,
  triggerBlobDownload,
} from './kernel/cadFormats';
import {
  evaluateCamProcessVisualState,
  getCamProductionProgram,
} from './kernel/camProcessEngine';
import { generateCamToolpath, getDefaultAdditiveSettings } from './kernel/camRobotics';
import {
  SEGMENT_CATALOG,
  applyMaterialProcessesToComponents,
  buildParametricComponentParts,
  resolvePartEngineeringProfile,
} from './kernel/componentClassifier';
import {
  buildProcessShareUrl,
  parseProcessShareUrl,
} from './kernel/publicChatSignaling';
import {
  analyzeSessionRefinement,
  createSessionEvent,
  shouldRecordPointerSample,
} from './kernel/sessionPointerRecorder';
import { parseRhinoCommandPrompt } from './kernel/rhinoGeometryEngine';
import { parseExtendedMagicPenPrompt } from './kernel/magicPenToolsCatalog';
import {
  LmaxRingBuffer,
  resolveAdaptiveRingCapacity,
} from './kernel/ringBuffer';
import {
  analyzeCurvatureAndOptimizeWeight,
  applyNurbsCurvatureCompensationFactor,
} from './kernel/curvatureOptimizer';
import { buildUserProfileWithRole } from './kernel/ecosystemErpLogistics';
import { GRAPH_TEMPLATES, evaluateGraphPipeline } from './kernel/graphEngine';
import {
  evaluateLayerToleranceCompliance,
  inferDefaultLayerSpecs,
} from './kernel/layerTolerances';
import { createMcpEyeEvent } from './kernel/llmBootstrap';
import {
  MCP_TOOLS_CATALOG,
  type McpRuntimeContext,
  executeMcpToolCall,
} from './kernel/mcpServer';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from './kernel/nurbs';
import { calculateCarbonFootprint } from './kernel/carbonFootprint';
import { DEFAULT_PLUGINS, applyActivePlugins } from './kernel/plugins';
import { computeScoobiiiVucProof } from './kernel/scoobiiiVuc';
import { buildScoobiiiFullTelemetry } from './kernel/scoobiiiProofTelemetry';
import {
  type OptimizationObjective,
  buildFeaComparisonReport,
  evaluateStructuralFea,
  synthesizeOptimizedParams,
} from './kernel/structuralFea';
import { parseVoiceCommand } from './kernel/voiceCommandParser';
import {
  type ErpTaxRegime,
  type OpenErpWorkspaceSnapshot,
  buildLiveErpWorkspaceSnapshot,
} from './kernel/openErpEngine';
import {
  type FullWorkspacePreset,
  WORKSPACE_PROJECT_PRESETS,
  parseUploadedCadOrImageFile,
} from './kernel/workspacePresets';
import {
  downloadDriveFileContent,
  ensureUserDriveProjectFolder,
  saveFileToDriveFolder,
} from './services/googleDriveProjects';
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
  AgentProvenanceMetadata,
  AgentProviderId,
  ApplicationSegment,
  AuthProviderKind,
  AuthUserProfile,
  CadComponentPart,
  CadFeatureOperation,
  CadPlugin,
  CamServiceJob,
  CamSettings,
  CameraPreset,
  DisplayMode,
  ComputeShareNode,
  ControlPoint4D,
  EcosystemChatMessage,
  EcosystemRole,
  EngineeringArea,
  ErpCrmRecord,
  FeaComparisonReport,
  FeaResult,
  FeaSettings,
  GoogleDriveFolderFile,
  GraphNode,
  GraphWire,
  ImportedCadModel,
  IsoThreadSpec,
  LayerToleranceSpec,
  LocalLlmRecommendation,
  LogisticsModal,
  LogisticsTelemetryNode,
  MachineType,
  MaterialFinish,
  McpEyeEvent,
  ParametricDesignParams,
  PartEngineeringProfile,
  PostProcessorFormat,
  ProductionSessionLogRecord,
  PublicChatThemeId,
  RagSourceDocument,
  RemoteMachineTarget,
  RemoteMqttTelemetryEvent,
  SessionActionKind,
  SessionDeliverable,
  SessionInteractionEvent,
  SystemResourceSnapshot,
  ViewportDisplayState,
  VoiceActionIntent,
  VucLedgerEntry,
  WorkspaceTab,
} from './types/cad';

const DISPLAY_MODES: DisplayMode[] = [
  'solid',
  'component-pbr',
  'object-mask',
  'wireframe',
  'zebra',
  'curvature',
  'stress-heatmap',
  'xray',
];
const MATERIAL_FINISHES: MaterialFinish[] = [
  'aluminum',
  'titanium',
  'clay',
  'oak',
  'glass',
  'carbon-fiber',
  'matte-plastic',
];
const CAMERA_PRESETS: CameraPreset[] = [
  'perspective',
  'isometric',
  'top',
  'bottom',
  'front',
  'back',
  'left',
  'right',
];

export default function App() {
  const {
    user,
    backendProfile,
    sessionToken,
    googleAccessToken,
    authReady,
    authBusy,
    signInWithGoogle,
    connectGoogleDrive,
    logout,
  } = useAuth();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('onboarding');
  // Edge-retractable menus: tucked by default on narrow viewports so the 3D scene stays centered
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 1200
  );
  const [rightEdgeDrawerOpen, setRightEdgeDrawerOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [offlineAuthOpen, setOfflineAuthOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardArea, setWizardArea] = useState<EngineeringArea>('cad');
  const [cadResetCount, setCadResetCount] = useState(0);
  const [caeResetCount, setCaeResetCount] = useState(0);
  const [activePresetId, setActivePresetId] = useState<string | undefined>(undefined);
  const [erpBatchQty, setErpBatchQty] = useState<number>(10);
  const [erpMarginPct, setErpMarginPct] = useState<number>(28);
  const [erpTaxRegime, setErpTaxRegime] = useState<ErpTaxRegime>('presumido');
  const [erpLogisticsModal, setErpLogisticsModal] = useState<LogisticsModal>('road');
  const [erpDistanceKm, setErpDistanceKm] = useState<number>(220);
  const [scoobiiiModalOpen, setScoobiiiModalOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [desktopModulesOpen, setDesktopModulesOpen] = useState(false);
  const [mobileCamPane, setMobileCamPane] = useState<'viewport' | 'panel'>('viewport');
  const [mobileGraphMode, setMobileGraphMode] = useState<'split' | 'graph' | 'viewport'>('split');
  const [curvatureCompensationFactor, setCurvatureCompensationFactor] = useState(0);
  const [detectedWebglGpu, setDetectedWebglGpu] = useState<string>('');
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [deliverables, setDeliverables] = useState<SessionDeliverable[]>([]);
  const [savedProjects, setSavedProjects] = useState<SavedCadProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [cloudBusy, setCloudBusy] = useState(false);

  // Proprietary SQLite Offline Auth + Ecosystem Hub + Multi-Agent + Voice + VUC state
  const [sqliteProfile, setSqliteProfile] = useState<AuthUserProfile>(() =>
    buildUserProfileWithRole(
      {
        id: 'local-default-op',
        email: 'engenheiro@parametrix.local',
        displayName: 'Operador Local',
        provider: 'proprietary',
        offlineMode: true,
      },
      'client'
    )
  );
  const [selectedAgentId, setSelectedAgentId] = useState<AgentProviderId>('gemini');
  const [systemResources, setSystemResources] = useState<SystemResourceSnapshot | null>(null);
  const [localLlmRec, setLocalLlmRec] = useState<LocalLlmRecommendation | null>(null);
  const [localQwenStatus, setLocalQwenStatus] = useState<{
    installed: boolean;
    ragExamplesCount: number;
    ready: boolean;
    modelSizeBytes?: number;
  } | null>(null);
  const [mcpEyeEvents, setMcpEyeEvents] = useState<McpEyeEvent[]>([]);
  const [camRestartCount, setCamRestartCount] = useState(0);
  const [lastVoiceStatus, setLastVoiceStatus] = useState<string | null>(null);
  const [lastServerVucHex, setLastServerVucHex] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<EcosystemChatMessage[]>([]);
  const [chatError, setChatError] = useState<string | null>(null);
  const [remoteDispatchStatus, setRemoteDispatchStatus] = useState<string | null>(null);
  const [logisticsNodes, setLogisticsNodes] = useState<LogisticsTelemetryNode[]>([]);
  const [computeNodes, setComputeNodes] = useState<ComputeShareNode[]>([]);
  const [erpRecords, setErpRecords] = useState<ErpCrmRecord[]>([]);
  const [remoteMachines, setRemoteMachines] = useState<RemoteMachineTarget[]>([]);
  const [mqttTelemetryFeed, setMqttTelemetryFeed] = useState<RemoteMqttTelemetryEvent[]>([]);
  const [camServiceJobs, setCamServiceJobs] = useState<CamServiceJob[]>([]);
  const [vucLedger, setVucLedger] = useState<VucLedgerEntry[]>([]);
  const [savedSessionLogs, setSavedSessionLogs] = useState<ProductionSessionLogRecord[]>([]);
  const [sessionRecordingEnabled, setSessionRecordingEnabled] = useState(true);
  const [delegatedByPo, setDelegatedByPo] = useState(true);
  const [sessionEvents, setSessionEvents] = useState<SessionInteractionEvent[]>([]);
  const mcpEyeRingRef = useRef<LmaxRingBuffer<McpEyeEvent>>(new LmaxRingBuffer<McpEyeEvent>(64));
  const sessionEventRingRef = useRef<LmaxRingBuffer<SessionInteractionEvent>>(
    new LmaxRingBuffer<SessionInteractionEvent>(128)
  );
  const [ecosystemInitialSubTab, setEcosystemInitialSubTab] = useState<
    'chat' | 'session' | 'logistics' | 'erp' | 'compute' | 'remote'
  >('chat');
  const [ecosystemInitialRoom, setEcosystemInitialRoom] = useState<PublicChatThemeId>('geral');
  const sessionIdRef = useRef<string>(
    `ps-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  );
  const sessionSeqRef = useRef(1);
  const lastPointerSampleRef = useRef<{ timestampMs: number; xPct: number; yPct: number } | null>(
    null
  );
  const prevSelectedComponentRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pushMcpEyeEventRef = useRef<
    ((
      direction: McpEyeEvent['direction'],
      source: string,
      summary: string,
      payload: unknown
    ) => void) | null
  >(null);

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

  // RAG + Agent MCP + Magic Pen & Per-Layer GD&T state
  const [ragDocs, setRagDocs] = useState<RagSourceDocument[]>([]);
  const [agentMessages, setAgentMessages] = useState<AgentChatMessage[]>([]);
  const [exportIsolatedOnly, setExportIsolatedOnly] = useState(true);
  const [featureOps, setFeatureOps] = useState<CadFeatureOperation[]>([]);
  const [layerToleranceOverrides, setLayerToleranceOverrides] = useState<
    Record<string, LayerToleranceSpec>
  >({});

  // 3D IX Viewport Display state
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

  const baseDesignParams = useMemo<ParametricDesignParams>(
    () =>
      activeTab === 'grasshopper'
        ? { ...designParams, ...graphEval.designPatch }
        : designParams,
    [activeTab, designParams, graphEval.designPatch]
  );

  // Baseline Curvature Target computed strictly from uncompensated params (prevents slider feedback loops)
  const curvatureTargetReport = useMemo(() => {
    const s = buildNurbsSurfaceFromParams(baseDesignParams);
    const m = tessellateNurbsSurface(
      s,
      baseDesignParams.ribCountU,
      baseDesignParams.ribCountV,
      baseDesignParams.ribHeightMm
    );
    const baseProfile = {
      ...(importedModel?.detectedProfile && activeSegment === importedModel.detectedProfile.segment
        ? importedModel.detectedProfile
        : resolvePartEngineeringProfile({
            filename: importedModel?.filename,
            layers: importedModel?.layers,
            preset: baseDesignParams.preset,
            segmentOverride: activeSegment,
            surfaceName: s.name,
          })),
      ...partProfileOverride,
      segment: activeSegment,
    };
    const baseFea = evaluateStructuralFea(
      s,
      m,
      baseDesignParams,
      display.materialFinish,
      feaSettings,
      display.isolationTarget,
      baseProfile,
      importedModel,
      featureOps
    );
    return analyzeCurvatureAndOptimizeWeight({
      surface: s,
      meshData: m,
      designParams: baseDesignParams,
      materialFinish: display.materialFinish,
      feaSettings,
      feaResult: baseFea,
      partProfile: baseProfile,
      isolationTarget: display.isolationTarget,
      importedModel,
      featureOps,
    });
  }, [
    baseDesignParams,
    importedModel,
    activeSegment,
    partProfileOverride,
    display.materialFinish,
    display.isolationTarget,
    feaSettings,
    featureOps,
  ]);

  const curvatureCompensationPreview = useMemo(() => {
    if (curvatureCompensationFactor <= 0.001) return null;
    const s = buildNurbsSurfaceFromParams(baseDesignParams);
    const baseProfile = {
      ...(importedModel?.detectedProfile && activeSegment === importedModel.detectedProfile.segment
        ? importedModel.detectedProfile
        : resolvePartEngineeringProfile({
            filename: importedModel?.filename,
            layers: importedModel?.layers,
            preset: baseDesignParams.preset,
            segmentOverride: activeSegment,
            surfaceName: s.name,
          })),
      ...partProfileOverride,
      segment: activeSegment,
    };
    return applyNurbsCurvatureCompensationFactor({
      baseParams: baseDesignParams,
      suggestedParams: curvatureTargetReport.suggestedParams,
      factor: curvatureCompensationFactor,
      materialFinish: display.materialFinish,
      feaSettings,
      partProfile: baseProfile,
      isolationTarget: display.isolationTarget,
      importedModel,
      featureOps,
    });
  }, [
    curvatureCompensationFactor,
    baseDesignParams,
    curvatureTargetReport.suggestedParams,
    display.materialFinish,
    feaSettings,
    importedModel,
    activeSegment,
    partProfileOverride,
    display.isolationTarget,
    featureOps,
  ]);

  const effectiveDesignParams = useMemo<ParametricDesignParams>(
    () => (curvatureCompensationPreview ? curvatureCompensationPreview.params : baseDesignParams),
    [curvatureCompensationPreview, baseDesignParams]
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
    const raw =
      importedModel?.components && importedModel.components.length > 0
        ? importedModel.components
        : buildParametricComponentParts(surface, meshData, partProfile);
    return applyMaterialProcessesToComponents(
      raw,
      display.componentMaterials,
      display.materialFinish,
      activeSegment
    );
  }, [
    importedModel,
    surface,
    meshData,
    partProfile,
    display.componentMaterials,
    display.materialFinish,
    activeSegment,
  ]);

  // 5. Generate CAM Toolpath & Tool-Change Visual FX State
  const toolpath = useMemo(
    () => generateCamToolpath(surface, meshData, effectiveCamSettings),
    [surface, meshData, effectiveCamSettings]
  );

  const camVisualState = useMemo(
    () =>
      evaluateCamProcessVisualState(
        effectiveCamSettings,
        toolpath,
        simProgress,
        camRestartCount
      ),
    [effectiveCamSettings, toolpath, simProgress, camRestartCount]
  );

  const activeProcessUrl = useMemo(() => {
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://parametrix.local';
    return buildProcessShareUrl({
      origin,
      tab: activeTab,
      subTab: activeTab === 'ecosystem' ? ecosystemInitialSubTab : undefined,
      room: ecosystemInitialRoom,
      processMachine: effectiveCamSettings.machineType,
      displayMode: display.mode,
      componentId: display.selectedComponentId,
      sessionId: sessionIdRef.current,
      sharedBy: sqliteProfile.handleAt,
    });
  }, [
    activeTab,
    ecosystemInitialSubTab,
    ecosystemInitialRoom,
    effectiveCamSettings.machineType,
    display.mode,
    display.selectedComponentId,
    sqliteProfile.handleAt,
  ]);

  const activeProvenanceMeta = useMemo<AgentProvenanceMetadata>(
    () =>
      buildAgentProvenanceMetadata({
        fileName: `${surface.id}_${effectiveCamSettings.machineType}`,
        responsibility: `Processo CAM ${effectiveCamSettings.machineType} / ${partProfile.partName}`,
        dirOrUrl: activeProcessUrl,
        poHumanoName: user?.displayName || sqliteProfile.displayName,
        poHumanoHandle: sqliteProfile.handleAt,
        poHumanoEmail: user?.email || sqliteProfile.email,
        delegatedByPo,
        llmAgentId: selectedAgentId,
        llmModel:
          localLlmRec?.modelId || sqliteProfile.agentConfig.agentName || 'qwen2.5-coder:0.5b',
        harnessId: `parametrix-harness-${sqliteProfile.agentConfig.agentName || 'v1'}`,
        status: 'runtime-sandbox',
      }),
    [
      surface.id,
      effectiveCamSettings.machineType,
      partProfile.partName,
      activeProcessUrl,
      user?.displayName,
      user?.email,
      sqliteProfile.displayName,
      sqliteProfile.handleAt,
      sqliteProfile.email,
      sqliteProfile.agentConfig.agentName,
      delegatedByPo,
      selectedAgentId,
      localLlmRec?.modelId,
    ]
  );

  const activeSessionLog = useMemo<ProductionSessionLogRecord>(
    () =>
      analyzeSessionRefinement({
        sessionId: sessionIdRef.current,
        userId: sqliteProfile.id,
        poHumano: `${user?.displayName || sqliteProfile.displayName} (${sqliteProfile.handleAt})`,
        llmAgent: `${selectedAgentId} · ${localLlmRec?.modelId || sqliteProfile.agentConfig.agentName || 'qwen2.5-coder:0.5b'}`,
        delegatedByPo,
        activeTab,
        processMachine: effectiveCamSettings.machineType,
        processUrl: activeProcessUrl,
        events: sessionEvents,
      }),
    [
      sqliteProfile.id,
      sqliteProfile.displayName,
      sqliteProfile.handleAt,
      sqliteProfile.agentConfig.agentName,
      user?.displayName,
      selectedAgentId,
      localLlmRec?.modelId,
      delegatedByPo,
      activeTab,
      effectiveCamSettings.machineType,
      activeProcessUrl,
      sessionEvents,
    ]
  );

  const recordSessionDiscreteAction = (
    kind: SessionActionKind,
    detail: string,
    overrides?: {
      tab?: WorkspaceTab;
      machine?: MachineType;
      componentId?: string | null;
    }
  ) => {
    if (!sessionRecordingEnabled) return;
    const seq = sessionSeqRef.current++;
    const evt = createSessionEvent({
      seq,
      kind,
      timestampMs: Date.now(),
      xPct: lastPointerSampleRef.current?.xPct ?? 50,
      yPct: lastPointerSampleRef.current?.yPct ?? 50,
      activeTab: overrides?.tab ?? activeTab,
      processMachine: overrides?.machine ?? effectiveCamSettings.machineType,
      selectedComponentId:
        overrides?.componentId !== undefined
          ? overrides.componentId
          : display.selectedComponentId,
      detail,
    });
    sessionEventRingRef.current.push(evt);
    setSessionEvents(sessionEventRingRef.current.toArray(false));
  };

  useEffect(() => {
    if (prevSelectedComponentRef.current === display.selectedComponentId) return;
    prevSelectedComponentRef.current = display.selectedComponentId;
    if (display.selectedComponentId) {
      recordSessionDiscreteAction(
        'component-select',
        `Componente selecionado: ${display.selectedComponentId}`
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display.selectedComponentId]);

  // 6. Evaluate Structural FEA with Certification Thresholds & Magic Pen Features
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
        importedModel,
        featureOps
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
      featureOps,
    ]
  );

  // 7. NURBS Curvature Analysis & Automatic Weight Optimization Report
  const curvatureOptReport = useMemo(
    () =>
      analyzeCurvatureAndOptimizeWeight({
        surface,
        meshData,
        designParams: effectiveDesignParams,
        materialFinish: display.materialFinish,
        feaSettings,
        feaResult,
        partProfile,
        isolationTarget: display.isolationTarget,
        importedModel,
        featureOps,
      }),
    [
      surface,
      meshData,
      effectiveDesignParams,
      display.materialFinish,
      feaSettings,
      feaResult,
      partProfile,
      display.isolationTarget,
      importedModel,
      featureOps,
    ]
  );

  // 8. Per-Layer GD&T Tolerances & NURBS Norm Compliance
  const layerToleranceSpecs = useMemo(
    () =>
      inferDefaultLayerSpecs({
        importedModel,
        components,
        partProfile,
        existingSpecs: layerToleranceOverrides,
      }),
    [importedModel, components, partProfile, layerToleranceOverrides]
  );

  const layerComplianceReport = useMemo(
    () =>
      evaluateLayerToleranceCompliance({
        surface,
        specs: layerToleranceSpecs,
        feaResult,
        partProfile,
      }),
    [surface, layerToleranceSpecs, feaResult, partProfile]
  );

  // 9. Deterministic SCOOBIII / VUC Mathematical Proof
  const scoobiiiProof = useMemo(
    () =>
      computeScoobiiiVucProof({
        surface,
        meshData,
        designParams: effectiveDesignParams,
        materialFinish: display.materialFinish,
        feaSettings,
        feaResult,
        partProfile,
        featureOps,
        importedModel,
      }),
    [
      surface,
      meshData,
      effectiveDesignParams,
      display.materialFinish,
      feaSettings,
      feaResult,
      partProfile,
      featureOps,
      importedModel,
    ]
  );

  const carbonReport = useMemo(
    () =>
      calculateCarbonFootprint({
        meshData,
        importedModel,
        materialFinish: display.materialFinish,
        camSettings: effectiveCamSettings,
        toolpath,
        featureOps,
      }),
    [meshData, importedModel, display.materialFinish, effectiveCamSettings, toolpath, featureOps]
  );

  const activeEngineeringArea: EngineeringArea =
    activeTab === 'cam' || activeTab === 'frostbite'
      ? 'cam'
      : activeTab === 'sustainability' || (activeTab === 'viewport' && display.mode === 'stress-heatmap')
        ? 'cae'
        : 'cad';

  const liveErpSnapshot = useMemo<OpenErpWorkspaceSnapshot>(
    () =>
      buildLiveErpWorkspaceSnapshot({
        surface,
        meshData,
        importedModel,
        featureOps,
        materialFinish: display.materialFinish,
        partProfile,
        feaResult,
        feaSettings,
        layerComplianceReport,
        carbonReport,
        camSettings: effectiveCamSettings,
        toolpath,
        camServiceJobs,
        remoteMachines,
        batchQty: erpBatchQty,
        targetMarginPct: erpMarginPct,
        taxRegime: erpTaxRegime,
        logisticsModal: erpLogisticsModal,
        distanceKm: erpDistanceKm,
        activeOperatorEmail: user?.email || sqliteProfile.email,
        activeOperatorHandle: sqliteProfile.handleAt,
        presetId: activePresetId,
      }),
    [
      surface,
      meshData,
      importedModel,
      featureOps,
      display.materialFinish,
      partProfile,
      feaResult,
      feaSettings,
      layerComplianceReport,
      carbonReport,
      effectiveCamSettings,
      toolpath,
      camServiceJobs,
      remoteMachines,
      erpBatchQty,
      erpMarginPct,
      erpTaxRegime,
      erpLogisticsModal,
      erpDistanceKm,
      user?.email,
      sqliteProfile.email,
      sqliteProfile.handleAt,
      activePresetId,
    ]
  );

  const scoobiiiTelemetry = useMemo(() => {
    if (!scoobiiiModalOpen) return null;
    return buildScoobiiiFullTelemetry({
      designParams: effectiveDesignParams,
      surface,
      materialFinish: display.materialFinish,
      feaSettings,
      feaResult,
      camSettings: effectiveCamSettings,
      toolpath,
      carbonReport,
      layerComplianceReport,
      partProfile,
      featureOps,
      scoobiiiProof,
      importedModel,
      erpRecords,
      camServiceJobs,
      remoteMachines,
      logisticsNodes,
      computeNodes,
      vucLedger,
      lastServerVucHex,
    });
  }, [
    scoobiiiModalOpen,
    effectiveDesignParams,
    surface,
    display.materialFinish,
    feaSettings,
    feaResult,
    effectiveCamSettings,
    toolpath,
    carbonReport,
    layerComplianceReport,
    partProfile,
    featureOps,
    scoobiiiProof,
    importedModel,
    erpRecords,
    camServiceJobs,
    remoteMachines,
    logisticsNodes,
    computeNodes,
    vucLedger,
    lastServerVucHex,
  ]);

  // Unified handler whenever any CAD file is loaded (via IX Menu, Onboarding, RAG, or Files Tab)
  // Automatically opens the 3D Viewer & Editor, frames the geometry, and sets context!
  const handleLoadImportedModel = (model: ImportedCadModel | null) => {
    setImportedModel(model);
    setActivePresetId(undefined);
    setCurvatureCompensationFactor(0);
    setPartProfileOverride({});
    setFeaBaseline(null);
    setFeaComparison(null);
    setFeatureOps([]);
    setLayerToleranceOverrides({});

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

  const handleUnifiedFileUpload = async (file: File) => {
    const model = await parseUploadedCadOrImageFile(file);
    handleLoadImportedModel(model);
    recordDeliverable({
      filename: file.name,
      kind: 'REPORT',
      summary: `Importado (${model.format}) · ${model.triangleCount.toLocaleString('pt-BR')} triângulos · ${model.components?.length ?? 1} peças`,
    });
  };

  const handleApplyFullPreset = (preset: FullWorkspacePreset, openEditor = true) => {
    setActivePresetId(preset.id);
    setCurvatureCompensationFactor(0);
    setDesignParams({ ...preset.designParams });
    setActiveSegment(preset.segment);
    setPartProfileOverride(preset.partProfileOverride ?? {});
    setFeaSettings({ ...preset.feaSettings });
    setCamSettings({ ...preset.camSettings });
    setFeaBaseline(null);
    setFeaComparison(null);
    setLayerToleranceOverrides({});

    const tpl = GRAPH_TEMPLATES.find((t) => t.id === preset.graphTemplateId);
    if (tpl) {
      setGraphNodes(tpl.nodes.map((n) => ({ ...n, params: { ...n.params } })));
      setGraphWires(tpl.wires.map((w) => ({ ...w })));
    }

    const model = preset.buildImportedModel ? preset.buildImportedModel() : null;
    setImportedModel(model);
    setFeatureOps(preset.initialFeatures ? [...preset.initialFeatures] : []);
    setDisplay((d) => ({
      ...d,
      mode: preset.displayMode,
      materialFinish: preset.materialFinish,
      showImportedOverlay: Boolean(model),
      showMachine: preset.showMachine ?? true,
      showToolpath: preset.showToolpath ?? true,
      isolationTarget: 'all',
      selectedComponentId: null,
      hiddenComponentIds: [],
      componentMaterials: {},
      componentRotations: {},
      assemblyRotationDeg: [0, 0, 0],
      explodeFactor: 0,
      perComponentPbr: true,
      fitViewTrigger: d.fitViewTrigger + 1,
    }));

    if (openEditor) {
      setActiveTab('viewport');
    }
  };

  const applyProcessShareUrl = (searchOrUrl: string) => {
    const parsed = parseProcessShareUrl(searchOrUrl);
    if (parsed.room) {
      setEcosystemInitialRoom(parsed.room);
    }
    if (
      parsed.subTab &&
      (['chat', 'session', 'logistics', 'erp', 'compute', 'remote'] as const).includes(
        parsed.subTab as 'chat'
      )
    ) {
      setEcosystemInitialSubTab(
        parsed.subTab as 'chat' | 'session' | 'logistics' | 'erp' | 'compute' | 'remote'
      );
    }
    if (parsed.processMachine) {
      const nextMachine = parsed.processMachine;
      const postMap: Record<MachineType, PostProcessorFormat> = {
        'powder-metal': 'slm-powder',
        'resin-sla': 'sla-resin',
        'robot-weld': 'weld-tig-mig',
        'laser-cut': 'laser-g',
        'robot-6axis': 'kuka-krl',
        manual: 'manual-sheet',
        'cnc-5axis': 'fanuc-nc',
        'cnc-3axis': 'fanuc-nc',
      };
      setCamSettings((prev) => ({
        ...prev,
        machineType: nextMachine,
        postFormat: postMap[nextMachine],
      }));
    }
    if (parsed.displayMode || parsed.componentId) {
      setDisplay((current) => ({
        ...current,
        ...(parsed.displayMode ? { mode: parsed.displayMode } : {}),
        ...(parsed.componentId ? { selectedComponentId: parsed.componentId } : {}),
      }));
    }
    if (parsed.tab) {
      setActiveTab(parsed.tab);
    }
  };

  // Deep link: ?preset=..., ?tab=cam&process=powder-metal&mode=component-pbr&part=...
  // abre o módulo e processo exato da URL compartilhada por sessão de usuário.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedPreset = params.get('preset');
    if (requestedPreset) {
      const preset = WORKSPACE_PROJECT_PRESETS.find((item) => item.id === requestedPreset);
      if (preset) {
        handleApplyFullPreset(preset, true);
      }
    }
    const requestedMode = params.get('mode');
    const requestedFinish = params.get('finish');
    const requestedView = params.get('view');
    if (requestedMode || requestedFinish || requestedView) {
      setDisplay((current) => ({
        ...current,
        ...(requestedMode && DISPLAY_MODES.includes(requestedMode as DisplayMode)
          ? { mode: requestedMode as DisplayMode }
          : {}),
        ...(requestedFinish && MATERIAL_FINISHES.includes(requestedFinish as MaterialFinish)
          ? { materialFinish: requestedFinish as MaterialFinish }
          : {}),
        ...(requestedView && CAMERA_PRESETS.includes(requestedView as CameraPreset)
          ? { cameraPreset: requestedView as CameraPreset, cameraTrigger: current.cameraTrigger + 1 }
          : {}),
      }));
    }
    applyProcessShareUrl(window.location.search);
    // Executa apenas na montagem inicial; estado inicial restaurado da URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAddFeatureOp = (
    op: Omit<CadFeatureOperation, 'id' | 'createdAt'>
  ): CadFeatureOperation => {
    const created: CadFeatureOperation = {
      ...op,
      id: `feat-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      createdAt: new Date().toLocaleTimeString('pt-BR'),
    };
    setFeatureOps((prev) => [created, ...prev]);
    return created;
  };

  const handleRemoveFeatureOp = (id: string) => {
    setFeatureOps((prev) => prev.filter((item) => item.id !== id));
  };

  const handleApplyCurvatureOptimization = () => {
    const beforeFea = feaResult;
    const beforeParams = effectiveDesignParams;
    const nextParams = curvatureOptReport.suggestedParams;

    const afterSurface = buildNurbsSurfaceFromParams(nextParams);
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
      importedModel,
      featureOps
    );

    const report = buildFeaComparisonReport(
      beforeFea,
      afterFea,
      beforeParams,
      nextParams,
      curvatureOptReport.engineeringRationale,
      partProfile
    );
    setFeaBaseline({ fea: beforeFea, params: beforeParams });
    setFeaComparison(report);
    setDesignParams(nextParams);
    setCurvatureCompensationFactor(0);
    recordDeliverable({
      filename: `${afterSurface.id}_otimizacao_curvatura.md`,
      kind: 'REPORT',
      summary: `Curvatura NURBS: massa -${curvatureOptReport.weightReductionPct}% (${beforeFea.totalMassKg}→${afterFea.totalMassKg} kg · SF ${afterFea.safetyFactor}×)`,
    });
  };

  const handleCommitCurvatureCompensation = () => {
    if (!curvatureCompensationPreview) return;
    const beforeSurface = buildNurbsSurfaceFromParams(baseDesignParams);
    const beforeMesh = tessellateNurbsSurface(
      beforeSurface,
      baseDesignParams.ribCountU,
      baseDesignParams.ribCountV,
      baseDesignParams.ribHeightMm
    );
    const beforeFea = evaluateStructuralFea(
      beforeSurface,
      beforeMesh,
      baseDesignParams,
      display.materialFinish,
      feaSettings,
      display.isolationTarget,
      partProfile,
      importedModel,
      featureOps
    );
    const report = buildFeaComparisonReport(
      beforeFea,
      curvatureCompensationPreview.feaResult,
      baseDesignParams,
      curvatureCompensationPreview.params,
      `Compensação NURBS aplicada em ${Math.round(curvatureCompensationPreview.factor * 100)}%: espessura ${baseDesignParams.thicknessMm}→${curvatureCompensationPreview.params.thicknessMm}mm, flecha ${baseDesignParams.archHeight}→${curvatureCompensationPreview.params.archHeight}mm.`,
      partProfile
    );
    setFeaBaseline({ fea: beforeFea, params: baseDesignParams });
    setFeaComparison(report);
    setDesignParams(curvatureCompensationPreview.params);
    setCurvatureCompensationFactor(0);
    recordDeliverable({
      filename: `${curvatureCompensationPreview.surface.id}_comp_curvatura_${Math.round(curvatureCompensationPreview.factor * 100)}pct.md`,
      kind: 'REPORT',
      summary: `Compensação NURBS ${(curvatureCompensationPreview.factor * 100).toFixed(0)}%: ${curvatureCompensationPreview.weightBeforeKg}→${curvatureCompensationPreview.weightAfterKg} kg · SF ${curvatureCompensationPreview.safetyFactor}×`,
    });
  };

  const handleUpdateLayerTolerance = (
    layerName: string,
    patch: Partial<LayerToleranceSpec>
  ) => {
    const current =
      layerToleranceSpecs.find((s) => s.layerName === layerName) ?? {
        layerName,
        toleranceClass: 'm' as const,
        linearToleranceMm: 0.15,
        profileToleranceMm: 0.25,
        flatnessMm: 0.15,
        criticalGdtSymbol: 'profile' as const,
        enabled: true,
      };
    setLayerToleranceOverrides((prev) => ({
      ...prev,
      [layerName]: { ...current, ...patch, layerName },
    }));
  };

  const handleRefineNurbsForTolerances = () => {
    const targetDiv = Math.max(
      designParams.uDivisions,
      designParams.vDivisions,
      layerComplianceReport.suggestedMinDivisions
    );
    setDesignParams((prev) => ({
      ...prev,
      uDivisions: targetDiv,
      vDivisions: targetDiv,
    }));
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

  // Poll OS/Hardware telemetry & hydrate local SQLite + WebSocket ecosystem bus
  useEffect(() => {
    let active = true;

    const fetchResources = async () => {
      try {
        const gpuParam = detectedWebglGpu ? `?gpuName=${encodeURIComponent(detectedWebglGpu)}` : '';
        const resp = await fetch(`/api/system/resources${gpuParam}`);
        if (!resp.ok || !active) return;
        const data = (await resp.json()) as {
          snapshot: SystemResourceSnapshot;
          recommendation: LocalLlmRecommendation;
          localQwenStatus?: {
            installed: boolean;
            ragExamplesCount: number;
            ready: boolean;
            modelSizeBytes?: number;
          };
        };
        const targetCap = resolveAdaptiveRingCapacity(data.snapshot.freeRamGb);
        if (mcpEyeRingRef.current.capacity !== targetCap) {
          const prevEye = mcpEyeRingRef.current.toArray(false);
          const nextRing = new LmaxRingBuffer<McpEyeEvent>(targetCap);
          for (const item of prevEye) nextRing.push(item);
          mcpEyeRingRef.current = nextRing;
        }
        setSystemResources(data.snapshot);
        setLocalLlmRec(data.recommendation);
        if (data.localQwenStatus) {
          setLocalQwenStatus(data.localQwenStatus);
        }
      } catch {
        // Offline tolerance
      }
    };

    const fetchSqliteState = async () => {
      try {
        const resp = await fetch('/api/sqlite/state');
        if (!resp.ok || !active) return;
        const data = (await resp.json()) as {
          erp?: ErpCrmRecord[];
          chat?: EcosystemChatMessage[];
          logistics?: LogisticsTelemetryNode[];
          computeNodes?: ComputeShareNode[];
          remoteMachines?: RemoteMachineTarget[];
          camServiceJobs?: CamServiceJob[];
          vucLedger?: VucLedgerEntry[];
          sessionLogs?: ProductionSessionLogRecord[];
        };
        if (data.erp) setErpRecords(data.erp);
        if (data.chat) setChatMessages(data.chat);
        if (data.logistics) setLogisticsNodes(data.logistics);
        if (data.computeNodes) setComputeNodes(data.computeNodes);
        if (data.remoteMachines) setRemoteMachines(data.remoteMachines);
        if (data.camServiceJobs) setCamServiceJobs(data.camServiceJobs);
        if (data.vucLedger) setVucLedger(data.vucLedger);
        if (data.sessionLogs) setSavedSessionLogs(data.sessionLogs);
      } catch {
        // Offline tolerance
      }
    };

    void fetchResources();
    void fetchSqliteState();
    const resTimer = window.setInterval(() => {
      void fetchResources();
    }, 15000);

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let keepaliveTimer: number | null = null;
    let reconnectAttempt = 0;

    const connectWebSocket = () => {
      if (!active) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const nextWs = new WebSocket(`${proto}//${window.location.host}/ws`);
        ws = nextWs;
        wsRef.current = nextWs;

        nextWs.onopen = () => {
          reconnectAttempt = 0;
          try {
            nextWs.send(
              JSON.stringify({
                type: 'mcp:bridge_ready',
                payload: { ready: true, protocol: '2024-11-05' },
              })
            );
          } catch {
            // Ignore send failure
          }
          if (keepaliveTimer !== null) {
            window.clearInterval(keepaliveTimer);
          }
          keepaliveTimer = window.setInterval(() => {
            if (nextWs.readyState === WebSocket.OPEN) {
              try {
                nextWs.send(JSON.stringify({ type: 'ping' }));
              } catch {
                // Ignore keepalive error
              }
            }
          }, 25000);
        };

        nextWs.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as { type?: string; payload?: unknown };
            if (msg.type === 'pong') return;
            if (msg.type === 'ecosystem:sync' && msg.payload) {
              const sync = msg.payload as {
                chat?: EcosystemChatMessage[];
                logistics?: LogisticsTelemetryNode[];
                computeNodes?: ComputeShareNode[];
              };
              if (Array.isArray(sync.chat)) {
                setChatMessages((prev) => {
                  const seen = new Set(prev.map((m) => m.id));
                  const merged = [...prev];
                  for (const item of sync.chat!) {
                    if (!seen.has(item.id)) {
                      merged.push(item);
                      seen.add(item.id);
                    }
                  }
                  return merged;
                });
              }
              if (Array.isArray(sync.logistics) && sync.logistics.length > 0) {
                setLogisticsNodes(sync.logistics);
              }
              if (Array.isArray(sync.computeNodes) && sync.computeNodes.length > 0) {
                setComputeNodes(sync.computeNodes);
              }
            } else if (msg.type === 'chat:message' && msg.payload) {
              const incoming = msg.payload as EcosystemChatMessage;
              setChatMessages((prev) =>
                prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
              );
            } else if (msg.type === 'logistics:location' && msg.payload) {
              const node = msg.payload as LogisticsTelemetryNode;
              setLogisticsNodes((prev) => {
                const filtered = prev.filter((n) => n.id !== node.id);
                return [node, ...filtered];
              });
            } else if (msg.type === 'compute:pool' && Array.isArray(msg.payload)) {
              setComputeNodes(msg.payload as ComputeShareNode[]);
            } else if (msg.type === 'mcp:eye' && msg.payload) {
              const eyeEvt = msg.payload as McpEyeEvent;
              if (mcpEyeRingRef.current.pushUniqueBy(eyeEvt, (e) => e.id)) {
                setMcpEyeEvents(mcpEyeRingRef.current.toArray(true));
              }
            } else if (msg.type === 'cam:service' && msg.payload) {
              const job = msg.payload as CamServiceJob;
              setCamServiceJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)]);
            } else if (msg.type === 'remote:machine' && msg.payload) {
              const rm = msg.payload as RemoteMachineTarget;
              setRemoteMachines((prev) => [rm, ...prev.filter((m) => m.id !== rm.id)]);
            } else if (msg.type === 'remote:mqtt' && msg.payload) {
              const tel = msg.payload as RemoteMqttTelemetryEvent;
              setMqttTelemetryFeed((prev) =>
                prev.some((t) => t.id === tel.id) ? prev : [tel, ...prev.slice(0, 29)]
              );
            } else if (msg.type === 'session:log' && msg.payload) {
              const slog = msg.payload as ProductionSessionLogRecord;
              setSavedSessionLogs((prev) => [slog, ...prev.filter((l) => l.id !== slog.id)]);
            } else if (msg.type === 'chat:error' && msg.payload) {
              const errObj = msg.payload as { error?: string };
              if (errObj.error) setChatError(errObj.error);
            } else if (msg.type === 'mcp:rpc_request' && msg.payload) {
              const req = msg.payload as {
                requestId?: string;
                name?: string;
                args?: Record<string, unknown>;
              };
              if (req.requestId && req.name) {
                try {
                  const log = executeMcpToolCall(req.name, req.args ?? {}, mcpContextRef.current);
                  pushMcpEyeEventRef.current?.(
                    'mcp-input',
                    `Hermes.${req.name}`,
                    log.responseJson.slice(0, 120),
                    req.args ?? {}
                  );
                  if (nextWs.readyState === WebSocket.OPEN) {
                    nextWs.send(
                      JSON.stringify({
                        type: 'mcp:rpc_response',
                        payload: {
                          requestId: req.requestId,
                          ok: log.status === 'ok',
                          log,
                        },
                      })
                    );
                  }
                } catch (err) {
                  if (nextWs.readyState === WebSocket.OPEN) {
                    nextWs.send(
                      JSON.stringify({
                        type: 'mcp:rpc_response',
                        payload: {
                          requestId: req.requestId,
                          ok: false,
                          error: err instanceof Error ? err.message : String(err),
                        },
                      })
                    );
                  }
                }
              }
            }
          } catch {
            // Ignore invalid WS frame
          }
        };

        nextWs.onerror = () => {
          // Close triggers exponential reconnect cleanly
          if (nextWs.readyState === WebSocket.OPEN || nextWs.readyState === WebSocket.CONNECTING) {
            nextWs.close();
          }
        };

        nextWs.onclose = () => {
          if (wsRef.current === nextWs) {
            wsRef.current = null;
          }
          if (keepaliveTimer !== null) {
            window.clearInterval(keepaliveTimer);
            keepaliveTimer = null;
          }
          if (!active) return;
          const delayMs = Math.min(15000, 1000 * Math.pow(2, reconnectAttempt));
          reconnectAttempt += 1;
          reconnectTimer = window.setTimeout(connectWebSocket, delayMs);
        };
      } catch {
        // Ignore WS setup failure in restricted test environments
      }
    };

    connectWebSocket();

    return () => {
      active = false;
      window.clearInterval(resTimer);
      if (keepaliveTimer !== null) window.clearInterval(keepaliveTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  useEffect(() => {
    if (!detectedWebglGpu) return;
    let active = true;
    void fetch(`/api/system/resources?gpuName=${encodeURIComponent(detectedWebglGpu)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: {
        snapshot?: SystemResourceSnapshot;
        recommendation?: LocalLlmRecommendation;
        localQwenStatus?: {
          installed: boolean;
          ragExamplesCount: number;
          ready: boolean;
          modelSizeBytes?: number;
        };
      } | null) => {
        if (!active || !data?.snapshot) return;
        setSystemResources(data.snapshot);
        if (data.recommendation) setLocalLlmRec(data.recommendation);
        if (data.localQwenStatus) setLocalQwenStatus(data.localQwenStatus);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [detectedWebglGpu]);

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
      filename: d.filename.slice(0, 160),
      summary: d.summary.slice(0, 240),
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
      importedModel,
      featureOps
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
    recordSessionDiscreteAction('fea-run', `FEA executado (SF=${evaluatedFea.safetyFactor.toFixed(2)}×)`);
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
      importedModel,
      featureOps
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
        summary: `${useIsolated ? `OpenNURBS peça isolada (${display.isolationTarget})` : `OpenNURBS v7 (${surface.uCount}x${surface.vCount} CPs)`} · GOS7 Agente=${selectedAgentId} PO=${sqliteProfile.handleAt} (${delegatedByPo ? 'Delegado' : 'Direto'})`,
      });
      recordSessionDiscreteAction('export-artifact', `Export ${name}`);
      return name;
    }
    if (fmt === 'stl') {
      const name = `${base}.stl`;
      triggerBlobDownload(exportBinarySTL(evaluated, surface.name), name);
      recordDeliverable({
        filename: name,
        kind: 'STL',
        summary: `${useIsolated ? `Peça ${display.isolationTarget}` : 'Malha binária'} (${evaluated.triangleCount} triângulos) · GOS7 Agente=${selectedAgentId} PO=${sqliteProfile.handleAt} (${delegatedByPo ? 'Delegado' : 'Direto'})`,
      });
      recordSessionDiscreteAction('export-artifact', `Export ${name}`);
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
        summary: `${useIsolated ? `DXF R2000 peça isolada (${display.isolationTarget})` : `AutoCAD R2000 (3DFACE + Isocurvas + CAM)`} · GOS7 Agente=${selectedAgentId} PO=${sqliteProfile.handleAt}`,
      });
      recordSessionDiscreteAction('export-artifact', `Export ${name}`);
      return name;
    }
    const name = `${base}_cam.${fmt}`;
    const gcodeWithProvenance = injectGos7ProvenanceIntoTextArtifact(
      toolpath.postCode,
      {
        ...activeProvenanceMeta,
        fileName: name,
        responsibility: `Código CAM ${effectiveCamSettings.machineType} · ${partProfile.partName}`,
      },
      fmt
    );
    triggerBlobDownload(new Blob([gcodeWithProvenance], { type: 'text/plain;charset=utf-8' }), name);
    recordDeliverable({
      filename: name,
      kind: fmt === 'src' ? 'SRC' : 'NC',
      summary: `Código CAM (${toolpath.spindleRpm} RPM, ${toolpath.cuttingLengthMm} mm) · GOS7 Agente=${selectedAgentId} PO=${sqliteProfile.handleAt}`,
    });
    recordSessionDiscreteAction('export-artifact', `Export ${name}`);
    return name;
  };

  const handleResetCadArea = () => {
    setImportedModel(null);
    setActivePresetId(undefined);
    setCurvatureCompensationFactor(0);
    setFeatureOps([]);
    setCpOverrides({});
    setSelectedControlPoint(null);
    setPartProfileOverride({});
    setDisplay((d) => ({
      ...d,
      mode: 'component-pbr',
      explodeFactor: 0,
      assemblyRotationDeg: [0, 0, 0],
      componentMaterials: {},
      componentRotations: {},
      isolationTarget: 'all',
      selectedComponentId: null,
      hiddenComponentIds: [],
      fitViewTrigger: d.fitViewTrigger + 1,
    }));
    setCadResetCount((c) => c + 1);
    setLastVoiceStatus(`Área CAD reiniciada (#${cadResetCount + 1}) para geometria paramétrica limpa.`);
    recordSessionDiscreteAction('cad-reset', `Reinício CAD #${cadResetCount + 1}`);
    pushMcpEyeEvent(
      'cam-output',
      'CAD.AreaReset',
      `Área CAD "${partProfile.partName}" reiniciada isoladamente sem afetar fila CAM.`,
      { partName: partProfile.partName, cadResetCount: cadResetCount + 1 }
    );
  };

  const handleResetCaeArea = () => {
    setFeaBaseline(null);
    setFeaComparison(null);
    setLayerToleranceOverrides({});
    setFeaSettings({
      loadNewtons: partProfile.safetyCriteria.recommendedLoadN,
      supportMode: partProfile.safetyCriteria.supportMode,
      loadPattern: partProfile.safetyCriteria.loadPattern,
      targetSafetyFactor: partProfile.safetyCriteria.minSafetyFactor,
    });
    setDisplay((d) => ({
      ...d,
      mode: d.mode === 'stress-heatmap' ? 'component-pbr' : d.mode,
      stressComparisonView: 'current',
    }));
    setCaeResetCount((c) => c + 1);
    setLastVoiceStatus(`Área CAE / FEA reiniciada (#${caeResetCount + 1}) para os critérios da norma.`);
    recordSessionDiscreteAction('cae-reset', `Reinício CAE #${caeResetCount + 1}`);
    pushMcpEyeEvent(
      'cam-output',
      'CAE.AreaReset',
      `Estudo CAE / Fadiga / GD&T reiniciado para baseline da norma ${partProfile.certifications.join(', ')}.`,
      { caeResetCount: caeResetCount + 1, targetSafetyFactor: partProfile.safetyCriteria.minSafetyFactor }
    );
  };

  const handleSaveErpSnapshotToDrive = async (snapshot: OpenErpWorkspaceSnapshot) => {
    if (!googleAccessToken) {
      throw new Error('Conecte o Google Drive na sessão ativa para exportar a cotação ERP.');
    }
    const slug = (user?.email?.split('@')[0] || sqliteProfile.email.split('@')[0] || 'operador').replace(/[^a-zA-Z0-9_-]/g, '_');
    const folder = await ensureUserDriveProjectFolder(googleAccessToken, slug);
    const filename = `erp_open_${snapshot.partName.toLowerCase().replace(/[^a-z0-9_-]+/g, '_')}_${Date.now()}.parametrix-erp.json`;
    await saveFileToDriveFolder(
      googleAccessToken,
      folder.folderId,
      filename,
      JSON.stringify(snapshot, null, 2),
      'application/json'
    );
    recordDeliverable({
      filename,
      kind: 'REPORT',
      summary: `Cotação ERP Open (${snapshot.pricingAndRoi.batchQty} un. · ROI ${(snapshot.pricingAndRoi.roiPct ?? 0).toFixed(1)}%) salva no Google Drive`,
    });
    setLastVoiceStatus(`Cotação ERP "${filename}" salva na pasta ${folder.folderName} do Google Drive.`);
  };

  const handleResetPartAndProduction = () => {
    setFeatureOps([]);
    setCpOverrides({});
    setSelectedControlPoint(null);
    setFeaBaseline(null);
    setFeaComparison(null);
    setPartProfileOverride({});
    setSimPlaying(false);
    setSimProgress(0);
    setDisplay((d) => ({
      ...d,
      componentMaterials: {},
      componentRotations: {},
      isolationTarget: 'all',
      selectedComponentId: null,
      hiddenComponentIds: [],
      fitViewTrigger: d.fitViewTrigger + 1,
    }));
    setCamServiceJobs([]);
    setLastVoiceStatus('Peça resetada e base de produção CAM limpa.');
    pushMcpEyeEvent(
      'cam-output',
      'CAD.BaselineReset',
      `Peça "${partProfile.partName}" resetada e base de produção limpa do começo ao fim.`,
      { partName: partProfile.partName }
    );
    void fetch('/api/sqlite/cam-jobs/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partName: partProfile.partName }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((resData: { vucHash?: string } | null) => {
        if (resData?.vucHash) {
          setLastServerVucHex(resData.vucHash);
        }
      })
      .catch(() => {});
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
    featureOps,
    scoobiiiProof,
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
    onAddFeatureOp: handleAddFeatureOp,
    onRunFea: handleRunFea,
    onGenerateOptimizedGeometry: handleGenerateOptimizedGeometry,
    onResetPartBaseline: handleResetPartAndProduction,
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

  const handleExecuteMagicPenMcpPrompt = async (
    prompt: string,
    pick: {
      point: [number, number, number];
      normal: [number, number, number];
      componentId: string;
      componentName: string;
      widthMm: number;
      lengthMm: number;
    }
  ): Promise<{ summary: string }> => {
    const lower = prompt.toLowerCase();
    const threadMatch = lower.match(/\bm(3|4|5|6|8|10|12)\b/i);
    const threadSpec = (
      threadMatch ? `M${threadMatch[1]}` : 'M6'
    ) as IsoThreadSpec;

    const rhinoParsed = parseRhinoCommandPrompt(prompt);
    if (rhinoParsed.matched && rhinoParsed.kind) {
      const log = executeMcpToolCall(
        'cad_magic_pen_feature',
        {
          kind: rhinoParsed.kind,
          targetComponentId: pick.componentId,
          point: pick.point,
          normal: pick.normal,
          widthMm: Math.max(4, Math.round(pick.widthMm)),
          lengthMm: Math.max(6, Math.round(pick.lengthMm)),
          depthMm: rhinoParsed.depthMm ?? 12,
          radiusMm: rhinoParsed.radiusMm,
          wallThicknessMm: rhinoParsed.wallThicknessMm,
          angleDeg: rhinoParsed.angleDeg,
          count: rhinoParsed.count,
          axis: rhinoParsed.axis,
          rhinoCommand: rhinoParsed.rhinoCommand,
          label: `Rhino ${rhinoParsed.rhinoCommand} (${pick.componentName})`,
        },
        mcpContextRef.current
      );
      if (log.status === 'ok') {
        return {
          summary: `Comando Rhino ${rhinoParsed.rhinoCommand} executado em ${pick.componentName} e auditado no VUC.`,
        };
      }
    }

    const extendedParsed = parseExtendedMagicPenPrompt(prompt);
    if (extendedParsed.matched && extendedParsed.kind) {
      const log = executeMcpToolCall(
        'cad_magic_pen_feature',
        {
          kind: extendedParsed.kind,
          targetComponentId: pick.componentId,
          point: pick.point,
          normal: pick.normal,
          widthMm: extendedParsed.widthMm ?? Math.max(4, Math.round(pick.widthMm)),
          lengthMm: extendedParsed.lengthMm ?? Math.max(6, Math.round(pick.lengthMm)),
          diameterMm: extendedParsed.diameterMm,
          depthMm: extendedParsed.depthMm ?? 12,
          radiusMm: extendedParsed.radiusMm,
          wallThicknessMm: extendedParsed.wallThicknessMm,
          angleDeg: extendedParsed.angleDeg,
          count: extendedParsed.count,
          axis: extendedParsed.axis,
          rhinoCommand: extendedParsed.command,
          label: `${extendedParsed.label} (${pick.componentName})`,
        },
        mcpContextRef.current
      );
      if (log.status === 'ok') {
        return {
          summary: `${extendedParsed.label} aplicado em ${pick.componentName} e auditado no VUC.`,
        };
      }
    }

    if (/parafuso|rosca|bolt|screw|fixa/i.test(lower)) {
      const log = executeMcpToolCall(
        'cad_magic_pen_feature',
        {
          kind: 'threaded-bolt',
          targetComponentId: pick.componentId,
          point: pick.point,
          normal: pick.normal,
          threadSpec,
          depthMm: 16,
          label: `Parafuso ${threadSpec} (${pick.componentName})`,
        },
        mcpContextRef.current
      );
      if (log.status === 'ok') {
        return {
          summary: `Parafuso métrico ${threadSpec} inserido em ${pick.componentName} e verificado no VUC.`,
        };
      }
    }

    if (/rasgo|slot|recorte|corte|chaveta/i.test(lower)) {
      const log = executeMcpToolCall(
        'cad_magic_pen_feature',
        {
          kind: 'slot-cutout',
          targetComponentId: pick.componentId,
          point: pick.point,
          normal: pick.normal,
          widthMm: Math.max(8, Math.round(pick.widthMm)),
          lengthMm: Math.max(16, Math.round(pick.lengthMm)),
          depthMm: 10,
          label: `Rasgo Paramétrico (${pick.componentName})`,
        },
        mcpContextRef.current
      );
      if (log.status === 'ok') {
        return {
          summary: `Rasgo paramétrico aplicado em ${pick.componentName} (${Math.round(pick.widthMm)}×${Math.round(pick.lengthMm)}mm).`,
        };
      }
    }

    if (/furo|hole|broca|perfur/i.test(lower)) {
      const log = executeMcpToolCall(
        'cad_magic_pen_feature',
        {
          kind: 'through-hole',
          targetComponentId: pick.componentId,
          point: pick.point,
          normal: pick.normal,
          diameterMm: 10,
          depthMm: 18,
          label: `Furo Ø10mm (${pick.componentName})`,
        },
        mcpContextRef.current
      );
      if (log.status === 'ok') {
        return {
          summary: `Furo passante Ø10mm aplicado em ${pick.componentName}.`,
        };
      }
    }

    // Fallback to full Gemini + MCP Agent backend with spatial coordinates
    try {
      const resp = await fetch('/api/rag-mcp-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userMessage: `Na peça ${pick.componentName} (ID ${pick.componentId}) no ponto [${pick.point.map((n) => n.toFixed(1)).join(', ')}] com área ${pick.widthMm.toFixed(1)}x${pick.lengthMm.toFixed(1)}mm: ${prompt}`,
          ragChunks: ragDocs.slice(0, 6).map((d, idx) => ({
            docTitle: d.title,
            index: idx + 1,
            text: d.chunks?.[0]?.text || d.summary,
          })),
          cadContext: {
            activeSegment,
            partProfile,
            components: components.map((c) => ({
              id: c.id,
              name: c.name,
              family: c.family,
              subFamily: c.subFamily,
            })),
            designParams,
            feaResult: {
              maxStressMpa: feaResult.maxStressMpa,
              safetyFactor: feaResult.safetyFactor,
              status: feaResult.status,
            },
          },
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as {
          text?: string;
          functionCalls?: { id?: string; name: string; args?: Record<string, unknown> }[];
        };
        const executed: string[] = [];
        for (const fc of data.functionCalls ?? []) {
          const log = executeMcpToolCall(fc.name, fc.args ?? {}, mcpContextRef.current);
          if (log.status === 'ok') executed.push(fc.name);
        }
        return {
          summary:
            executed.length > 0
              ? `MCP (${executed.join(', ')}): ${data.text || 'Operação concluída.'}`
              : data.text || 'Comando analisado via agente MCP.',
        };
      }
    } catch {
      // Deterministic safety net if offline/rate-limited
    }

    const fallbackLog = executeMcpToolCall(
      'cad_magic_pen_feature',
      {
        kind: 'rib-boss',
        targetComponentId: pick.componentId,
        point: pick.point,
        normal: pick.normal,
        widthMm: Math.max(8, Math.round(pick.widthMm)),
        lengthMm: Math.max(12, Math.round(pick.lengthMm)),
        depthMm: 10,
        label: `Reforço / Feature MCP (${pick.componentName})`,
      },
      mcpContextRef.current
    );
    return {
      summary:
        fallbackLog.status === 'ok'
          ? `Reforço paramétrico local criado em ${pick.componentName} conforme pedido.`
          : 'Não foi possível aplicar a operação no componente.',
    };
  };

  const pushMcpEyeEvent = (
    direction: McpEyeEvent['direction'],
    source: string,
    summary: string,
    payload: unknown
  ) => {
    const evt = createMcpEyeEvent(direction, source, summary, payload);
    mcpEyeRingRef.current.push(evt);
    setMcpEyeEvents(mcpEyeRingRef.current.toArray(true));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'mcp:eye', payload: evt }));
    }
  };
  pushMcpEyeEventRef.current = pushMcpEyeEvent;

  const defaultPostForMachine = (machineType: MachineType): PostProcessorFormat => {
    switch (machineType) {
      case 'powder-metal':
        return 'slm-powder';
      case 'resin-sla':
        return 'sla-resin';
      case 'robot-weld':
        return 'weld-tig-mig';
      case 'laser-cut':
        return 'laser-g';
      case 'robot-6axis':
        return 'kuka-krl';
      case 'manual':
        return 'manual-sheet';
      default:
        return 'fanuc-nc';
    }
  };

  const handleRestartCamProcess = (overrideMachine?: MachineType) => {
    const targetMachine = overrideMachine ?? camSettings.machineType;
    if (overrideMachine) {
      setCamSettings((prev) => ({
        ...prev,
        machineType: overrideMachine,
        postFormat: defaultPostForMachine(overrideMachine),
        ...(overrideMachine === 'powder-metal' || overrideMachine === 'resin-sla'
          ? {
              additiveConfig:
                prev.machineType === overrideMachine && prev.additiveConfig
                  ? prev.additiveConfig
                  : getDefaultAdditiveSettings(overrideMachine),
            }
          : {}),
      }));
    }
    setSimProgress(0);
    setSimPlaying(true);
    setCamRestartCount((c) => c + 1);
    setDisplay((d) => ({ ...d, showMachine: true, showToolpath: true }));
    recordSessionDiscreteAction('cam-restart', `Reinício CAM (${targetMachine})`, {
      machine: targetMachine,
    });
    pushMcpEyeEvent(
      'cam-output',
      `CAM.${targetMachine}`,
      `Reinício produtivo CAM #${camRestartCount + 1} (${targetMachine}) · barra zerada com feixe/ferramenta visível`,
      { machineType: targetMachine, restartCount: camRestartCount + 1 }
    );
  };

  const handleLaunchCamProgram = (programId: string) => {
    const prog = getCamProductionProgram(programId);
    if (!prog) return;
    setImportedModel(null);
    setPartProfileOverride({
      manufacturer: prog.category === 'datacenter' ? 'Frostbite DC Systems' : 'Frostbite Robotics',
      modelCode: prog.id.toUpperCase(),
      partName: prog.title,
      intendedUse: prog.description,
    });
    setActiveSegment(prog.category === 'humanoid' ? 'robotica' : 'industrial-cnc');
    setDesignParams((prev) => ({ ...prev, ...prog.designParamsPatch }));
    setDisplay((d) => ({
      ...d,
      materialFinish: prog.material,
      showMachine: true,
      showToolpath: true,
      fitViewTrigger: d.fitViewTrigger + 1,
    }));
    setCamSettings((prev) => ({
      ...prev,
      machineType: prog.machineType,
      postFormat: prog.postFormat,
      strategy: prog.strategy,
      toolId: prog.toolId,
      ...(prog.additiveConfig ? { additiveConfig: prog.additiveConfig } : {}),
    }));
    setSimProgress(0);
    setSimPlaying(true);
    setCamRestartCount((c) => c + 1);
    setActiveTab('cam');
    pushMcpEyeEvent(
      'cam-output',
      `CAM.Program.${prog.id}`,
      `Programa CAM iniciado/reiniciado do zero (0%): ${prog.title} (${prog.machineType})`,
      { programId: prog.id, category: prog.category, machineType: prog.machineType }
    );
  };

  const handleSubmitCamService = async (payload: CamServiceSubmissionInput) => {
    const resp = await fetch('/api/cam/services', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { job?: CamServiceJob; error?: string };
    if (!resp.ok || !data.job) {
      throw new Error(data.error || 'Erro ao registrar serviço CAM no servidor.');
    }
    const createdJob = data.job;
    setCamServiceJobs((prev) => [createdJob, ...prev.filter((j) => j.id !== createdJob.id)]);
    handleRestartCamProcess(createdJob.machineType);
    pushMcpEyeEvent(
      'cam-output',
      `CAM.Service.${createdJob.sourceKind}`,
      `Serviço CAM criado (${createdJob.sourceKind}): ${createdJob.title} · VUC ${createdJob.vucHash.slice(0, 14)}`,
      { jobId: createdJob.id, vucHash: createdJob.vucHash }
    );
  };

  const handleRestartCamServiceJob = async (jobId: string) => {
    const resp = await fetch(`/api/cam/services/${encodeURIComponent(jobId)}/restart`, {
      method: 'POST',
    });
    if (!resp.ok) return;
    const data = (await resp.json()) as { job?: CamServiceJob };
    if (!data.job) return;
    const restarted = data.job;
    setCamServiceJobs((prev) => [restarted, ...prev.filter((j) => j.id !== restarted.id)]);
    if (restarted.programId && getCamProductionProgram(restarted.programId)) {
      handleLaunchCamProgram(restarted.programId);
    } else {
      handleRestartCamProcess(restarted.machineType);
    }
  };

  const handleSqliteOfflineLogin = async (payload: {
    email: string;
    displayName: string;
    provider: AuthProviderKind;
    role: EcosystemRole;
    password?: string;
    handleAt?: string;
    phone?: string;
    address?: string;
    offlineMode: boolean;
  }) => {
    if (!payload.offlineMode && backendProfile && backendProfile.email.toLowerCase() === payload.email.trim().toLowerCase()) {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const profResp = await fetch('/api/auth/profile', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          userId: backendProfile.id,
          role: payload.role,
          handleAt: payload.handleAt ?? backendProfile.handleAt,
          phone: payload.phone ?? backendProfile.phone,
          address: payload.address ?? backendProfile.address,
          computeSharePct: backendProfile.computeSharePct,
          agentConfig: backendProfile.agentConfig,
        }),
      });
      if (profResp.ok) {
        const profData = (await profResp.json()) as { profile?: AuthUserProfile };
        if (profData.profile) {
          setSqliteProfile(profData.profile);
          pushMcpEyeEvent(
            'agent-feedback',
            `Auth.${payload.provider}`,
            `Sessão verificada ativa: ${profData.profile.displayName} (${profData.profile.role})`,
            { role: profData.profile.role, offlineMode: false }
          );
          return;
        }
      }
    }

    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = (await resp.json()) as { profile?: AuthUserProfile; error?: string };
    if (!resp.ok || !data.profile) {
      throw new Error(data.error || 'Falha na autenticação SQLite.');
    }
    setSqliteProfile(data.profile);
    if (data.profile.offlineMode || payload.offlineMode) {
      setSelectedAgentId('local-llm');
      setLastVoiceStatus(
        'Modo Offline ativo: Mordomo Hermes + Burrinhos (OpenClaw/NanoClaw/PicoClaw) + Qwen 2.5 0.5B RT + Search Local ligados.'
      );
      pushMcpEyeEvent(
        'agent-feedback',
        'Hermes.Qwen05B.Offline',
        'Agente Local Hermes + Burrinhos + Qwen 0.5B ativado automaticamente pelo Modo Offline.',
        { role: data.profile.role, offlineMode: true }
      );
    } else {
      pushMcpEyeEvent(
        'agent-feedback',
        `Auth.${payload.provider}`,
        `Sessão SQLite ativa: ${data.profile.displayName} (${data.profile.role})`,
        { role: data.profile.role, offlineMode: data.profile.offlineMode }
      );
    }
  };

  const handleUpdateSqliteProfile = async (patch: Partial<AuthUserProfile>) => {
    const merged: AuthUserProfile = {
      ...sqliteProfile,
      ...patch,
      agentConfig: {
        ...sqliteProfile.agentConfig,
        ...(patch.agentConfig ?? {}),
      },
    };
    setSqliteProfile(merged);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`;
      const resp = await fetch('/api/auth/profile', {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify({
          userId: merged.id,
          role: merged.role,
          handleAt: merged.handleAt,
          phone: merged.phone,
          address: merged.address,
          computeSharePct: merged.computeSharePct,
          agentConfig: merged.agentConfig,
        }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { profile?: AuthUserProfile };
        if (data.profile) setSqliteProfile(data.profile);
      }
    } catch {
      // Offline optimistic update already applied
    }
  };

  const buildLiveCamSummary = () => ({
    partName: partProfile.partName,
    activeSegment,
    machineType: effectiveCamSettings.machineType,
    processLabel: camVisualState.processLabel,
    activeTool: `${camVisualState.activeToolEvent.toolNumber} · ${camVisualState.activeToolEvent.toolName}`,
    postFormat: effectiveCamSettings.postFormat,
    estimatedMinutes: toolpath.estimatedMinutes,
    cuttingLengthMm: toolpath.cuttingLengthMm,
    camRestartCount,
    safetyFactor: feaResult.safetyFactor,
    additiveConfig: effectiveCamSettings.additiveConfig,
    remoteMachinesCount: remoteMachines.length,
    vucHash: camVisualState.vucProof.vucHash,
  });

  const handleSyncQwenRag = async (): Promise<string> => {
    try {
      const resp = await fetch('/api/local-llm/finetune-rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ragDocs: ragDocs.slice(0, 12),
          cadSummary: buildLiveCamSummary(),
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        examplesCount?: number;
        datasetSha256?: string;
        status?: {
          installed: boolean;
          ragExamplesCount: number;
          ready: boolean;
          modelSizeBytes?: number;
        };
        error?: string;
      };
      if (data.status) {
        setLocalQwenStatus(data.status);
      }
      const msg = data.ok
        ? `Qwen 0.5B RAG sincronizado (${data.examplesCount} exemplos ChatML · SHA ${String(data.datasetSha256 || '').slice(0, 12)}).`
        : data.error || 'Falha ao sincronizar RAG local Qwen 0.5B.';
      pushMcpEyeEvent('agent-feedback', 'Qwen.0.5B.RAG', msg, data);
      return msg;
    } catch {
      return 'Servidor local indisponível para sincronização RAG Qwen 0.5B.';
    }
  };

  useEffect(() => {
    if (!backendProfile) return;
    setSqliteProfile(backendProfile);
  }, [backendProfile]);

  useEffect(() => {
    if (!user?.email) return;
    setSqliteProfile((prev) => {
      const sameEmail = prev.email.toLowerCase() === user.email!.toLowerCase();
      if (sameEmail && prev.provider === 'google' && !prev.offlineMode) return prev;
      if (prev.id === 'local-default-op' || sameEmail) {
        return {
          ...buildUserProfileWithRole(
            {
              id: user.uid,
              email: user.email!,
              displayName: user.displayName || prev.displayName,
              provider: 'google',
              offlineMode: false,
            },
            prev.role,
            prev.agentConfig
          ),
          handleAt: prev.handleAt,
          phone: prev.phone,
          address: prev.address,
          computeSharePct: prev.computeSharePct,
        };
      }
      return prev;
    });
  }, [user]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBrowserOffline = () => {
      setSelectedAgentId('local-llm');
      setSqliteProfile((prev) => ({ ...prev, offlineMode: true }));
      setLastVoiceStatus(
        'Sem rede: Agente Local Hermes + Burrinhos + Qwen 2.5 0.5B + Search Local ativado.'
      );
    };
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      handleBrowserOffline();
    }
    window.addEventListener('offline', handleBrowserOffline);
    return () => window.removeEventListener('offline', handleBrowserOffline);
  }, []);

  const handleSendMultiAgentPrompt = async (
    prompt: string,
    externalEndpoint: string,
    modelId?: string
  ): Promise<string> => {
    const activeAgent = sqliteProfile.offlineMode ? 'local-llm' : selectedAgentId;
    pushMcpEyeEvent('mcp-input', `Agent.${activeAgent}`, prompt, {
      modelId,
      offlineMode: sqliteProfile.offlineMode,
    });
    try {
      const resp = await fetch('/api/agent/multi-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: activeAgent,
          offlineMode: sqliteProfile.offlineMode,
          includeWeb: !sqliteProfile.offlineMode || /https?:\/\/|grabcad/i.test(prompt),
          userMessage: prompt,
          roleLabel: `${sqliteProfile.role} (${sqliteProfile.handleAt})`,
          eyeEvents: mcpEyeEvents.slice(0, 8),
          cadSummary: buildLiveCamSummary(),
          ragDocs: ragDocs.slice(0, 12),
          externalEndpoint,
          localModelId: modelId,
        }),
      });
      const data = (await resp.json()) as {
        reply?: string;
        vucHash?: string;
        formalVuc?: { vuc_id?: string };
        error?: string;
      };
      const text = data.reply || data.error || 'Resposta registrada pelo agente.';
      pushMcpEyeEvent('agent-feedback', `Agent.${activeAgent}`, text, {
        vucHash: data.vucHash,
        formalVucId: data.formalVuc?.vuc_id,
      });
      return text;
    } catch {
      return `[${activeAgent}] Bridge offline: Hermes + Burrinhos observando ${camVisualState.processLabel} · VUC ${camVisualState.vucProof.vucHash.slice(0, 14)}.`;
    }
  };

  const handleVoiceTranscript = (transcript: string): VoiceActionIntent => {
    const intent = parseVoiceCommand(transcript);
    setLastVoiceStatus(`${intent.feedbackText}`);
    pushMcpEyeEvent('mcp-input', 'VoiceControl', `"${transcript}" → ${intent.action}`, intent);

    if (intent.action === 'restart-cam') {
      handleRestartCamProcess();
    } else if (intent.action === 'play-cam') {
      setDisplay((d) => ({ ...d, showMachine: true, showToolpath: true }));
      setSimPlaying(true);
    } else if (intent.action === 'pause-cam') {
      setSimPlaying(false);
    } else if (intent.action === 'set-process' && intent.param) {
      handleRestartCamProcess(intent.param as MachineType);
    } else if (intent.action === 'select-program' && intent.param) {
      handleLaunchCamProgram(intent.param);
    } else if (intent.action === 'dispatch-remote') {
      const target = remoteMachines.find((m) => m.status !== 'standby') ?? remoteMachines[0];
      if (target) void handleDispatchRemoteMachine(target.id);
    } else if (intent.action === 'verify-vuc') {
      void fetch('/api/vuc/formal-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: 'VOICE_CAM_VERIFICATION',
          inputPayload: buildLiveCamSummary(),
          outputPayload: {
            vucHash: camVisualState.vucProof.vucHash,
            tool: camVisualState.activeToolEvent.toolNumber,
          },
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((resData: { certificate?: { vuc_id?: string; hash_processo?: string } } | null) => {
          if (resData?.certificate?.vuc_id) {
            setLastServerVucHex(resData.certificate.vuc_id);
            setLastVoiceStatus(
              `Certificado VUC Ed25519 emitido: ${resData.certificate.vuc_id}`
            );
          }
        })
        .catch(() => {});
    } else if (intent.action === 'open-tab' && intent.param) {
      handleTabSwitch(intent.param as WorkspaceTab);
    } else if (intent.action === 'start-wizard') {
      setWizardArea(activeEngineeringArea);
      setWizardOpen(true);
    } else if (intent.action === 'run-fea') {
      handleRunFea(undefined, true);
    } else if (intent.action === 'optimize-curvature') {
      handleApplyCurvatureOptimization();
    } else if (intent.action === 'toggle-explode') {
      setDisplay((d) => ({ ...d, explodeFactor: d.explodeFactor > 0 ? 0 : 0.45 }));
    } else if (intent.action === 'export-stl') {
      handleExportFormat('stl', 'assembly');
    } else if (intent.action === 'load-preset' && intent.param) {
      const preset = WORKSPACE_PROJECT_PRESETS.find((p) => p.id === intent.param);
      if (preset) handleApplyFullPreset(preset, true);
    } else if (intent.action === 'reset-part') {
      handleResetCadArea();
    } else if (intent.action === 'rhino-command' && intent.param) {
      executeMcpToolCall(
        'cad_rhino_command',
        {
          command: transcript,
          targetComponentId: display.selectedComponentId ?? undefined,
        },
        mcpContextRef.current
      );
    }
    return intent;
  };

  const handleVerifyVucOnServer = async (
    domain: string,
    summary: string,
    payload: unknown
  ) => {
    const resp = await fetch('/api/vuc/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, summary, payload }),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { entry?: { vucHash?: string } };
      if (data.entry?.vucHash) {
        setLastServerVucHex(data.entry.vucHash);
        pushMcpEyeEvent('agent-feedback', `VUC.${domain}`, summary, data.entry);
      }
    }
  };

  const handleFlushSessionLog = async () => {
    try {
      const resp = await fetch('/api/sqlite/session-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeSessionLog),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { sessionLog?: ProductionSessionLogRecord };
        if (data.sessionLog) {
          setSavedSessionLogs((prev) => [
            data.sessionLog!,
            ...prev.filter((l) => l.id !== data.sessionLog!.id),
          ]);
          pushMcpEyeEvent(
            'agent-feedback',
            'Session.Log.VUC',
            `Sessão gravada no SQLite (${data.sessionLog.pointerCount} ponteiro / ${data.sessionLog.actionCount} ações · VUC ${data.sessionLog.vucHash.slice(0, 14)})`,
            data.sessionLog
          );
        }
      }
    } catch {
      // Offline tolerance
    }
  };

  const handleProbeRemoteMachine = async (machineId: string) => {
    recordSessionDiscreteAction('machine-probe', `Probe de rede em máquina ${machineId}`);
    setRemoteDispatchStatus('Testando conectividade TCP/HTTP real na máquina...');
    try {
      const resp = await fetch(`/api/sqlite/remote-machines/${encodeURIComponent(machineId)}/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await resp.json()) as {
        reachable?: boolean;
        latencyMs?: number;
        detail?: string;
        machine?: RemoteMachineTarget;
        error?: string;
      };
      if (data.machine) {
        setRemoteMachines((prev) =>
          [data.machine!, ...prev.filter((m) => m.id !== data.machine!.id)]
        );
      }
      setRemoteDispatchStatus(
        data.reachable
          ? `ONLINE (${data.latencyMs ?? 0}ms): ${data.detail ?? 'Endpoint acessível'}`
          : `OFFLINE: ${data.detail ?? data.error ?? 'Máquina inacessível'}`
      );
      pushMcpEyeEvent(
        'cam-output',
        'Remote.Probe',
        data.detail ?? data.error ?? 'Probe de máquina concluído',
        data
      );
    } catch (err) {
      setRemoteDispatchStatus(
        `Erro de rede no probe: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleDispatchRemoteMachine = async (machineId: string) => {
    recordSessionDiscreteAction('machine-dispatch', `Despacho G-Code para ${machineId}`);
    setRemoteDispatchStatus('Despachando código G para controlador real...');
    try {
      const gcodeWithProvenance = injectGos7ProvenanceIntoTextArtifact(
        toolpath.postCode,
        activeProvenanceMeta,
        effectiveCamSettings.postFormat === 'kuka-krl' ? 'src' : 'nc'
      );
      const resp = await fetch(`/api/sqlite/remote-machines/${encodeURIComponent(machineId)}/dispatch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: partProfile.partName,
          postCode: gcodeWithProvenance,
        }),
      });
      const data = (await resp.json()) as {
        ok?: boolean;
        latencyMs?: number;
        detail?: string;
        error?: string;
        machine?: RemoteMachineTarget;
      };
      if (data.machine) {
        setRemoteMachines((prev) =>
          prev.map((m) => (m.id === data.machine!.id ? data.machine! : m))
        );
      }
      if (resp.ok && data.ok && data.machine) {
        setRemoteDispatchStatus(
          `EXECUTANDO (${data.latencyMs ?? 0}ms): ${data.detail ?? data.machine.name}`
        );
        pushMcpEyeEvent(
          'cam-output',
          `Remote.${data.machine.protocol}`,
          `Job enviado para ${data.machine.name} (${data.machine.lastJobVuc})`,
          data.machine
        );
      } else {
        setRemoteDispatchStatus(
          `FALHA REAL (${resp.status}): ${data.error ?? data.detail ?? 'Endpoint recusou ou inacessível'}`
        );
        pushMcpEyeEvent(
          'cam-output',
          'Remote.Dispatch.Error',
          data.error ?? 'Falha ao despachar para máquina remota',
          data
        );
      }
    } catch (err) {
      setRemoteDispatchStatus(
        `Erro de rede ao despachar: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  };

  const handleSaveRemoteMachine = async (input: RemoteMachineConfigInput) => {
    const resp = await fetch('/api/sqlite/remote-machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await resp.json()) as { machine?: RemoteMachineTarget; error?: string };
    if (!resp.ok || !data.machine) {
      throw new Error(data.error || 'Falha ao salvar endpoint remoto no SQLite.');
    }
    const saved = data.machine;
    setRemoteMachines((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
    pushMcpEyeEvent(
      'cam-output',
      `Remote.Config.${saved.protocol}`,
      `Endpoint configurado: ${saved.name} (${saved.endpointUrl})`,
      saved
    );
  };

  const handlePingRemoteMqtt = async (machineId: string) => {
    try {
      const resp = await fetch(`/api/sqlite/remote-machines/${encodeURIComponent(machineId)}/mqtt-ping`, {
        method: 'POST',
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as { telemetry?: RemoteMqttTelemetryEvent };
      if (data.telemetry) {
        const tel = data.telemetry;
        setMqttTelemetryFeed((prev) =>
          prev.some((t) => t.id === tel.id) ? prev : [tel, ...prev.slice(0, 29)]
        );
      }
    } catch {
      // Ignore offline errors
    }
  };

  const handleSendEcosystemChat = async (
    room: string,
    content: string,
    asAgent = false,
    askCamAgent = false,
    processUrl?: string,
    askLocalAgent = false
  ) => {
    recordSessionDiscreteAction('chat-send', `Chat #${room}`);
    setChatError(null);
    const body = {
      room,
      theme: room,
      senderId: sqliteProfile.id,
      senderEmail: user?.email || sqliteProfile.email,
      senderName: asAgent ? sqliteProfile.agentConfig.agentName : sqliteProfile.displayName,
      senderRole: sqliteProfile.role,
      isAgent: asAgent,
      askCamAgent,
      askLocalAgent,
      offlineMode: sqliteProfile.offlineMode,
      activeAgentId: selectedAgentId,
      processUrl: processUrl || activeProcessUrl,
      cadSummary: buildLiveCamSummary(),
      content,
    };
    const resp = await fetch('/api/sqlite/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await resp.json()) as {
      message?: EcosystemChatMessage;
      agentReply?: EcosystemChatMessage | null;
      error?: string;
    };
    if (!resp.ok) {
      setChatError(data.error || 'Erro ao enviar mensagem no chat público.');
      return;
    }
    setChatMessages((prev) => {
      let next = prev;
      if (data.message && !next.some((m) => m.id === data.message!.id)) {
        next = [...next, data.message];
      }
      if (data.agentReply && !next.some((m) => m.id === data.agentReply!.id)) {
        next = [...next, data.agentReply];
      }
      return next;
    });
  };

  const handlePingGpsLocation = async (modal: LogisticsModal, routeLabel: string) => {
    let lat = -23.5505;
    let lng = -46.6333;
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            lat = Number(pos.coords.latitude.toFixed(5));
            lng = Number(pos.coords.longitude.toFixed(5));
            resolve();
          },
          () => resolve(),
          { timeout: 2500 }
        );
      });
    }
    const resp = await fetch('/api/sqlite/logistics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `gps-${sqliteProfile.id}`,
        driverName: sqliteProfile.displayName,
        serviceTag:
          sqliteProfile.role === 'logistics' ? 'Autônomo' : 'iFood',
        modal,
        lat,
        lng,
        status: 'em-rota',
        routeLabel,
        speedKmh: modal === 'air' ? 680 : modal === 'rail' ? 78 : modal === 'river' ? 28 : 46,
      }),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { node?: LogisticsTelemetryNode };
      if (data.node) {
        setLogisticsNodes((prev) => [data.node!, ...prev.filter((n) => n.id !== data.node!.id)]);
      }
    }
  };

  const handleAddErpRecord = async (
    rec: Omit<ErpCrmRecord, 'id' | 'vucHash' | 'updatedAt'>
  ) => {
    const resp = await fetch('/api/sqlite/erp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec),
    });
    if (resp.ok) {
      const data = (await resp.json()) as { record?: ErpCrmRecord };
      if (data.record) {
        setErpRecords((prev) => [data.record!, ...prev]);
      }
    }
  };

  const handleRunAutonomousProjectWorkflow = (role: EcosystemRole) => {
    const presetMap: Record<EcosystemRole, string> = {
      client: 'preset-frostbite-rack',
      cam_provider: 'preset-metal-powder',
      logistics: 'preset-soc-hybrid',
      supplier: 'preset-resin-sla',
      compute_node: 'preset-frostbite-rack',
    };
    const preset = WORKSPACE_PROJECT_PRESETS.find((p) => p.id === presetMap[role]);
    if (preset) {
      handleApplyFullPreset(preset, true);
      handleRestartCamProcess(preset.camSettings.machineType);
      pushMcpEyeEvent(
        'agent-feedback',
        `Autonomous.${role}`,
        `Agente autônomo executou fluxo completo (${preset.title}) para ${sqliteProfile.handleAt}`,
        { phone: sqliteProfile.phone, address: sqliteProfile.address }
      );
    }
  };

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__PARAMETRIX_MCP__ = {
      protocol: '2024-11-05',
      endpoints: {
        llmsTxt: '/llms.txt',
        onboarding: '/api/agent/onboarding',
        llmBriefing: '/api/cad/llm-briefing',
        mcpJsonRpc: '/api/mcp',
      },
      listTools: () => MCP_TOOLS_CATALOG,
      callTool: (name: string, args: Record<string, unknown> = {}) => {
        const log = executeMcpToolCall(name, args, mcpContextRef.current);
        pushMcpEyeEvent('mcp-input', `MCP.${name}`, log.responseJson.slice(0, 120), args);
        return log;
      },
    };
  }, []);

  const navItems: { id: WorkspaceTab; label: string }[] = [
    { id: 'onboarding', label: 'Início' },
    { id: 'viewport', label: 'CAD 3D' },
    { id: 'cam', label: 'CAM & Robô' },
    { id: 'ecosystem', label: 'ERP / BI' },
    { id: 'library', label: 'Lib' },
    { id: 'frostbite', label: 'Frostbite 1MW' },
    { id: 'grasshopper', label: 'Grasshopper' },
    { id: 'sustainability', label: 'CAE / CO₂' },
    { id: 'mcp', label: 'MCP Tools' },
    { id: 'plugins', label: 'Plugins SDK' },
    { id: 'files', label: 'Arquivos CAD' },
    { id: 'media-studio', label: 'Media Studio 1.0' },
  ];

  const primaryDesktopNavIds: WorkspaceTab[] = [
    'onboarding',
    'viewport',
    'cam',
    'ecosystem',
    'library',
  ];
  const secondaryDesktopNavIds: WorkspaceTab[] = [
    'media-studio',
    'frostbite',
    'grasshopper',
    'sustainability',
    'mcp',
    'plugins',
    'files',
  ];

  const handleTabSwitch = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    setMobileMoreOpen(false);
    setDesktopModulesOpen(false);
    recordSessionDiscreteAction('tab-switch', `Navegou para aba ${tab}`, { tab });
    if (tab === 'cam') {
      setDisplay((d) => ({ ...d, showToolpath: true, showMachine: true }));
    }
  };

  const activeNavLabel = navItems.find((item) => item.id === activeTab)?.label ?? 'Início';

  return (
    <div
      className="w-full h-full flex flex-col bg-[#0b0e14] text-slate-100 overflow-hidden"
      onPointerMove={(e) => {
        if (!sessionRecordingEnabled) return;
        const rect = e.currentTarget.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const xPct = ((e.clientX - rect.left) / rect.width) * 100;
        const yPct = ((e.clientY - rect.top) / rect.height) * 100;
        const now = Date.now();
        if (
          shouldRecordPointerSample(lastPointerSampleRef.current, {
            timestampMs: now,
            xPct,
            yPct,
          })
        ) {
          lastPointerSampleRef.current = { timestampMs: now, xPct, yPct };
          const seq = sessionSeqRef.current++;
          const evt = createSessionEvent({
            seq,
            kind: 'pointer-move',
            timestampMs: now,
            xPct,
            yPct,
            activeTab,
            processMachine: effectiveCamSettings.machineType,
            selectedComponentId: display.selectedComponentId,
            detail: `Ponteiro (${xPct.toFixed(0)}%, ${yPct.toFixed(0)}%) em ${activeTab}`,
          });
          sessionEventRingRef.current.push(evt);
          setSessionEvents(sessionEventRingRef.current.toArray(false));
        }
      }}
    >
      {/* Top Navigation Bar (Clean 3-zone contract, zero clipped desktop tabs) */}
      <header className="h-12 px-3 sm:px-5 border-b border-white/10 bg-[#0f141d] flex items-center justify-between gap-2 sm:gap-6 shrink-0 relative z-30">
        <div className="flex items-center gap-2 min-w-0 shrink-0">
          <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-100 whitespace-nowrap">
            Parametrix CAD
          </span>
          <span className="md:hidden text-[11px] font-medium text-sky-300 bg-sky-500/10 border border-sky-400/25 rounded px-1.5 py-0.5 truncate max-w-[104px]">
            {activeNavLabel}
          </span>
        </div>

        <nav className="hidden md:flex items-center gap-4 lg:gap-5 min-w-0 flex-1">
          {primaryDesktopNavIds.map((id) => {
            const item = navItems.find((n) => n.id === id)!;
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

          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setDesktopModulesOpen((v) => !v)}
              className={`py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1 cursor-pointer ${
                secondaryDesktopNavIds.includes(activeTab)
                  ? 'border-sky-400 text-sky-200'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>
                {secondaryDesktopNavIds.includes(activeTab)
                  ? navItems.find((n) => n.id === activeTab)?.label
                  : 'Módulos'}
              </span>
              <ChevronDown className="w-3.5 h-3.5 shrink-0" />
            </button>

            {desktopModulesOpen && (
              <div className="absolute left-0 top-full mt-1 w-52 bg-[#111620] border border-white/15 rounded-xl shadow-2xl p-1.5 space-y-0.5 z-50">
                {secondaryDesktopNavIds.map((id) => {
                  const item = navItems.find((n) => n.id === id)!;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleTabSwitch(item.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
                          : 'text-slate-300 hover:bg-white/8 hover:text-white'
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setOfflineAuthOpen(true)}
            className="min-h-[38px] flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-[#141a24] border border-emerald-400/35 text-emerald-200 hover:border-emerald-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer font-mono-tabular"
            title={`Login Real Multi-Provedor + Sessão SQLite (${sqliteProfile.provider}) · ${sqliteProfile.role}`}
          >
            <KeyRound className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden lg:inline">
              {user || backendProfile || !sqliteProfile.offlineMode ? sqliteProfile.handleAt : 'Login / Auth'}
            </span>
            <span className="lg:hidden hidden sm:inline">Login</span>
          </button>

          {authReady &&
            (user || (backendProfile && !backendProfile.offlineMode) ? (
              <button
                type="button"
                onClick={() => setAccountModalOpen(true)}
                className="min-h-[38px] flex items-center gap-1.5 sm:gap-2 px-2.5 py-1.5 text-xs font-medium bg-[#141a24] border border-white/12 text-slate-200 hover:border-sky-400/50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={`Conta autenticada: ${user?.email || backendProfile?.email || ''} (${backendProfile?.provider || 'firebase'})`}
              >
                {user?.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Usuário'}
                    className="w-4 h-4 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                )}
                <span className="max-w-[70px] sm:max-w-[110px] truncate hidden sm:inline">
                  {(user?.displayName || backendProfile?.displayName)?.split(' ')[0] || 'Conta'}
                </span>
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={() => void signInWithGoogle()}
                className="min-h-[38px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium bg-[#141a24] border border-white/12 text-slate-200 hover:border-white/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden xl:inline">{authBusy ? 'Entrando...' : 'Google Cloud'}</span>
              </button>
            ))}

          <button
            type="button"
            onClick={() => setExportModalOpen(true)}
            className="min-h-[38px] px-3 sm:px-4 py-1.5 text-xs font-semibold bg-sky-500 text-slate-950 rounded-lg hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Exportar / Máquina
          </button>
        </div>
      </header>

      <AgentVoiceCommandBar
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        offlineMode={sqliteProfile.offlineMode}
        googleUserEmail={
          user?.email || (backendProfile?.provider === 'google' ? backendProfile.email : null)
        }
        googleAccessToken={googleAccessToken}
        sessionToken={sessionToken}
        onConnectGoogleDrive={connectGoogleDrive}
        onOpenDriveMatch={async (driveFile: GoogleDriveFolderFile) => {
          if (!googleAccessToken) return;
          const { arrayBuffer, mimeType } = await downloadDriveFileContent(
            googleAccessToken,
            driveFile.id,
            driveFile.name
          );
          if (driveFile.name.toLowerCase().endsWith('.parametrix.json')) {
            const parsed = JSON.parse(new TextDecoder().decode(arrayBuffer)) as {
              surfaceName?: string;
              designParams?: ParametricDesignParams;
              camSettings?: CamSettings;
            };
            if (parsed.designParams) setDesignParams(parsed.designParams);
            if (parsed.camSettings) setCamSettings(parsed.camSettings);
            setActiveTab('viewport');
            setLastVoiceStatus(`Snapshot "${parsed.surfaceName || driveFile.name}" carregado do Google Drive.`);
            return;
          }
          const importedFile = new File([arrayBuffer], driveFile.name, { type: mimeType });
          await handleUnifiedFileUpload(importedFile);
        }}
        systemResources={systemResources}
        localLlmRec={localLlmRec}
        localQwenStatus={localQwenStatus}
        onSyncQwenRag={handleSyncQwenRag}
        mcpEyeEvents={mcpEyeEvents}
        onSendAgentPrompt={handleSendMultiAgentPrompt}
        onVoiceTranscript={handleVoiceTranscript}
        activeArea={activeEngineeringArea}
        onOpenWizard={(area) => {
          setWizardArea(area);
          setWizardOpen(true);
        }}
        onResetCadArea={handleResetCadArea}
        onResetCaeArea={handleResetCaeArea}
        onRestartCam={() => handleRestartCamProcess()}
        cadResetCount={cadResetCount}
        caeResetCount={caeResetCount}
        camRestartCount={camRestartCount}
        lastVoiceStatus={lastVoiceStatus}
      />

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
            onUploadFile={handleUnifiedFileUpload}
            onApplyPreset={handleApplyFullPreset}
            scoobiiiProof={scoobiiiProof}
            liveErpSnapshot={liveErpSnapshot}
            activeUserLabel={user?.email || `${sqliteProfile.displayName} (${sqliteProfile.handleAt})`}
            onOpenErpEntry={() => {
              setEcosystemInitialSubTab('erp');
              handleTabSwitch('ecosystem');
            }}
          />
        )}

        {activeTab === 'library' && (
          <LibraryCatalogPanel
            activePresetId={activePresetId}
            googleUserEmail={
              user?.email || (backendProfile?.provider === 'google' ? backendProfile.email : null)
            }
            googleAccessToken={googleAccessToken}
            sessionToken={sessionToken}
            onConnectGoogleDrive={connectGoogleDrive}
            onExportPresetToArea={(preset, target) => {
              handleApplyFullPreset(preset, target === 'cad');
              if (target === 'erp') {
                setEcosystemInitialSubTab('erp');
                handleTabSwitch('ecosystem');
                setLastVoiceStatus(`Biblioteca "${preset.title}" cotada em tempo real no ERP Open & BI/CRM.`);
              } else if (target === 'cam') {
                handleRestartCamProcess(preset.camSettings.machineType);
                handleTabSwitch('cam');
                setLastVoiceStatus(`Biblioteca "${preset.title}" enviada para CAM (${preset.camSettings.machineType}).`);
              } else if (target === 'cae') {
                handleRunFea(preset.feaSettings, true);
                handleTabSwitch('sustainability');
                setLastVoiceStatus(`Biblioteca "${preset.title}" enviada para CAE / Fadiga & LCA.`);
              } else {
                setLastVoiceStatus(`Biblioteca "${preset.title}" aberta no Editor CAD 3D.`);
              }
            }}
            onSavePresetToProjects={async (preset) => {
              handleApplyFullPreset(preset, false);
              if (user && user.emailVerified) {
                await handleSaveCloudProject(preset.title);
              } else {
                const snap = buildLiveErpWorkspaceSnapshot({
                  surface,
                  meshData,
                  importedModel: null,
                  featureOps: preset.initialFeatures ?? [],
                  materialFinish: preset.materialFinish,
                  partProfile,
                  feaResult,
                  feaSettings: preset.feaSettings,
                  layerComplianceReport,
                  carbonReport,
                  camSettings: preset.camSettings,
                  toolpath,
                  camServiceJobs,
                  remoteMachines,
                  batchQty: erpBatchQty,
                  targetMarginPct: erpMarginPct,
                  taxRegime: erpTaxRegime,
                  logisticsModal: erpLogisticsModal,
                  distanceKm: erpDistanceKm,
                  activeOperatorEmail: user?.email || sqliteProfile.email,
                  activeOperatorHandle: sqliteProfile.handleAt,
                  presetId: preset.id,
                });
                await handleAddErpRecord({
                  kind: 'order',
                  title: `Projeto Lib: ${preset.title}`,
                  status: 'aberto',
                  partyName: user?.email || sqliteProfile.displayName,
                  segment: preset.segment,
                  amountBrl: snap.pricingAndRoi.commercialDisclosureBlocked
                    ? 0
                    : snap.pricingAndRoi.parametrixBatchTotalBrl,
                  modal: erpLogisticsModal,
                  ownerRole: sqliteProfile.role,
                });
                recordDeliverable({
                  filename: `${preset.id}.projeto.json`,
                  kind: 'REPORT',
                  summary: `Projeto "${preset.title}" salvo no workspace & SQLite ERP.`,
                });
              }
            }}
            onLoadImportedCad={(model, target = 'cad') => {
              handleLoadImportedModel(model);
              if (target === 'erp') {
                setEcosystemInitialSubTab('erp');
                handleTabSwitch('ecosystem');
              } else if (target === 'cam') {
                handleTabSwitch('cam');
              } else if (target === 'cae') {
                handleRunFea(undefined, true);
                handleTabSwitch('sustainability');
              }
            }}
          />
        )}

        {activeTab === 'viewport' && (
          <div className="flex-1 min-w-0 h-full flex relative overflow-hidden">
            {/* Left Edge-Retractable Menu (overlay on mobile/tablet, docked collapsible on desktop) */}
            <div
              className={`${
                sidebarCollapsed
                  ? 'hidden'
                  : 'fixed md:relative inset-y-0 left-0 z-30 md:z-auto flex h-full shadow-2xl md:shadow-none'
              }`}
            >
              <ParametricSidebar
                collapsed={false}
                onToggleCollapse={() => setSidebarCollapsed(true)}
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
                featureOps={featureOps}
                onRemoveFeatureOp={handleRemoveFeatureOp}
                scoobiiiProof={scoobiiiProof}
                onOpenScoobiiiModal={() => setScoobiiiModalOpen(true)}
                curvatureOptReport={curvatureOptReport}
                onApplyCurvatureOptimization={handleApplyCurvatureOptimization}
                layerToleranceSpecs={layerToleranceSpecs}
                onUpdateLayerTolerance={handleUpdateLayerTolerance}
                layerComplianceReport={layerComplianceReport}
                onRefineNurbsForTolerances={handleRefineNurbsForTolerances}
                onResetPartAndProduction={handleResetPartAndProduction}
                onNewCadProject={() => {
                  setWizardArea('cad');
                  setWizardOpen(true);
                }}
                onResetCadArea={handleResetCadArea}
                onNewCaeStudy={() => {
                  setWizardArea('cae');
                  setWizardOpen(true);
                }}
                onResetCaeArea={handleResetCaeArea}
              />
            </div>

            {/* Centered 3D Visual Field */}
            <div className="flex-1 min-w-0 h-full relative">
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
                camVisualState={camVisualState}
                selectedControlPoint={selectedControlPoint}
                onSelectControlPoint={setSelectedControlPoint}
                importedModel={importedModel}
                components={components}
                partProfile={partProfile}
                feaResult={feaResult}
                beforeFeaResult={feaBaseline?.fea ?? null}
                featureOps={featureOps}
                onAddFeatureOp={handleAddFeatureOp}
                onRemoveFeatureOp={handleRemoveFeatureOp}
                scoobiiiProof={scoobiiiProof}
                onOpenScoobiiiModal={() => setScoobiiiModalOpen(true)}
                onUploadFile={handleUnifiedFileUpload}
                onExecuteMagicPenMcpPrompt={handleExecuteMagicPenMcpPrompt}
                onExportCertificate={(filename, kind, summary) =>
                  recordDeliverable({ filename, kind, summary })
                }
                onOpenHelp={() => setActiveTab('onboarding')}
                onRunQuickFea={() => handleRunFea(undefined, true)}
                onResetPart={handleResetCadArea}
                curvatureFactor={curvatureCompensationFactor}
                onChangeCurvatureFactor={setCurvatureCompensationFactor}
                curvatureSummary={{
                  weightBeforeKg:
                    curvatureCompensationPreview?.weightBeforeKg ?? feaResult.totalMassKg,
                  weightAfterKg:
                    curvatureCompensationPreview?.weightAfterKg ?? feaResult.totalMassKg,
                  weightDeltaPct: curvatureCompensationPreview?.weightDeltaPct ?? 0,
                  safetyFactor:
                    curvatureCompensationPreview?.safetyFactor ?? feaResult.safetyFactor,
                  deflectionMm:
                    curvatureCompensationPreview?.deflectionMm ?? feaResult.maxDeflectionMm,
                  integrityPreserved: curvatureCompensationPreview?.integrityPreserved ?? true,
                  targetThicknessMm:
                    curvatureCompensationPreview?.params.thicknessMm ??
                    effectiveDesignParams.thicknessMm,
                  targetArchHeightMm:
                    curvatureCompensationPreview?.params.archHeight ??
                    effectiveDesignParams.archHeight,
                }}
                onCommitCurvature={handleCommitCurvatureCompensation}
                onResetCurvature={() => setCurvatureCompensationFactor(0)}
                onDetectedGpuRenderer={(gpu) => {
                  if (gpu) setDetectedWebglGpu((prev) => prev || gpu);
                }}
                onSelectComponentCamProcess={(mt, comp) => {
                  setDisplay((d) => ({ ...d, selectedComponentId: comp.id, showMachine: true, showToolpath: true }));
                  handleRestartCamProcess(mt);
                  handleTabSwitch('cam');
                }}
              />

              {/* Left Screen-Edge Touch Handle (appears when menu is tucked away) */}
              {sidebarCollapsed && (
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  aria-label="Abrir Menu Paramétrico na borda esquerda"
                  className="absolute left-0 top-1/2 -translate-y-1/2 z-20 px-1.5 py-4 bg-[#111620] border border-l-0 border-white/20 rounded-r-lg text-sky-300 hover:text-white hover:bg-[#1a2232] flex flex-col items-center gap-1 cursor-pointer shadow-lg"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-mono-tabular [writing-mode:vertical-rl]">
                    CAD / FEA
                  </span>
                </button>
              )}

              {/* Right Screen-Edge Touch Handle for Retractable CAM/VUC Drawer */}
              {!rightEdgeDrawerOpen && (
                <button
                  type="button"
                  onClick={() => setRightEdgeDrawerOpen(true)}
                  aria-label="Abrir Menu CAM e Processo na borda direita"
                  className="absolute right-0 top-1/2 -translate-y-1/2 z-20 px-1.5 py-4 bg-[#111620] border border-r-0 border-white/20 rounded-l-lg text-amber-300 hover:text-white hover:bg-[#1a2232] flex flex-col items-center gap-1 cursor-pointer shadow-lg"
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-mono-tabular [writing-mode:vertical-rl]">
                    CAM / VUC
                  </span>
                </button>
              )}

              {/* Retractable Right Edge Quick CAM & Process Drawer */}
              {rightEdgeDrawerOpen && (
                <div className="absolute right-0 top-0 bottom-0 z-30 w-[380px] max-w-[92vw] bg-[#111620] border-l border-white/15 flex flex-col shadow-2xl">
                  <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-200 font-mono-tabular">
                      CAM Rápido · {camVisualState.activeToolEvent.toolNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => setRightEdgeDrawerOpen(false)}
                      className="p-1 text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3 text-xs">
                    <button
                      type="button"
                      onClick={() => handleRestartCamProcess()}
                      className="w-full min-h-[38px] px-3 py-1.5 font-semibold bg-amber-500 text-slate-950 hover:bg-amber-400 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reiniciar CAM do Zero (#{camRestartCount})
                    </button>

                    <div className="space-y-1">
                      <div className="text-[11px] text-slate-400">Trocar Processo Ativo:</div>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(
                          [
                            ['powder-metal', 'Pó Metálico'],
                            ['resin-sla', 'Resina UV'],
                            ['robot-weld', 'Robô Solda'],
                            ['laser-cut', 'Laser 4kW'],
                            ['cnc-5axis', 'CNC 5-Eixos'],
                            ['robot-6axis', 'Robô KUKA'],
                          ] as [MachineType, string][]
                        ).map(([mt, label]) => (
                          <button
                            key={mt}
                            type="button"
                            onClick={() => handleRestartCamProcess(mt)}
                            className={`px-2 py-1.5 rounded border text-left text-[11px] cursor-pointer ${
                              camSettings.machineType === mt
                                ? 'border-amber-400 bg-amber-500/15 text-amber-200'
                                : 'border-white/10 bg-[#0c1017] text-slate-300'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="p-2.5 bg-[#0c1017] border border-white/10 rounded space-y-1 font-mono-tabular text-[11px]">
                      <div className="text-slate-400">Ferramenta / Feixe Ativo:</div>
                      <div className="text-slate-100 font-semibold">
                        {camVisualState.activeToolEvent.toolName}
                      </div>
                      <div className="text-emerald-400">
                        VUC: {camVisualState.vucProof.vucHash.slice(0, 18)}
                      </div>
                    </div>

                    <AdditiveCamConfigPanel
                      settings={camSettings}
                      onChangeSettings={(patch) =>
                        setCamSettings((prev) => ({ ...prev, ...patch }))
                      }
                      toolpath={toolpath}
                    />

                    <button
                      type="button"
                      onClick={() => {
                        setRightEdgeDrawerOpen(false);
                        setActiveTab('cam');
                      }}
                      className="w-full py-2 border border-sky-400/40 bg-sky-500/10 text-sky-200 rounded-lg font-medium cursor-pointer"
                    >
                      Abrir Painel CAM Completo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'grasshopper' && (
          <div className="w-full h-full flex flex-col overflow-hidden">
            <div className="md:hidden grid grid-cols-3 gap-1 p-1.5 bg-[#0f141d] border-b border-white/10 shrink-0">
              {(
                [
                  { id: 'split', label: 'Dividido' },
                  { id: 'graph', label: 'Grafo Nodal' },
                  { id: 'viewport', label: 'Preview 3D' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMobileGraphMode(m.id)}
                  className={`min-h-[38px] text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
                    mobileGraphMode === m.id
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-[#141a24] text-slate-300'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              <div
                className={`w-full md:w-[58%] min-w-0 md:border-r border-white/10 ${
                  mobileGraphMode === 'viewport'
                    ? 'hidden md:block md:h-full'
                    : mobileGraphMode === 'graph'
                      ? 'h-full'
                      : 'h-1/2 md:h-full border-b md:border-b-0'
                }`}
              >
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
              <div
                className={`w-full md:w-[42%] min-w-0 ${
                  mobileGraphMode === 'graph'
                    ? 'hidden md:block md:h-full'
                    : mobileGraphMode === 'viewport'
                      ? 'h-full'
                      : 'h-1/2 md:h-full'
                }`}
              >
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
                  camVisualState={camVisualState}
                  selectedControlPoint={selectedControlPoint}
                  onSelectControlPoint={setSelectedControlPoint}
                  importedModel={importedModel}
                  components={components}
                  partProfile={partProfile}
                  feaResult={feaResult}
                  beforeFeaResult={feaBaseline?.fea ?? null}
                  featureOps={featureOps}
                  onAddFeatureOp={handleAddFeatureOp}
                  onRemoveFeatureOp={handleRemoveFeatureOp}
                  scoobiiiProof={scoobiiiProof}
                  onUploadFile={handleUnifiedFileUpload}
                  onExecuteMagicPenMcpPrompt={handleExecuteMagicPenMcpPrompt}
                  onExportCertificate={(filename, kind, summary) =>
                    recordDeliverable({ filename, kind, summary })
                  }
                  compact
                  onRunQuickFea={() => handleRunFea(undefined, true)}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'cam' && (
          <div className="w-full h-full flex flex-col overflow-hidden">
            <div className="md:hidden grid grid-cols-2 gap-1 p-1.5 bg-[#0f141d] border-b border-white/10 shrink-0">
              <button
                type="button"
                onClick={() => setMobileCamPane('viewport')}
                className={`min-h-[38px] text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
                  mobileCamPane === 'viewport'
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-[#141a24] text-slate-300'
                }`}
              >
                Simulação 3D & Robô
              </button>
              <button
                type="button"
                onClick={() => setMobileCamPane('panel')}
                className={`min-h-[38px] text-[11px] font-semibold rounded-lg transition-colors cursor-pointer ${
                  mobileCamPane === 'panel'
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-[#141a24] text-slate-300'
                }`}
              >
                Processos & ATC
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
              <div
                className={`h-full min-h-0 ${
                  mobileCamPane === 'panel' ? 'flex w-full md:w-auto' : 'hidden md:flex'
                }`}
              >
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
                  onRestartProcess={() => handleRestartCamProcess()}
                  showToolpath={display.showToolpath}
                  showMachine={display.showMachine}
                  onToggleToolpath={() =>
                    setDisplay((d) => ({ ...d, showToolpath: !d.showToolpath }))
                  }
                  onToggleMachine={() =>
                    setDisplay((d) => ({ ...d, showMachine: !d.showMachine }))
                  }
                  camVisualState={camVisualState}
                  remoteMachines={remoteMachines}
                  onDispatchRemoteMachine={handleDispatchRemoteMachine}
                  onProbeRemoteMachine={handleProbeRemoteMachine}
                  remoteDispatchStatus={remoteDispatchStatus}
                  provenanceMeta={activeProvenanceMeta}
                  camServiceJobs={camServiceJobs}
                  onLaunchProgram={handleLaunchCamProgram}
                  onSubmitCamService={handleSubmitCamService}
                  onRestartServiceJob={handleRestartCamServiceJob}
                  onNewCamJob={() => {
                    setWizardArea('cam');
                    setWizardOpen(true);
                  }}
                />
              </div>
              <div
                className={`flex-1 min-w-0 h-full ${
                  mobileCamPane === 'viewport' ? 'block' : 'hidden md:block'
                }`}
              >
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
                  camVisualState={camVisualState}
                  selectedControlPoint={selectedControlPoint}
                  onSelectControlPoint={setSelectedControlPoint}
                  importedModel={importedModel}
                  components={components}
                  partProfile={partProfile}
                  feaResult={feaResult}
                  beforeFeaResult={feaBaseline?.fea ?? null}
                  featureOps={featureOps}
                  onAddFeatureOp={handleAddFeatureOp}
                  onRemoveFeatureOp={handleRemoveFeatureOp}
                  scoobiiiProof={scoobiiiProof}
                  onOpenScoobiiiModal={() => setScoobiiiModalOpen(true)}
                  onUploadFile={handleUnifiedFileUpload}
                  onExecuteMagicPenMcpPrompt={handleExecuteMagicPenMcpPrompt}
                  onExportCertificate={(filename, kind, summary) =>
                    recordDeliverable({ filename, kind, summary })
                  }
                  onOpenHelp={() => setActiveTab('onboarding')}
                  onRunQuickFea={() => handleRunFea(undefined, true)}
                  onResetPart={handleResetCadArea}
                  curvatureFactor={curvatureCompensationFactor}
                  onChangeCurvatureFactor={setCurvatureCompensationFactor}
                  curvatureSummary={{
                    weightBeforeKg:
                      curvatureCompensationPreview?.weightBeforeKg ?? feaResult.totalMassKg,
                    weightAfterKg:
                      curvatureCompensationPreview?.weightAfterKg ?? feaResult.totalMassKg,
                    weightDeltaPct: curvatureCompensationPreview?.weightDeltaPct ?? 0,
                    safetyFactor:
                      curvatureCompensationPreview?.safetyFactor ?? feaResult.safetyFactor,
                    deflectionMm:
                      curvatureCompensationPreview?.deflectionMm ?? feaResult.maxDeflectionMm,
                    integrityPreserved: curvatureCompensationPreview?.integrityPreserved ?? true,
                    targetThicknessMm:
                      curvatureCompensationPreview?.params.thicknessMm ??
                      effectiveDesignParams.thicknessMm,
                    targetArchHeightMm:
                      curvatureCompensationPreview?.params.archHeight ??
                      effectiveDesignParams.archHeight,
                  }}
                  onCommitCurvature={handleCommitCurvatureCompensation}
                  onResetCurvature={() => setCurvatureCompensationFactor(0)}
                  onDetectedGpuRenderer={(gpu) => {
                    if (gpu) setDetectedWebglGpu((prev) => prev || gpu);
                  }}
                  onSelectComponentCamProcess={(mt, comp) => {
                    setDisplay((d) => ({ ...d, selectedComponentId: comp.id, showMachine: true, showToolpath: true }));
                    handleRestartCamProcess(mt);
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'frostbite' && (
          <FrostbiteRackDashboard
            onLoadPresetById={(presetId) => {
              const found = WORKSPACE_PROJECT_PRESETS.find((p) => p.id === presetId);
              if (found) handleApplyFullPreset(found, true);
            }}
            onStartProcessCam={(machineType) => {
              handleRestartCamProcess(machineType);
              handleTabSwitch('cam');
            }}
            onLaunchCamProgram={handleLaunchCamProgram}
            onVerifyVucOnServer={handleVerifyVucOnServer}
            lastServerVucHex={lastServerVucHex}
          />
        )}

        {activeTab === 'ecosystem' && (
          <EcosystemHubPanel
            profile={sqliteProfile}
            onUpdateProfile={handleUpdateSqliteProfile}
            onOpenAuthModal={() => setOfflineAuthOpen(true)}
            chatMessages={chatMessages}
            onSendChat={handleSendEcosystemChat}
            chatError={chatError}
            activeProcessUrl={activeProcessUrl}
            onOpenProcessUrl={applyProcessShareUrl}
            wsRef={wsRef}
            logisticsNodes={logisticsNodes}
            onPingGpsLocation={handlePingGpsLocation}
            computeNodes={computeNodes}
            erpRecords={erpRecords}
            onAddErpRecord={handleAddErpRecord}
            remoteMachines={remoteMachines}
            onDispatchRemoteMachine={handleDispatchRemoteMachine}
            onProbeRemoteMachine={handleProbeRemoteMachine}
            remoteDispatchStatus={remoteDispatchStatus}
            onSaveRemoteMachine={handleSaveRemoteMachine}
            onPingRemoteMqtt={handlePingRemoteMqtt}
            mqttTelemetryFeed={mqttTelemetryFeed}
            onRunAutonomousProjectWorkflow={handleRunAutonomousProjectWorkflow}
            activeSessionLog={activeSessionLog}
            savedSessionLogs={savedSessionLogs}
            sessionRecordingEnabled={sessionRecordingEnabled}
            onToggleSessionRecording={() => setSessionRecordingEnabled((v) => !v)}
            onFlushSessionLog={handleFlushSessionLog}
            delegatedByPo={delegatedByPo}
            onToggleDelegatedByPo={() => setDelegatedByPo((v) => !v)}
            selectedAgentId={selectedAgentId}
            offlineMode={sqliteProfile.offlineMode}
            onRecordSessionAction={(detail) =>
              recordSessionDiscreteAction('rtc-media', detail)
            }
            initialSubTab={ecosystemInitialSubTab}
            initialChatRoom={ecosystemInitialRoom}
            liveErpSnapshot={liveErpSnapshot}
            erpBatchQty={erpBatchQty}
            onChangeErpBatchQty={setErpBatchQty}
            erpMarginPct={erpMarginPct}
            onChangeErpMarginPct={setErpMarginPct}
            erpTaxRegime={erpTaxRegime}
            onChangeErpTaxRegime={setErpTaxRegime}
            erpLogisticsModal={erpLogisticsModal}
            onChangeErpLogisticsModal={setErpLogisticsModal}
            erpDistanceKm={erpDistanceKm}
            onChangeErpDistanceKm={setErpDistanceKm}
            googleUserEmail={
              user?.email || (backendProfile?.provider === 'google' ? backendProfile.email : null)
            }
            googleAccessToken={googleAccessToken}
            onSaveErpSnapshotToDrive={handleSaveErpSnapshotToDrive}
            onNavigateTab={handleTabSwitch}
          />
        )}

        {activeTab === 'sustainability' && (
          <SustainabilityDashboard
            surface={surface}
            meshData={meshData}
            importedModel={importedModel}
            materialFinish={display.materialFinish}
            camSettings={effectiveCamSettings}
            toolpath={toolpath}
            featureOps={featureOps}
            feaResult={feaResult}
            feaSettings={feaSettings}
            partProfile={partProfile}
            vucLedger={vucLedger}
            mqttTelemetryFeed={mqttTelemetryFeed}
            camServiceJobs={camServiceJobs}
            mcpEyeEvents={mcpEyeEvents}
            onSwitchMachine={(machineType: MachineType) =>
              setCamSettings((prev) => ({
                ...prev,
                machineType,
                postFormat: machineType === 'robot-6axis' ? 'kuka-krl' : 'fanuc-nc',
              }))
            }
            onChangeMaterial={(material: MaterialFinish) =>
              setDisplay((d) => ({ ...d, materialFinish: material }))
            }
            onNavigate={handleTabSwitch}
            onNewCaeStudy={() => {
              setWizardArea('cae');
              setWizardOpen(true);
            }}
            onResetCaeArea={handleResetCaeArea}
          />
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
            userSlug={user?.email?.split('@')[0] || sqliteProfile.email.split('@')[0] || 'local-operator'}
            googleUserEmail={
              user?.email || (backendProfile?.provider === 'google' ? backendProfile.email : null)
            }
            googleAccessToken={googleAccessToken}
            onConnectGoogleDrive={connectGoogleDrive}
            onRecordDeliverable={recordDeliverable}
            designParams={designParams}
            camSettings={effectiveCamSettings}
            sessionToken={sessionToken}
            onApplyProjectSnapshot={(snap) => {
              if (snap.designParams) setDesignParams(snap.designParams);
              if (snap.camSettings) setCamSettings(snap.camSettings);
              setActiveTab('viewport');
              setLastVoiceStatus(`Projeto "${snap.label ?? 'Drive'}" restaurado do Google Drive.`);
            }}
          />
        )}
        {activeTab === 'media-studio' && (
          <MediaStudioPanel
            liveErpSnapshot={liveErpSnapshot}
            activeUserEmail={
              user?.email ||
              (backendProfile?.provider === 'google' ? backendProfile.email : sqliteProfile.email)
            }
            onNavigateTab={handleTabSwitch}
            onRecordDeliverable={recordDeliverable}
            onAddErpRecord={handleAddErpRecord}
          />
        )}
      </main>

      {/* Mobile Thumb-Zone Bottom Navigation Bar (< 768px) */}
      <nav
        aria-label="Navegação Mobile"
        className="md:hidden grid grid-cols-5 h-14 shrink-0 border-t border-white/10 bg-[#0f141d] z-30"
      >
        {(
          [
            { id: 'onboarding', label: 'Início', icon: Home },
            { id: 'viewport', label: 'CAD 3D', icon: Boxes },
            { id: 'cam', label: 'CAM', icon: Cpu },
            { id: 'ecosystem', label: 'ERP', icon: Briefcase },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id && !mobileMoreOpen;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabSwitch(item.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
                active ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileMoreOpen((v) => !v)}
          className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors cursor-pointer ${
            mobileMoreOpen ||
            activeTab === 'library' ||
            activeTab === 'frostbite' ||
            activeTab === 'sustainability' ||
            activeTab === 'grasshopper' ||
            activeTab === 'mcp' ||
            activeTab === 'plugins' ||
            activeTab === 'files' ||
            activeTab === 'media-studio'
              ? 'text-sky-400'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
          <span>Mais</span>
        </button>
      </nav>

      {/* Mobile Slide-Up Modules Sheet Drawer */}
      {mobileMoreOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/65"
            onClick={() => setMobileMoreOpen(false)}
          />
          <div className="relative bg-[#111620] border-t border-white/15 rounded-t-2xl p-4 space-y-3 shadow-2xl max-h-[82vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <span className="font-display text-sm font-semibold text-slate-100">
                Módulos & Ferramentas
              </span>
              <button
                type="button"
                aria-label="Fechar menu de módulos"
                onClick={() => setMobileMoreOpen(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'media-studio', label: 'Media Studio 1.0', icon: Palette },
                  { id: 'library', label: 'Lib / Biblioteca', icon: BookOpen },
                  { id: 'frostbite', label: 'Frostbite 1MW', icon: Flame },
                  { id: 'sustainability', label: 'CAE / CO₂', icon: Leaf },
                  { id: 'grasshopper', label: 'Grasshopper Nodal', icon: Network },
                  { id: 'mcp', label: 'Agente RAG + MCP', icon: Terminal },
                  { id: 'plugins', label: 'Plugins SDK', icon: Puzzle },
                  { id: 'files', label: 'Arquivos CAD', icon: FolderOpen },
                ] as const
              ).map((mod) => {
                const Icon = mod.icon;
                const active = activeTab === mod.id;
                return (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => handleTabSwitch(mod.id)}
                    className={`min-h-[48px] px-3 py-2.5 rounded-xl border flex items-center gap-2.5 text-left text-xs font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-sky-500/15 border-sky-400/50 text-sky-200'
                        : 'bg-[#0c1017] border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="truncate">{mod.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setMobileMoreOpen(false);
                  setScoobiiiModalOpen(true);
                }}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-emerald-400/35 bg-emerald-500/10 text-emerald-200 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sigma className="w-4 h-4 shrink-0" />
                <span>Prova SCOOBIII/VUC</span>
              </button>

              <a
                href="/gitpage/"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMoreOpen(false)}
                className="min-h-[44px] px-3 py-2 rounded-xl border border-sky-400/35 bg-sky-500/10 text-sky-200 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                <span>GitPage Dinâmica</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {scoobiiiModalOpen && (
        <ScoobiiiVucModal
          report={scoobiiiProof}
          telemetry={scoobiiiTelemetry}
          onClose={() => setScoobiiiModalOpen(false)}
          onExportCertificate={(filename, kind, summary) =>
            recordDeliverable({ filename, kind, summary })
          }
          onIssueFormalVuc={async () => {
            try {
              const resp = await fetch('/api/vuc/formal-proof', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  domain: 'SCOOBIII_100PCT_MATRIX',
                  inputPayload: {
                    subdivisions: `${effectiveDesignParams.uDivisions}x${effectiveDesignParams.vDivisions}`,
                    segment: partProfile.segment,
                    material: display.materialFinish,
                  },
                  outputPayload: {
                    certificateId: scoobiiiProof.certificateId,
                    correlation: scoobiiiTelemetry?.correlation,
                    unitCostBrl: scoobiiiTelemetry?.financialSummary.unitCost.totalUnitCostBrl,
                  },
                }),
              });
              if (resp.ok) {
                const payload = (await resp.json()) as { certificate?: { vuc_id?: string } };
                if (payload.certificate?.vuc_id) {
                  setLastServerVucHex(payload.certificate.vuc_id);
                }
                const stateResp = await fetch('/api/sqlite/state');
                if (stateResp.ok) {
                  const st = (await stateResp.json()) as { vucLedger?: VucLedgerEntry[] };
                  if (st.vucLedger) setVucLedger(st.vucLedger);
                }
              }
            } catch {
              // Offline fallback tolerance
            }
          }}
        />
      )}

      {/* Quick Export + Remote Machine Dispatch Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-[#111620] border border-white/12 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-slate-100">
                Exportar Projeto & Executar em Máquina
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
                    Programa CNC / Robô / Pó / Resina
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {toolpath.spindleRpm} RPM · {toolpath.feedRateMmMin} mm/min
                  </div>
                </div>
                <span className="text-xs font-mono-tabular text-emerald-400">
                  .{camSettings.postFormat === 'kuka-krl' ? 'src' : 'nc'}
                </span>
              </button>

              {remoteMachines.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300">
                    Logar & Executar Diretamente em Máquina Remota:
                  </div>
                  {remoteMachines.map((rm) => (
                    <button
                      key={rm.id}
                      type="button"
                      onClick={() => {
                        void handleDispatchRemoteMachine(rm.id);
                        setExportModalOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 bg-[#090c11] border border-white/10 hover:border-amber-400/60 rounded-xl text-left text-xs cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-100 truncate">{rm.name}</div>
                        <div className="text-[10px] font-mono-tabular text-slate-400 truncate">
                          {rm.protocol} · {rm.endpointUrl}
                        </div>
                      </div>
                      <Send className="w-3.5 h-3.5 text-amber-400 shrink-0 ml-2" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Offline Proprietary SQLite Auth Modal */}
      <OfflineAuthModal
        open={offlineAuthOpen}
        onClose={() => setOfflineAuthOpen(false)}
        onLogin={handleSqliteOfflineLogin}
      />

      {/* Interactive Real-Time New Project / Study / Job Wizard by Area */}
      <ProjectWizardModal
        open={wizardOpen}
        initialArea={wizardArea}
        onClose={() => setWizardOpen(false)}
        onCreateProject={(cfg: AreaWizardSubmission) => {
          if (cfg.presetIdToLoad) {
            const preset = WORKSPACE_PROJECT_PRESETS.find((p) => p.id === cfg.presetIdToLoad);
            if (preset) {
              handleApplyFullPreset(preset, cfg.area === 'cad');
            }
          } else if (cfg.area === 'cad') {
            setImportedModel(null);
            setActivePresetId(undefined);
            setCpOverrides({});
            setFeatureOps([]);
            setFeaBaseline(null);
            setFeaComparison(null);
            setDesignParams((prev) => ({ ...prev, ...cfg.designParamsPatch }));
            setActiveSegment(cfg.segment);
            setDisplay((d) => ({
              ...d,
              mode: 'component-pbr',
              materialFinish: cfg.materialFinish,
              fitViewTrigger: d.fitViewTrigger + 1,
            }));
            setActiveTab('viewport');
          } else if (cfg.area === 'cae') {
            setFeaSettings((prev) => ({ ...prev, ...cfg.feaSettingsPatch }));
            handleRunFea(cfg.feaSettingsPatch, cfg.activateHeatmap);
            setActiveTab(cfg.activateHeatmap ? 'viewport' : 'sustainability');
          } else if (cfg.area === 'cam') {
            setCamSettings((prev) => ({
              ...prev,
              machineType: cfg.machineType,
              strategy: cfg.camStrategy,
              postFormat: defaultPostForMachine(cfg.machineType),
              ...(cfg.machineType === 'powder-metal' || cfg.machineType === 'resin-sla'
                ? { additiveConfig: getDefaultAdditiveSettings(cfg.machineType) }
                : {}),
            }));
            if (cfg.startCamImmediately) {
              handleRestartCamProcess(cfg.machineType);
            }
            setActiveTab('cam');
          }

          setPartProfileOverride({ partName: cfg.name });
          if (cfg.area !== 'cam' && cfg.startCamImmediately) {
            handleRestartCamProcess(cfg.machineType);
          }

          recordDeliverable({
            filename: `${cfg.name.toLowerCase().replace(/\s+/g, '_')}_${cfg.area}.vuc`,
            kind: 'REPORT',
            summary: `Novo (${cfg.area.toUpperCase()}) · ${cfg.name} · Material: ${cfg.materialFinish}`,
          });
          setLastVoiceStatus(`Novo (${cfg.area.toUpperCase()}) criado: "${cfg.name}".`);
        }}
      />

      {/* Account & Isolated User Workspace Modal (Firebase & OAuth2 Backend Sessions) */}
      {accountModalOpen && (user || backendProfile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md bg-[#111620] border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <h3 className="font-display text-base font-semibold text-slate-100">
                  Conta Autenticada (Sessão Backend Real)
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
                {user?.photoURL && (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'Avatar'}
                    className="w-9 h-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    {user?.displayName || backendProfile?.displayName || 'Usuário Autenticado'}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {user?.email || backendProfile?.email}
                  </div>
                  <div className="text-[10px] font-mono-tabular text-slate-500 truncate mt-0.5">
                    Provedor: {(backendProfile?.provider || 'firebase').toUpperCase()} · ID:{' '}
                    {user?.uid || backendProfile?.id}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Sessão verificada criptograficamente no servidor ({sessionToken ? 'HMAC-SHA256 + Cookie HttpOnly' : 'Firebase ID Token'}) com isolamento por usuário e prova VUC no SQLite local.
              </p>

              <div className="flex items-center justify-between gap-2 pt-1">
                {user && (
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
                )}
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={async () => {
                    await logout();
                    setAccountModalOpen(false);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#0c1017] border border-white/12 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
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
