export type EngineeringArea = 'cad' | 'cae' | 'cam';

export type WorkspaceTab =
  | 'onboarding'
  | 'library'
  | 'viewport'
  | 'grasshopper'
  | 'cam'
  | 'frostbite'
  | 'ecosystem'
  | 'sustainability'
  | 'mcp'
  | 'plugins'
  | 'files'
  | 'media-studio';

export type PresetId = 'shell' | 'impeller' | 'cavity' | 'diagrid';

export type DisplayMode =
  | 'solid'
  | 'component-pbr'
  | 'object-mask'
  | 'wireframe'
  | 'zebra'
  | 'curvature'
  | 'stress-heatmap'
  | 'xray';

export type MaterialFinish =
  | 'aluminum'
  | 'titanium'
  | 'clay'
  | 'oak'
  | 'glass'
  | 'carbon-fiber'
  | 'matte-plastic';

export type CameraPreset =
  | 'perspective'
  | 'isometric'
  | 'top'
  | 'bottom'
  | 'front'
  | 'back'
  | 'left'
  | 'right';

export type ApplicationSegment =
  | 'ciclismo-mobilidade'
  | 'automotivo'
  | 'aeroespacial'
  | 'arquitetura-bim'
  | 'industrial-cnc'
  | 'robotica'
  | 'medico';

