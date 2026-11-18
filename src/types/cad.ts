export type WorkspaceTab =
  | 'onboarding'
  | 'viewport'
  | 'grasshopper'
  | 'cam'
  | 'mcp'
  | 'plugins'
  | 'files';

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

export type MachineType = 'manual' | 'cnc-3axis' | 'cnc-5axis' | 'robot-6axis';
export type CamStrategy = 'raster' | 'isoparm' | 'contour';
export type PostProcessorFormat =
  | 'fanuc-nc'
  | 'grbl-gcode'
  | 'kuka-krl'
  | 'abb-rapid'
  | 'manual-sheet';

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

export interface CadComponentPart {
  id: string;
  name: string;
  family: string;
  subFamily: string;
  maskColorHex: string;
  inferredMaterial: MaterialFinish;
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
  format: 'STL' | 'OBJ' | 'DXF' | '3DM' | 'STEP' | 'IFC';
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
  kind: '3DM' | 'STL' | 'DXF' | 'NC' | 'SRC' | 'MOD' | 'PLUGIN' | 'MCP' | 'ICS' | 'REPORT';
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