export interface ControlPoint4D {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface NurbsSurfaceData {
  id: string;
  name: string;
  degreeU: number;
  degreeV: number;
  knotsU: number[];
  knotsV: number[];
  uCount: number;
  vCount: number;
  controlPoints: ControlPoint4D[][]; // [u][v]
  uDivisions: number;
  vDivisions: number;
  thicknessMm: number;
}

export interface BimElement {
  id: string;
  label: string;
  ifcClass: 'IfcBeam' | 'IfcPlate' | 'IfcMember' | 'IfcSlab';
  material: string;
  center: [number, number, number];
  size: [number, number, number]; // width, height, depth (mm)
  rotationY: number;
  lengthMm: number;
  massKg: number;
}

export interface EvaluatedMesh {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array; // Gaussian curvature RGB
  indices: Uint32Array;
  triangleCount: number;
  vertexCount: number;
  isocurves: [number, number, number][][];
  bimElements: BimElement[];
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  surfaceAreaCm2: number;
  volumeCm3: number;
}

export interface ParametricDesignParams {
  preset: PresetId;
  spanX: number; // mm
  spanY: number; // mm
  archHeight: number; // mm
  waveAmplitude: number; // mm
  twistDeg: number; // degrees
  thicknessMm: number; // mm
  uDivisions: number;
  vDivisions: number;
  ribCountU: number;
  ribCountV: number;
  ribHeightMm: number;
  attractorStrength: number;
}

export type NodeCategory = 'input' | 'nurbs' | 'bim' | 'cam' | 'plugin';

export interface NodePort {
  id: string;
  label: string;
  dataType: 'number' | 'surface' | 'mesh' | 'toolpath' | 'bim';
}

export interface GraphNode {
  id: string;
  type:
    | 'slider'
    | 'nurbs_generator'
    | 'waffle_bim'
    | 'panelize_uv'
    | 'cam_toolpath'
    | 'robot_kinematics'
    | 'plugin_modifier';
  title: string;
  category: NodeCategory;
  x: number;
  y: number;
  params: Record<string, number | string | boolean>;
  inputs: NodePort[];
  outputs: NodePort[];
  summary?: string;
}

export interface GraphWire {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export type MachineType =
  | 'manual'
  | 'cnc-3axis'
  | 'cnc-5axis'
  | 'robot-6axis'
  | 'powder-metal'
  | 'resin-sla'
  | 'robot-weld'
  | 'laser-cut';
export type CamStrategy = 'raster' | 'isoparm' | 'contour';
export type PostProcessorFormat =
  | 'fanuc-nc'
  | 'grbl-gcode'
  | 'kuka-krl'
  | 'abb-rapid'
  | 'manual-sheet'
  | 'slm-powder'
  | 'sla-resin'
  | 'weld-tig-mig'
  | 'laser-g';

export interface CamTool {
  id: string;
  name: string;
  type: 'flat' | 'ball' | 'bull' | 'drill' | 'spindle-robot';
  diameterMm: number;
  flutes: number;
  lengthMm: number;
  material: string;
  recommendedVc: number;
  recommendedFz: number;
  cornerRadiusMm?: number;
}

export type AdditiveProcessKind = 'powder-metal' | 'resin-sla';

export type AdditiveSupportPattern = 'tree-branch' | 'lattice-grid' | 'linear-fin' | 'none';

export type AdditiveSinteringAtmosphere = 'argon' | 'nitrogen' | 'vacuum' | 'uv-chamber';

export interface AdditiveManufacturingSettings {
  layerThicknessUm: number;
  supportPattern: AdditiveSupportPattern;
  supportDensityPct: number;
  overhangAngleDeg: number;
  sinterLaserPowerW: number;
  sinterScanSpeedMmS: number;
  sinterTempC: number;
  sinterHoldMinutes: number;
  atmosphere: AdditiveSinteringAtmosphere;
  hatchSpacingMm: number;
}

export interface AdditiveCamSummary {
  processKind: AdditiveProcessKind;
  layerCount: number;
  layerThicknessUm: number;
  partVolumeCm3: number;
  supportVolumeCm3: number;
  supportMassGrams: number;
  overhangAreaRatioPct: number;
  energyDensityJMm3: number;
  buildMinutes: number;
  sinteringOrPostCureMinutes: number;
  totalCycleMinutes: number;
  sinteringTempC: number;
  atmosphereLabel: string;
}

export interface CamSettings {
  machineType: MachineType;
  strategy: CamStrategy;
  toolId: string;
  stepoverPct: number;
  stepdownMm: number;
  stockMarginMm: number;
  safeZMm: number;
  cutSpeedMultiplier: number;
  postFormat: PostProcessorFormat;
  additiveConfig?: AdditiveManufacturingSettings;
}

export interface ToolpathPoint {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  rapid: boolean;
  feedMmMin: number;
  lineNumber: number;
}

export interface ManualOperationStep {
  step: number;
  operation: string;
  toolName: string;
  rpm: number;
  feedMmMin: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  depthAp: number;
  notes: string;
}

export interface RobotJointState {
  j1: number;
  j2: number;
  j3: number;
  j4: number;
  j5: number;
  j6: number;
  reachable: boolean;
}

export interface ToolpathResult {
  points: ToolpathPoint[];
  cuttingLengthMm: number;
  rapidLengthMm: number;
  estimatedMinutes: number;
  spindleRpm: number;
  feedRateMmMin: number;
  removedVolumeCm3: number;
  postCode: string;
  manualSteps: ManualOperationStep[];
  additiveSummary?: AdditiveCamSummary;
}

export interface CadPlugin {
  id: string;
  name: string;
  author: string;
  version: string;
  category: 'Geometria' | 'BIM' | 'CAM / Pós-Proc' | 'Análise';
  enabled: boolean;
  description: string;
  code: string;
  lastRunMs?: number;
  lastStatus?: 'ok' | 'error';
  lastError?: string;
}

export interface ComponentProcessPlan {
  processCategory:
    | 'usinagem-cnc'
    | 'forjamento-cnc'
    | 'fundicao-cnc'
    | 'estiramento-anodizacao'
    | 'torneamento-cnc'
    | 'estampagem-laser'
    | 'soldagem-robotica'
    | 'aditiva-lpbf'
    | 'aditiva-sla'
    | 'moldagem-polimero';
  processLabel: string;
  machineType: MachineType;
  routingSteps: string[];
  toleranceSpec: string;
  fixtureNotes: string;
  isAdditive: boolean;
  materialLabel: string;
}

export interface CadComponentPart {
  id: string;
  name: string;
  family: string;
  subFamily: string;
  maskColorHex: string;
  inferredMaterial: MaterialFinish;
  manufacturingProcess?: ComponentProcessPlan;
  center: [number, number, number];
  size: [number, number, number];
  positions?: Float32Array;
  normals?: Float32Array;
  wireSegments?: Float32Array;
  triangleCount: number;
  sourceLayer: string;
}

export interface PartEngineeringProfile {
  partName: string;
  manufacturer: string;
  modelCode: string;
  segment: ApplicationSegment;
  primaryMaterial: MaterialFinish;
  specifications: string[];
  certifications: string[];
  intendedUse: string;
  safetyCriteria: {
    recommendedLoadN: number;
    supportMode: FeaSupportMode;
    loadPattern: FeaLoadPattern;
    minSafetyFactor: number;
    maxDeflectionMm: number;
    criticalInspectionNote: string;
  };
  detectedFrom: string;
}

export interface ImportedCadModel {
  id: string;
  filename: string;
  format: 'STL' | 'OBJ' | 'DXF' | '3DM' | 'STEP' | 'IFC' | 'IPT' | 'SVG' | 'IMAGE';
  positions: Float32Array;
  normals: Float32Array;
  wireSegments?: Float32Array;
  triangleCount: number;
  entityCount: number;
  layers: string[];
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
    size: [number, number, number];
  };
  notes: string;
  components?: CadComponentPart[];
  detectedProfile?: PartEngineeringProfile;
}

export interface ViewportDisplayState {
  mode: DisplayMode;
  materialFinish: MaterialFinish;
  showIsocurves: boolean;
  showControlCage: boolean;
  showBimRibs: boolean;
  showToolpath: boolean;
  showMachine: boolean;
  showImportedOverlay: boolean;
  cameraPreset: CameraPreset;
  cameraTrigger: number;
  fitViewTrigger: number;
  isolationTarget: string; // 'all' | 'shell' | 'ribs-u' | 'ribs-v' | 'imported' | component id
  stressComparisonView: 'current' | 'before';
  explodeFactor: number; // 0..1
  autoRotate: boolean;
  sectionEnabled: boolean;
  sectionAxis: 'x' | 'y' | 'z';
  sectionFlipped: boolean;
  sectionRatio: number; // 0..1
  selectedComponentId: string | null;
  hiddenComponentIds: string[];
  componentMaterials: Record<string, MaterialFinish>;
  componentRotations: Record<string, [number, number, number]>; // deg [rx, ry, rz]
  assemblyRotationDeg: [number, number, number]; // global assembly rotation
  perComponentPbr: boolean;
  transformMode: 'none' | 'rotate' | 'translate';
}

export type FeaSupportMode = 'edge-clamped' | 'four-corner-pins' | 'cantilever-u';
export type FeaLoadPattern = 'uniform-pressure' | 'center-point' | 'torsion-tip';

export interface FeaSettings {
  loadNewtons: number;
  supportMode: FeaSupportMode;
  loadPattern: FeaLoadPattern;
  targetSafetyFactor: number;
}

export interface FeaElementStress {
  elementId: string;
  label: string;
  ifcClass: string;
  maxStressMpa: number;
  utilizationRatio: number;
}

export interface FeaResult {
  materialName: string;
  yieldStrengthMpa: number;
  youngsModulusGpa: number;
  loadNewtons: number;
  supportMode: FeaSupportMode;
  loadPattern: FeaLoadPattern;
  isolatedScope: string;
  vertexStressesMpa: Float32Array;
  stressColors: Float32Array;
  maxStressMpa: number;
  meanStressMpa: number;
  minStressMpa: number;
  maxDeflectionMm: number;
  safetyFactor: number;
  totalMassKg: number;
  stiffnessToMass: number;
  criticalLocationMm: [number, number, number];
  elementStresses: FeaElementStress[];
  status: 'seguro' | 'alerta' | 'critico';
  complianceNote?: string;
  timestamp: string;
}

export interface FeaComparisonReport {
  before: FeaResult;
  after: FeaResult;
  beforeParams: ParametricDesignParams;
  afterParams: ParametricDesignParams;
  strategySummary: string;
  stressDeltaPct: number;
  deflectionDeltaPct: number;
  safetyFactorDeltaPct: number;
  massDeltaPct: number;
  certificationPassedBefore?: boolean;
  certificationPassedAfter?: boolean;
}

export type RagSourceKind = 'upload' | 'url' | 'gdrive';

export interface RagDocumentChunk {
  id: string;
  docId: string;
  docTitle: string;
  index: number;
  text: string;
}

export interface RagSourceDocument {
  id: string;
  title: string;
  kind: RagSourceKind;
  originUrl?: string;
  mimeType: string;
  byteSize: number;
  formatTag: string;
  chunkCount: number;
  summary: string;
  chunks: RagDocumentChunk[];
  addedAt: string;
}

export interface AgentToolCallLog {
  name: string;
  args: Record<string, unknown>;
  status: 'ok' | 'error';
  summary: string;
}

export interface AgentChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  toolCalls?: AgentToolCallLog[];
  citations?: { docTitle: string; chunkIndex: number; snippet: string }[];
  timestamp: string;
}

export interface SessionDeliverable {
  id: string;
  filename: string;
  kind:
    | '3DM'
    | 'STL'
    | 'DXF'
    | 'NC'
    | 'SRC'
    | 'MOD'
    | 'PLUGIN'
    | 'MCP'
    | 'ICS'
    | 'REPORT'
    | 'SVG'
    | 'PDF'
    | 'PNG'
    | 'JPG';
  timestamp: string;
  summary: string;
}

export interface McpToolDefinition {
  name: string;
  category: 'Geometria' | 'CAM' | 'FEA / Otimização' | 'Plugins' | 'Sessão';
  segments?: ApplicationSegment[];
  description: string;
  inputSchema: Record<string, unknown>;
  exampleArgs: Record<string, unknown>;
}

export interface McpExecutionLog {
  id: string;
  toolName: string;
  requestJson: string;
  responseJson: string;
  durationMs: number;
  status: 'ok' | 'error';
  timestamp: string;
}

export type MagicPenOperationKind =
  | 'slot-cutout'
  | 'through-hole'
  | 'threaded-bolt'
  | 'rib-boss'
  | 'chamfer-fillet'
  | 'rhino-extrude-crv'
  | 'rhino-revolve'
  | 'rhino-loft'
  | 'rhino-sweep1'
  | 'rhino-sweep2'
  | 'rhino-pipe'
  | 'rhino-fillet-edge'
  | 'rhino-chamfer-edge'
  | 'rhino-boolean-union'
  | 'rhino-boolean-diff'
  | 'rhino-boolean-intersect'
  | 'rhino-shell'
  | 'rhino-offset-srf'
  | 'rhino-mirror'
  | 'rhino-array-polar'
  | 'rhino-array-linear'
  | 'rhino-bend'
  | 'rhino-twist'
  | 'rhino-taper'
  | 'rhino-flow-along-srf'
  | 'blender-subsurf'
  | 'blender-bevel'
  | 'blender-solidify'
  | 'blender-array-mod'
  | 'blender-boolean-mod'
  | 'blender-decimate'
  | 'blender-remesh-voxel'
  | 'blender-bridge-loops'
  | 'blender-screw-lathe'
  | 'blender-lattice-deform'
  | 'bim-ifc-beam'
  | 'bim-ifc-column'
  | 'bim-ifc-slab'
  | 'bim-ifc-wall'
  | 'bim-ifc-truss'
  | 'bim-ifc-bracing'
  | 'bim-ifc-footing'
  | 'bim-ifc-stair'
  | 'bim-ifc-curtainwall'
  | 'bim-ifc-mep-duct';

export type IsoThreadSpec = 'M3' | 'M4' | 'M5' | 'M6' | 'M8' | 'M10' | 'M12';

export interface CadFeatureOperation {
  id: string;
  kind: MagicPenOperationKind;
  label: string;
  targetComponentId: string;
  point: [number, number, number];
  normal: [number, number, number];
  widthMm: number;
  lengthMm: number;
  diameterMm: number;
  depthMm: number;
  threadSpec?: IsoThreadSpec;
  threadPitchMm?: number;
  headStyle?: 'hex' | 'allen';
  slotProfile?: 'rectangular' | 'oblong';
  materialFinish?: MaterialFinish;
  mcpCommand?: string;
  rhinoCommand?: string;
  count?: number;
  angleDeg?: number;
  axis?: 'x' | 'y' | 'z';
  wallThicknessMm?: number;
  radiusMm?: number;
  createdAt: string;
}

export interface ScoobiiiVucCheckItem {
  id: string;
  domain: 'NURBS' | 'BIM' | 'FISICA' | 'NORMA' | 'ROSCA_ISO';
  title: string;
  formula: string;
  substitutedValues: string;
  resultText: string;
  limitText: string;
  passed: boolean;
}

export interface ScoobiiiVucProofReport {
  certificateId: string;
  timestamp: string;
  modelTitle: string;
  segmentLabel: string;
  nurbsProof: {
    degreeU: number;
    degreeV: number;
    controlGrid: string;
    clampedKnotsValid: boolean;
    maxPartitionUnityResidual: number;
    minJacobian: number;
    maxJacobian: number;
    gaussianCurvatureRange: [number, number];
    nurbsIntegralAreaCm2: number;
    meshAreaCm2: number;
    grossVolumeCm3: number;
    featureRemovedVolumeCm3: number;
    featureAddedVolumeCm3: number;
    netVolumeCm3: number;
  };
  physicsProof: {
    materialName: string;
    youngsModulusGpa: number;
    yieldStrengthMpa: number;
    poissonRatio: number;
    loadNewtons: number;
    effectiveInertiaMm4: number;
    sectionModulusMm3: number;
    stressConcentrationKt: number;
    netSectionRatio: number;
    vonMisesMaxMpa: number;
    allowableStressMpa: number;
    deflectionMm: number;
    safetyFactor: number;
    netMassKg: number;
  };
  checks: ScoobiiiVucCheckItem[];
  allPassed: boolean;
  verdict: string;
}

export type LayerToleranceClass = 'f' | 'm' | 'c' | 'v' | 'custom';

export interface LayerToleranceSpec {
  layerName: string;
  toleranceClass: LayerToleranceClass;
  linearToleranceMm: number;
  profileToleranceMm: number;
  flatnessMm: number;
  criticalGdtSymbol: 'profile' | 'flatness' | 'position' | 'perpendicularity';
  enabled: boolean;
}

export interface LayerToleranceCheckResult {
  layerName: string;
  toleranceClass: LayerToleranceClass;
  spec: LayerToleranceSpec;
  nurbsChordalErrorMm: number;
  feaElasticDeflectionMm: number;
  totalGeometricDeviationMm: number;
  utilizationPct: number;
  status: 'conforme' | 'atencao' | 'nao-conforme';
  normReference: string;
  recommendation: string;
}

export interface LayerToleranceComplianceReport {
  segmentLabel: string;
  activeStandards: string[];
  evaluatedAt: string;
  overallStatus: 'conforme' | 'atencao' | 'nao-conforme';
  passCount: number;
  totalLayers: number;
  suggestedMinDivisions: number;
  results: LayerToleranceCheckResult[];
}

export interface CurvatureAnalysisZone {
  uNorm: number;
  vNorm: number;
  gaussianK: number;
  meanH: number;
  maxPrincipalKappa: number;
  membraneStiffnessGain: number;
}

export interface CurvatureOptimizationReport {
  meanGaussianK: number;
  maxGaussianK: number;
  meanAbsH: number;
  willmoreEnergy: number;
  doubleCurvatureCoveragePct: number;
  recommendedThicknessMm: number;
  recommendedRibCountU: number;
  recommendedRibCountV: number;
  recommendedRibHeightMm: number;
  recommendedArchHeightMm: number;
  weightBeforeKg: number;
  weightAfterKg: number;
  weightReductionPct: number;
  safetyFactorBefore: number;
  safetyFactorAfter: number;
  deflectionBeforeMm: number;
  deflectionAfterMm: number;
  integrityPreserved: boolean;
  suggestedParams: ParametricDesignParams;
  engineeringRationale: string;
}

export interface MachineCarbonBenchmark {
  machineType: MachineType;
  label: string;
  energyKwh: number;
  energyCo2Kg: number;
  cycleMinutes: number;
  efficiencyScore: number;
}

export interface CarbonFootprintReport {
  materialName: string;
  densityGcm3: number;
  embodiedFactorKgCo2PerKg: number;
  recyclingCreditKgCo2PerKg: number;
  partNetVolumeCm3: number;
  partNetMassKg: number;
  billetRawVolumeCm3: number;
  billetRawMassKg: number;
  wasteVolumeCm3: number;
  wasteMassKg: number;
  buyToFlyRatio: number;
  machiningWasteRatePct: number;
  materialEmbodiedCo2Kg: number;
  wasteNetCo2Kg: number;
  energyKwh: number;
  spindlePowerKw: number;
  robotOrAxisEfficiencyPct: number;
  gridEmissionFactorKgPerKwh: number;
  energyCo2Kg: number;
  totalCo2Kg: number;
  ecoGrade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E';
  machineBenchmarks: MachineCarbonBenchmark[];
  optimizationTips: string[];
}

export type AgentProviderId =
  | 'gemini'
  | 'claude'
  | 'manus'
  | 'grok'
  | 'deepseek'
  | 'qwen'
  | 'meta'
  | 'local-llm';

export type AuthProviderKind =
  | 'proprietary'
  | 'google'
  | 'microsoft'
  | 'oracle'
  | 'zoho'
  | 'apple'
  | 'email';

export type EcosystemRole =
  | 'client'
  | 'cam_provider'
  | 'logistics'
  | 'supplier'
  | 'compute_node';

export type LogisticsModal = 'road' | 'rail' | 'air' | 'river';

export type ChipFabricationType = 'silicon-cmos' | 'optical-photonic' | 'hybrid-soc';

export interface VucExecutionProof {
  vucHash: string;
  domain: string;
  summary: string;
  timestamp: string;
  deterministicSeed: string;
}

export interface VucLedgerEntry {
  vucHash: string;
  domain: string;
  summary: string;
  payloadJson: string;
  sha256Hex: string;
  createdAt: string;
}

export interface RackArchitectureSpec {
  id: 'nvidia-1mw' | 'frostbite-1mw';
  label: string;
  architectureName: string;
  nodeProcess: string;
  clockMhz: number;
  busVoltageVdc: number;
  rackInputPowerKw: number;
  hvacCoolingKw: number;
  effectiveComputePowerKw: number;
  pue: number;
  perfPerWattMultiplier: number;
  effectiveEquivalentWorkUnits: number;
  memoryCoherenceOverheadPct: number;
  thermalDensityWPerCm2: number;
  isPreSiliconResearch: boolean;
  isOpticalOrQuantum: boolean;
  publicVendorDataAvailable: boolean;
  missingPublicDataFields: string[];
  explanatoryAnalogy: string;
}

export interface RackComparisonReport {
  nvidiaRack: RackArchitectureSpec;
  frostbiteRack: RackArchitectureSpec;
  busVoltageVdc: number;
  inputPowerMw: number;
  netComputeGainRatio: number;
  hvacSavingKw: number;
  thermalHeadroomC: number;
  honestDisclosureNote: string;
  vucProof: VucExecutionProof;
}

export interface ChipCamReport {
  substrateType: ChipFabricationType;
  label: string;
  nodeNm: number;
  dieAreaMm2: number;
  tileCount: number;
  waferDiameterMm: number;
  diesPerWafer: number;
  lithoPasses: number;
  opticalCouplersCount: number;
  interconnectPitchUm: number;
  thermalDesignPowerW: number;
  manufacturingNotes: string;
  vucProof: VucExecutionProof;
}

export interface CamToolChangeEvent {
  atProgress: number;
  toolNumber: string;
  toolName: string;
  toolKind: 'milling' | 'ball' | 'laser-head' | 'weld-torch' | 'powder-recoater' | 'uv-projector' | 'probe';
  operationLabel: string;
  rpmOrPowerLabel: string;
}

export interface CamProcessVisualState {
  machineType: MachineType;
  processLabel: string;
  activeToolEvent: CamToolChangeEvent;
  toolChanges: CamToolChangeEvent[];
  showLaserRay: boolean;
  showWeldWireAndArc: boolean;
  showPowderCone: boolean;
  showResinUvBeam: boolean;
  restartCount: number;
  vucProof: VucExecutionProof;
}

export interface SystemResourceSnapshot {
  cpuCores: number;
  cpuLoadPct: number;
  totalRamGb: number;
  freeRamGb: number;
  gpuTier: 'none' | 'integrated' | 'dedicated-mid' | 'datacenter';
  gpuName: string;
  osPlatform: string;
  networkMbps: number;
  loggedInUsers: number;
}

export interface LocalLlmRecommendation {
  modelId: string;
  displayName: string;
  quantization: string;
  estimatedRamGb: number;
  estimatedTokPerSec: number;
  tier: 'ultra-light' | 'compact' | 'balanced' | 'workstation';
  rationale: string;
}

export interface McpEyeEvent {
  id: string;
  direction: 'mcp-input' | 'cam-output' | 'viewport-action' | 'agent-feedback';
  source: string;
  summary: string;
  payloadPreview: string;
  vucHash: string;
  timestamp: string;
}

export interface AutonomousAgentConfig {
  enabled: boolean;
  agentName: string;
  handleAt: string;
  phone: string;
  address: string;
  autoRestartCam: boolean;
  autoAssignLogistics: boolean;
  targetCapabilities: string[];
}

export interface AuthUserProfile {
  id: string;
  email: string;
  displayName: string;
  provider: AuthProviderKind;
  role: EcosystemRole;
  handleAt: string;
  phone: string;
  address: string;
  computeSharePct: number;
  offlineMode: boolean;
  agentConfig: AutonomousAgentConfig;
  sessionToken?: string;
}

export interface EcosystemChatMessage {
  id: string;
  room: string;
  theme?: string;
  senderId: string;
  senderEmail?: string;
  senderName: string;
  senderRole: EcosystemRole;
  isAgent: boolean;
  content: string;
  processUrl?: string;
  lat?: number;
  lng?: number;
  vucHash: string;
  createdAt: string;
}

export interface LogisticsTelemetryNode {
  id: string;
  driverName: string;
  serviceTag: 'iFood' | '99' | 'Autônomo' | 'Ferrovia' | 'Aéreo' | 'Fluvial';
  modal: LogisticsModal;
  lat: number;
  lng: number;
  status: 'em-rota' | 'coletando' | 'entregue' | 'hub-aguardando';
  routeLabel: string;
  speedKmh: number;
  updatedAt: string;
}

export interface ErpCrmRecord {
  id: string;
  kind: 'lead' | 'order' | 'inventory' | 'shipment' | 'invoice';
  title: string;
  status: 'aberto' | 'em-producao' | 'em-transito' | 'concluido';
  partyName: string;
  segment: ApplicationSegment;
  amountBrl: number;
  modal?: LogisticsModal;
  ownerRole: EcosystemRole;
  vucHash: string;
  updatedAt: string;
}

export interface ComputeShareNode {
  id: string;
  userId: string;
  label: string;
  osName: string;
  cpuCores: number;
  gpuName: string;
  sharePct: number;
  tflopsEst: number;
  active: boolean;
  updatedAt: string;
}

export interface RemoteMachineTarget {
  id: string;
  name: string;
  machineType: MachineType;
  protocol: 'OPC-UA' | 'HTTP-Moonraker' | 'SSH-KUKA-Bridge' | 'GRBL-Serial-WS' | 'MQTT';
  endpointUrl: string;
  status: 'online' | 'executando' | 'standby' | 'offline';
  lastJobVuc: string;
  assignedProgramId?: string;
  lastProbeLatencyMs?: number;
  lastProbeDetail?: string;
  lastProbeAt?: string;
  mqttEnabled?: boolean;
  mqttBrokerUrl?: string;
  mqttTopic?: string;
  mqttQos?: 0 | 1 | 2;
  updatedAt: string;
}

export interface RemoteMqttTelemetryEvent {
  id: string;
  machineId: string;
  machineName: string;
  brokerUrl: string;
  topic: string;
  qos: 0 | 1 | 2;
  payloadSummary: string;
  vucHash: string;
  timestamp: string;
}

export interface VoiceActionIntent {
  transcript: string;
  matched: boolean;
  action:
    | 'restart-cam'
    | 'play-cam'
    | 'pause-cam'
    | 'set-process'
    | 'select-program'
    | 'dispatch-remote'
    | 'verify-vuc'
    | 'agent-query'
    | 'load-preset'
    | 'run-fea'
    | 'optimize-curvature'
    | 'open-tab'
    | 'start-wizard'
    | 'export-stl'
    | 'select-agent'
    | 'toggle-explode'
    | 'rhino-command'
    | 'reset-part'
    | 'unknown';
  param?: string;
  feedbackText: string;
}

export interface FormalVucCertificate {
  vuc_id: string;
  domain: string;
  status: 'PASS' | 'FAIL';
  hash_input: string;
  hash_output: string;
  hash_processo: string;
  commit: string;
  runner: string;
  node_version: string;
  duracao_ms: number;
  timestamp: string;
  assinatura_ed25519: string;
  public_key_pem: string;
}

export type CamProgramTargetCategory = 'datacenter' | 'humanoid';

export type CamServiceSourceKind = 'file' | 'url' | 'api' | 'catalog';

export interface CamProductionProgram {
  id: string;
  title: string;
  category: CamProgramTargetCategory;
  subsystem: string;
  material: MaterialFinish;
  machineType: MachineType;
  postFormat: PostProcessorFormat;
  strategy: CamStrategy;
  toolId: string;
  designParamsPatch: Partial<ParametricDesignParams>;
  additiveConfig?: AdditiveManufacturingSettings;
  estimatedCycleMin: number;
  toleranceSpec: string;
  description: string;
}

export interface CamServiceJob {
  id: string;
  title: string;
  targetCategory: CamProgramTargetCategory;
  programId: string;
  sourceKind: CamServiceSourceKind;
  sourceRef: string;
  filename: string;
  machineType: MachineType;
  postFormat: PostProcessorFormat;
  status: 'em-fila' | 'executando' | 'reiniciado' | 'concluido';
  progressPct: number;
  restartCount: number;
  estimatedMinutes: number;
  cuttingLengthMm: number;
  postCodeSnippet: string;
  geometrySummary: string;
  vucHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface HumanoidMaintenanceRobot {
  id: string;
  callsign: string;
  role: 'liquid-cooling' | 'blade-upgrade' | 'busbar-calibration';
  assignedBay: string;
  currentTask: string;
  status: 'em-manutencao' | 'atualizando-servidor' | 'inspecionando-cdus';
  batteryPct: number;
  servicedLoopsCount: number;
  jointPostureDeg: number;
}

export interface LiquidCoolingLoopTelemetry {
  coolantType: string;
  supplyTempC: number;
  returnTempC: number;
  deltaTC: number;
  flowRateLpm: number;
  loopPressureBar: number;
  cdusActive: number;
  pue: number;
}

export interface FrostbiteDatacenterState {
  operationalStatus: 'pronto-funcional';
  hasMechanicalArm: false;
  busVoltageVdc: number;
  inputPowerMw: number;
  maintenanceCycle: number;
  liquidCooling: LiquidCoolingLoopTelemetry;
  humanoidCrew: HumanoidMaintenanceRobot[];
  vucProof: VucExecutionProof;
}

export interface LocalProjectFolderFile {
  name: string;
  sizeBytes: number;
  updatedAt: string;
  sha256: string;
}

export interface GoogleDriveFolderFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleDriveFolderInfo {
  folderId: string;
  folderName: string;
  webViewLink?: string;
  files: GoogleDriveFolderFile[];
}

export interface RamdiskMcpStatus {
  available: boolean;
  mountPath: string;
  freeMb: number;
  totalMb: number;
  workerActive: boolean;
  workerPid?: number;
  workerPort?: number;
  workerUrl?: string;
  workerWorkspace?: string;
  colabBridgeUrl?: string;
}

export type PublicChatThemeId =
  | 'geral'
  | 'cad-nurbs'
  | 'cae-fea'
  | 'cam-cnc'
  | 'frostbite-7nm'
  | 'vuc-devops';

export interface PublicChatTheme {
  id: PublicChatThemeId;
  label: string;
  description: string;
  recommendedProcess: MachineType;
}

export interface RtcPeerPresence {
  peerId: string;
  room: string;
  userId: string;
  displayName: string;
  role: EcosystemRole;
  audioEnabled: boolean;
  videoEnabled: boolean;
  screenEnabled: boolean;
  processUrl?: string;
  joinedAt: string;
}

export type Gos7ArtifactStatus = 'runtime-sandbox' | 'convergente' | 'aprovado' | 'reprovado';

export interface AgentProvenanceMetadata {
  fileName: string;
  responsibility: string;
  dirOrUrl: string;
  version: string;
  poHumanoName: string;
  poHumanoHandle: string;
  poHumanoEmail: string;
  delegatedByPo: boolean;
  delegationScope: string;
  llmAgentId: string;
  llmModel: string;
  harnessId: string;
  status: Gos7ArtifactStatus;
  vucHash: string;
  createdAt: string;
}

export type SessionActionKind =
  | 'pointer-move'
  | 'tab-switch'
  | 'camera-preset'
  | 'cad-reset'
  | 'cae-reset'
  | 'cam-restart'
  | 'component-select'
  | 'material-change'
  | 'fea-run'
  | 'machine-probe'
  | 'machine-dispatch'
  | 'export-artifact'
  | 'chat-send'
  | 'rtc-media';

export interface SessionInteractionEvent {
  seq: number;
  kind: SessionActionKind;
  timestampMs: number;
  xPct: number;
  yPct: number;
  activeTab: WorkspaceTab;
  processMachine: MachineType;
  selectedComponentId?: string | null;
  detail: string;
}

export interface SessionRefinementInsight {
  code: string;
  severity: 'info' | 'atencao' | 'otimizacao';
  recommendation: string;
}

export interface SessionHeatmapCell {
  col: number;
  row: number;
  count: number;
}

export interface ProductionSessionLogRecord {
  id: string;
  sessionId: string;
  userId: string;
  poHumano: string;
  llmAgent: string;
  delegatedByPo: boolean;
  activeTab: WorkspaceTab;
  processMachine: MachineType;
  processUrl: string;
  pointerCount: number;
  actionCount: number;
  durationSec: number;
  hotzoneLabel: string;
  heatmap: SessionHeatmapCell[];
  events: SessionInteractionEvent[];
  insights: SessionRefinementInsight[];
  vucHash: string;
  createdAt: string;
}

export interface GanLayerMetric {
  layerName: string;
  allowedMm: number;
  chordalErrorMm: number;
  feaElasticMm: number;
  deviationMm: number;
  utilizationPct: number;
  status: 'conforme' | 'atencao' | 'nao-conforme';
}

export interface GanEpochSnapshot {
  epoch: number;
  phaseLabel: string;
  latentProgress: number;
  ganStiffnessFactor: number;
  uDivisions: number;
  vDivisions: number;
  thicknessMm: number;
  archHeightMm: number;
  ribCountU: number;
  ribCountV: number;
  discriminatorLoss: number;
  maxDeviationMm: number;
  allowedDeviationMm: number;
  safetyFactor: number;
  maxDeflectionMm: number;
  maxStressMpa: number;
  massKg: number;
  conformeCount: number;
  totalLayers: number;
  feaStatus: 'seguro' | 'alerta' | 'critico';
  overallStatus: 'conforme' | 'atencao' | 'nao-conforme';
  layers: GanLayerMetric[];
}

export interface GanConformityReport {
  referenceCode: string;
  partName: string;
  segment: ApplicationSegment;
  totalEpochs: number;
  epochs: GanEpochSnapshot[];
  initialEpoch: GanEpochSnapshot;
  finalEpoch: GanEpochSnapshot;
  allConformed: boolean;
  recommendedParams: ParametricDesignParams;
  recommendedGanStiffnessFactor: number;
  vucHash: string;
  generatedAt: string;
}

