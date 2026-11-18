import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  ArrowLeftRight,
  Box,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Eye,
  EyeOff,
  HelpCircle,
  List,
  Minus,
  Plus,
  Ruler,
  SplitSquareHorizontal,
  Trash2,
  Volume2,
} from 'lucide-react';
import { solveRobot6AxisIK } from '../kernel/camRobotics';
import { stressRatioToRgb } from '../kernel/structuralFea';
import type {
  CadComponentPart,
  CameraPreset,
  DisplayMode,
  EvaluatedMesh,
  FeaResult,
  ImportedCadModel,
  MachineType,
  MaterialFinish,
  NurbsSurfaceData,
  PartEngineeringProfile,
  ToolpathResult,
  ViewportDisplayState,
} from '../types/cad';

type GrabCadMenuTab = 'none' | 'models' | 'section' | 'explode' | 'measure';
type MeasureToolMode =
  | 'edge-length'
  | 'edge-radius'
  | 'edge-diameter'
  | 'face-distance'
  | 'point-distance'
  | 'face-angle';
type MeasureUnit = 'mm' | 'cm' | 'm' | 'in';

interface MeasurementRecord {
  id: string;
  mode: MeasureToolMode;
  title: string;
  valueMmOrDeg: number;
  isAngle: boolean;
  p1: [number, number, number];
  p2?: [number, number, number];
}

interface PendingMeasurePick {
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

function formatMeasurement(val: number, isAngle: boolean, unit: MeasureUnit): string {
  if (isAngle) return `${val.toFixed(1)}°`;
  switch (unit) {
    case 'cm':
      return `${(val / 10).toFixed(2)} cm`;
    case 'm':
      return `${(val / 1000).toFixed(4)} m`;
    case 'in':
      return `${(val / 25.4).toFixed(3)} in`;
    default:
      return `${val.toFixed(2)} mm`;
  }
}

function extractTriangleEdgeMetrics(hit: THREE.Intersection): {
  edgeLengthMm: number;
  radiusMm: number;
  worldNormal: THREE.Vector3;
} {
  const worldNormal = new THREE.Vector3(0, 1, 0);
  if (hit.face) {
    worldNormal
      .copy(hit.face.normal)
      .transformDirection(hit.object.matrixWorld)
      .normalize();
  }

  const mesh = hit.object as THREE.Mesh;
  const geo = mesh.geometry;
  const posAttr = geo?.getAttribute('position') as THREE.BufferAttribute | undefined;
  if (!posAttr || !hit.face) {
    return { edgeLengthMm: 24, radiusMm: 12, worldNormal };
  }

  const a = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.a).applyMatrix4(mesh.matrixWorld);
  const b = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.b).applyMatrix4(mesh.matrixWorld);
  const c = new THREE.Vector3().fromBufferAttribute(posAttr, hit.face.c).applyMatrix4(mesh.matrixWorld);

  const edges: [THREE.Vector3, THREE.Vector3][] = [
    [a, b],
    [b, c],
    [c, a],
  ];
  let bestLen = a.distanceTo(b);
  let bestDist = Infinity;
  const seg = new THREE.Line3();
  const closest = new THREE.Vector3();

  for (const [p0, p1] of edges) {
    seg.set(p0, p1);
    seg.closestPointToPoint(hit.point, true, closest);
    const d = closest.distanceTo(hit.point);
    if (d < bestDist) {
      bestDist = d;
      bestLen = p0.distanceTo(p1);
    }
  }

  // Approximate local radial curvature from component bounding sphere / edge length
  if (!geo.boundingBox) geo.computeBoundingBox();
  const boxSize = new THREE.Vector3();
  geo.boundingBox?.getSize(boxSize);
  const minHalfDim = Math.max(2, Math.min(boxSize.x, boxSize.z) * 0.5);
  const radiusMm = Number.isFinite(minHalfDim) && minHalfDim > 0 ? minHalfDim : Math.max(4, bestLen * 1.5);

  return {
    edgeLengthMm: Math.max(0.5, bestLen),
    radiusMm,
    worldNormal,
  };
}

interface Viewport3DProps {
  surface: NurbsSurfaceData;
  meshData: EvaluatedMesh;
  display: ViewportDisplayState;
  onUpdateDisplay: (patch: Partial<ViewportDisplayState>) => void;
  toolpath: ToolpathResult | null;
  machineType: MachineType;
  simPlaying: boolean;
  simProgress: number; // 0..1
  onSimProgressChange?: (next: number) => void;
  selectedControlPoint: { u: number; v: number } | null;
  onSelectControlPoint: (cp: { u: number; v: number } | null) => void;
  importedModel: ImportedCadModel | null;
  components?: CadComponentPart[];
  partProfile?: PartEngineeringProfile;
  feaResult?: FeaResult;
  beforeFeaResult?: FeaResult | null;
  compact?: boolean;
  onOpenHelp?: () => void;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _upVec = new THREE.Vector3(0, 1, 0);

const FINISH_OPTIONS: { id: MaterialFinish; label: string; swatch: string }[] = [
  { id: 'aluminum', label: 'Alumínio', swatch: '#cbd5e1' },
  { id: 'titanium', label: 'Titânio', swatch: '#64748b' },
  { id: 'carbon-fiber', label: 'Fibra Carbono', swatch: '#1e2430' },
  { id: 'matte-plastic', label: 'Plástico Fosco', swatch: '#475569' },
  { id: 'glass', label: 'Vidro', swatch: '#7dd3fc' },
  { id: 'clay', label: 'Argila CAD', swatch: '#d6cfc7' },
  { id: 'oak', label: 'Madeira', swatch: '#b68a5a' },
];

function createCadGridTexture(): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#10151f';
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
  ctx.lineWidth = 1;
  const minor = size / 8;
  for (let i = 0; i <= 8; i++) {
    const p = Math.round(i * minor) + 0.5;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(20, 20);
  return tex;
}

function createZebraTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const stripes = 18;
  const stripeH = canvas.height / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f8fafc' : '#0f172a';
    ctx.fillRect(0, i * stripeH, canvas.width, stripeH + 1);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

function createCarbonFiberTextures(maxAnisotropy: number): {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 128;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;

  const cells = 4;
  const cell = size / cells;

  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const isWarp = (x + y) % 4 < 2;
      const px = x * cell;
      const py = y * cell;

      const gradA = isWarp
        ? aCtx.createLinearGradient(px, py, px + cell, py)
        : aCtx.createLinearGradient(px, py, px, py + cell);
      if (isWarp) {
        gradA.addColorStop(0, '#141923');
        gradA.addColorStop(0.5, '#2b3342');
        gradA.addColorStop(1, '#12161f');
      } else {
        gradA.addColorStop(0, '#0c1017');
        gradA.addColorStop(0.5, '#1d2430');
        gradA.addColorStop(1, '#0b0e14');
      }
      aCtx.fillStyle = gradA;
      aCtx.fillRect(px, py, cell, cell);

      aCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      aCtx.lineWidth = 1;
      for (let s = 4; s < cell; s += 6) {
        aCtx.beginPath();
        if (isWarp) {
          aCtx.moveTo(px, py + s);
          aCtx.lineTo(px + cell, py + s);
        } else {
          aCtx.moveTo(px + s, py);
          aCtx.lineTo(px + s, py + cell);
        }
        aCtx.stroke();
      }

      rCtx.fillStyle = isWarp ? '#4d4d4d' : '#7a7a7a';
      rCtx.fillRect(px, py, cell, cell);
    }
  }

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = THREE.RepeatWrapping;
  albedo.wrapT = THREE.RepeatWrapping;
  albedo.repeat.set(14, 14);
  albedo.anisotropy = maxAnisotropy;

  const roughness = new THREE.CanvasTexture(roughCanvas);
  roughness.colorSpace = THREE.NoColorSpace;
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(14, 14);
  roughness.anisotropy = maxAnisotropy;

  return { albedo, roughness };
}

function applyPbrFinishToMaterial(
  mat: THREE.MeshPhysicalMaterial,
  finish: MaterialFinish,
  isSoftwareGl: boolean,
  carbonAlbedoTex: THREE.CanvasTexture,
  carbonRoughTex: THREE.CanvasTexture,
  xrayOrGhosted: boolean
) {
  mat.wireframe = false;
  mat.vertexColors = false;
  mat.map = null;
  mat.roughnessMap = null;
  mat.bumpMap = null;
  mat.bumpScale = 0;
  mat.transmission = 0;
  mat.ior = 1.5;
  mat.thickness = 0;
  mat.attenuationDistance = Infinity;
  mat.attenuationColor.setHex(0xffffff);
  mat.clearcoat = 0;
  mat.clearcoatRoughness = 0.1;
  mat.sheen = 0;
  mat.sheenRoughness = 1.0;
  mat.sheenColor.setHex(0x000000);
  mat.anisotropy = 0;
  mat.emissive.setHex(0x000000);
  mat.emissiveIntensity = 0;

  switch (finish) {
    case 'aluminum':
      mat.color.setHex(0xd1d5db);
      mat.metalness = 0.9;
      mat.roughness = 0.2;
      mat.anisotropy = 0.7;
      mat.clearcoat = 0.15;
      break;
    case 'titanium':
      mat.color.setHex(0x64748b);
      mat.metalness = 0.94;
      mat.roughness = 0.26;
      mat.anisotropy = 0.8;
      break;
    case 'clay':
      mat.color.setHex(0xd6cfc7);
      mat.metalness = 0.04;
      mat.roughness = 0.82;
      break;
    case 'oak':
      mat.color.setHex(0xb68a5a);
      mat.metalness = 0.04;
      mat.roughness = 0.68;
      break;
    case 'glass':
      mat.color.setHex(0xdff6ff);
      mat.metalness = 0.0;
      mat.roughness = 0.05;
      mat.ior = 1.52;
      mat.thickness = 12.0;
      mat.attenuationColor.setHex(0x7dd3fc);
      mat.attenuationDistance = 55;
      mat.clearcoat = 1.0;
      mat.clearcoatRoughness = 0.04;
      if (!xrayOrGhosted) {
        mat.transmission = isSoftwareGl ? 0 : 0.92;
        mat.transparent = true;
        mat.opacity = isSoftwareGl ? 0.42 : 1.0;
        mat.depthWrite = false;
      }
      break;
    case 'carbon-fiber':
      mat.color.setHex(0xffffff);
      mat.map = carbonAlbedoTex;
      mat.roughnessMap = carbonRoughTex;
      mat.bumpMap = carbonRoughTex;
      mat.bumpScale = 0.45;
      mat.metalness = 0.28;
      mat.roughness = 0.42;
      mat.anisotropy = 0.55;
      mat.clearcoat = 0.92;
      mat.clearcoatRoughness = 0.1;
      break;
    case 'matte-plastic':
      mat.color.setHex(0x475569);
      mat.metalness = 0.0;
      mat.roughness = 0.9;
      mat.sheen = 0.48;
      mat.sheenRoughness = 0.78;
      mat.sheenColor.setHex(0x94a3b8);
      break;
  }
}

function buildSpindleGroup(): THREE.Group {
  const g = new THREE.Group();
  const housingMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.78,
    roughness: 0.28,
  });
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    metalness: 0.65,
    roughness: 0.32,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.92,
    roughness: 0.18,
  });

  const cutter = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.2, 26, 20), steelMat);
  cutter.position.y = 13;
  cutter.castShadow = true;

  const collet = new THREE.Mesh(new THREE.CylinderGeometry(8.5, 6.2, 14, 16), collarMat);
  collet.position.y = 32;
  collet.castShadow = true;

  const nut = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 11, 6), housingMat);
  nut.position.y = 43;
  nut.castShadow = true;

  const body = new THREE.Mesh(new THREE.CylinderGeometry(19, 17, 52, 24), housingMat);
  body.position.y = 74;
  body.castShadow = true;

  const flange = new THREE.Mesh(new THREE.BoxGeometry(46, 12, 46), collarMat);
  flange.position.y = 104;
  flange.castShadow = true;

  g.add(cutter, collet, nut, body, flange);
  return g;
}

interface RobotRig {
  root: THREE.Group;
  turret: THREE.Group;
  upperArmPivot: THREE.Group;
  forearmPivot: THREE.Group;
  wristPivot: THREE.Group;
  spindleTip: THREE.Group;
}

function buildRobot6AxisRig(): RobotRig {
  const root = new THREE.Group();
  root.position.set(-215, 0, 0);

  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.7,
    roughness: 0.42,
  });
  const industrialOrange = new THREE.MeshStandardMaterial({
    color: 0xea580c,
    metalness: 0.35,
    roughness: 0.38,
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0xdbe2ea,
    metalness: 0.9,
    roughness: 0.2,
  });

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(34, 40, 22, 24), baseMat);
  plinth.position.y = 11;
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  root.add(plinth);

  const column = new THREE.Mesh(new THREE.CylinderGeometry(24, 28, 42, 24), baseMat);
  column.position.y = 43;
  column.castShadow = true;
  root.add(column);

  const turret = new THREE.Group();
  turret.position.y = 64;
  root.add(turret);

  const turretBody = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, 22, 24), industrialOrange);
  turretBody.position.y = 11;
  turretBody.castShadow = true;
  turret.add(turretBody);

  const shoulderHousing = new THREE.Mesh(new THREE.BoxGeometry(32, 28, 34), industrialOrange);
  shoulderHousing.position.set(0, 26, 0);
  shoulderHousing.castShadow = true;
  turret.add(shoulderHousing);

  const upperArmPivot = new THREE.Group();
  upperArmPivot.position.set(0, 28, 0);
  turret.add(upperArmPivot);

  const shoulderJoint = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 40, 20), baseMat);
  shoulderJoint.rotation.x = Math.PI / 2;
  upperArmPivot.add(shoulderJoint);

  const upperArm = new THREE.Mesh(new THREE.BoxGeometry(175, 18, 22), industrialOrange);
  upperArm.position.set(87.5, 0, 0);
  upperArm.castShadow = true;
  upperArmPivot.add(upperArm);

  const forearmPivot = new THREE.Group();
  forearmPivot.position.set(175, 0, 0);
  upperArmPivot.add(forearmPivot);

  const elbowJoint = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 30, 18), baseMat);
  elbowJoint.rotation.x = Math.PI / 2;
  forearmPivot.add(elbowJoint);

  const forearm = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 165, 18), industrialOrange);
  forearm.rotation.z = -Math.PI / 2;
  forearm.position.set(82.5, 0, 0);
  forearm.castShadow = true;
  forearmPivot.add(forearm);

  const wristPivot = new THREE.Group();
  wristPivot.position.set(165, 0, 0);
  forearmPivot.add(wristPivot);

  const wristBall = new THREE.Mesh(new THREE.SphereGeometry(9, 16, 16), baseMat);
  wristPivot.add(wristBall);

  const flange = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 14, 16), steelMat);
  flange.position.set(0, -10, 0);
  wristPivot.add(flange);

  const spindleTip = new THREE.Group();
  spindleTip.position.set(0, -17, 0);
  const cutter = new THREE.Mesh(new THREE.CylinderGeometry(4, 2.5, 25, 16), steelMat);
  cutter.position.set(0, -12.5, 0);
  spindleTip.add(cutter);
  wristPivot.add(spindleTip);

  return { root, turret, upperArmPivot, forearmPivot, wristPivot, spindleTip };
}

export const Viewport3D: React.FC<Viewport3DProps> = ({
  surface,
  meshData,
  display,
  onUpdateDisplay,
  toolpath,
  machineType,
  simPlaying,
  simProgress,
  onSimProgressChange,
  selectedControlPoint,
  onSelectControlPoint,
  importedModel,
  components = [],
  partProfile,
  feaResult,
  beforeFeaResult = null,
  compact = false,
  onOpenHelp,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth < 768
  );
  const [webglLost, setWebglLost] = useState(false);
  const [liveReadout, setLiveReadout] = useState<{ x: number; y: number; z: number } | null>(null);

  // GrabCAD Traditional Navigation Menus & Measurement state
  const [activeGrabMenu, setActiveGrabMenu] = useState<GrabCadMenuTab>('none');
  const [viewsMenuOpen, setViewsMenuOpen] = useState(false);
  const [helpPopoverOpen, setHelpPopoverOpen] = useState(false);
  const [treeExpandedAll, setTreeExpandedAll] = useState(false);
  const [expandedCompIds, setExpandedCompIds] = useState<Record<string, boolean>>({});
  const [measureMode, setMeasureMode] = useState<MeasureToolMode | null>(null);
  const [measureUnit, setMeasureUnit] = useState<MeasureUnit>('mm');
  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [pendingPick, setPendingPick] = useState<PendingMeasurePick | null>(null);

  const stateRef = useRef({
    simPlaying,
    simProgress,
    machineType,
    toolpath,
    display,
    measureMode,
    pendingPick,
    onSimProgressChange,
    onSelectControlPoint,
    onUpdateDisplay,
    onMeasureHit: (hit: THREE.Intersection) => {
      void hit;
    },
  });
  stateRef.current = {
    simPlaying,
    simProgress,
    machineType,
    toolpath,
    display,
    measureMode,
    pendingPick,
    onSimProgressChange,
    onSelectControlPoint,
    onUpdateDisplay,
    onMeasureHit: stateRef.current.onMeasureHit,
  };

  const handleMeasureHit = useCallback(
    (hit: THREE.Intersection) => {
      const mode = stateRef.current.measureMode;
      if (!mode) return;
      const { edgeLengthMm, radiusMm, worldNormal } = extractTriangleEdgeMetrics(hit);
      const pt = hit.point.clone();

      if (mode === 'edge-length' || mode === 'edge-radius' || mode === 'edge-diameter') {
        const value =
          mode === 'edge-length'
            ? edgeLengthMm
            : mode === 'edge-radius'
              ? radiusMm
              : radiusMm * 2;
        const title =
          mode === 'edge-length'
            ? 'Comprimento aresta'
            : mode === 'edge-radius'
              ? 'Raio de curvatura'
              : 'Diâmetro estimado';
        setMeasurements((prev) => [
          {
            id: `m-${Date.now()}`,
            mode,
            title,
            valueMmOrDeg: value,
            isAngle: false,
            p1: [pt.x, pt.y, pt.z],
          },
          ...prev.slice(0, 7),
        ]);
        setPendingPick(null);
        return;
      }

      const prevPick = stateRef.current.pendingPick;
      if (!prevPick) {
        setPendingPick({ point: pt, normal: worldNormal });
        return;
      }

      if (mode === 'point-distance') {
        const dist = prevPick.point.distanceTo(pt);
        setMeasurements((prev) => [
          {
            id: `m-${Date.now()}`,
            mode,
            title: 'Distância pontos',
            valueMmOrDeg: dist,
            isAngle: false,
            p1: [prevPick.point.x, prevPick.point.y, prevPick.point.z],
            p2: [pt.x, pt.y, pt.z],
          },
          ...prev.slice(0, 7),
        ]);
      } else if (mode === 'face-distance') {
        const diff = pt.clone().sub(prevPick.point);
        const proj = Math.abs(diff.dot(prevPick.normal));
        const dist = proj > 0.1 ? proj : diff.length();
        setMeasurements((prev) => [
          {
            id: `m-${Date.now()}`,
            mode,
            title: 'Distância faces',
            valueMmOrDeg: dist,
            isAngle: false,
            p1: [prevPick.point.x, prevPick.point.y, prevPick.point.z],
            p2: [pt.x, pt.y, pt.z],
          },
          ...prev.slice(0, 7),
        ]);
      } else if (mode === 'face-angle') {
        const dot = THREE.MathUtils.clamp(prevPick.normal.dot(worldNormal), -1, 1);
        const deg = THREE.MathUtils.radToDeg(Math.acos(dot));
        setMeasurements((prev) => [
          {
            id: `m-${Date.now()}`,
            mode,
            title: 'Ângulo entre faces',
            valueMmOrDeg: deg,
            isAngle: true,
            p1: [prevPick.point.x, prevPick.point.y, prevPick.point.z],
            p2: [pt.x, pt.y, pt.z],
          },
          ...prev.slice(0, 7),
        ]);
      }
      setPendingPick(null);
    },
    []
  );
  stateRef.current.onMeasureHit = handleMeasureHit;

  const sceneRefs = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    transformControls: TransformControls;
    assemblyRoot: THREE.Group;
    assemblyCenter: THREE.Vector3;
    floor: THREE.Mesh;
    bedPlate: THREE.Mesh;
    nurbsMesh: THREE.Mesh;
    wireOverlay: THREE.LineSegments;
    isoGroup: THREE.Group;
    cageGroup: THREE.Group;
    bimGroup: THREE.Group;
    toolpathGroup: THREE.Group;
    importedGroup: THREE.Group;
    importedMeshGroup: THREE.Group;
    importedWireGroup: THREE.Group;
    sectionHelperGroup: THREE.Group;
    measureGroup: THREE.Group;
    spindleGroup: THREE.Group;
    robotRig: RobotRig;
    clipPlane: THREE.Plane;
    zebraTex: THREE.CanvasTexture;
    carbonAlbedoTex: THREE.CanvasTexture;
    carbonRoughTex: THREE.CanvasTexture;
    defaultEnv: THREE.Texture | null;
    cpMeshes: THREE.Mesh[];
    currentExplode: number;
    cameraTargetPos: THREE.Vector3 | null;
    cameraTargetLook: THREE.Vector3 | null;
    requestRender: () => void;
    isSoftwareGl: boolean;
  } | null>(null);

  // Initialize Three.js Scene Once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.localClippingEnabled = true;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setSize(container.clientWidth || 800, container.clientHeight || 600);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglLost(true);
    };
    const onContextRestored = () => setWebglLost(false);
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0c1017');
    scene.fog = new THREE.FogExp2('#0c1017', 0.00045);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const defaultEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = defaultEnv;
    pmrem.dispose();

    const zebraTex = createZebraTexture();
    const { albedo: carbonAlbedoTex, roughness: carbonRoughTex } = createCarbonFiberTextures(
      renderer.capabilities.getMaxAnisotropy()
    );

    const camera = new THREE.PerspectiveCamera(
      42,
      (container.clientWidth || 800) / (container.clientHeight || 600),
      1,
      8000
    );
    camera.position.set(215, 195, 270);

    const controls = new OrbitControls(camera, canvas);
    controls.target.set(0, 32, 0);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 25;
    controls.maxDistance = 3000;
    controls.maxPolarAngle = Math.PI - 0.05;

    const transformControls = new TransformControls(camera, canvas);
    transformControls.setSize(0.75);
    const transformHelper = transformControls.getHelper();
    transformHelper.visible = false;
    scene.add(transformHelper);

    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.78);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 2.2);
    keyLight.position.set(280, 440, 260);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 40;
    keyLight.shadow.camera.far = 1600;
    const d = 420;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x7dd3fc, 0.95);
    rimLight.position.set(-280, 240, -240);
    scene.add(rimLight);

    const gridTex = createCadGridTexture();
    gridTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const floorGeo = new THREE.PlaneGeometry(3200, 3200);
    const floorMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.88,
      metalness: 0.12,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);

    const axes = new THREE.AxesHelper(65);
    axes.position.set(-140, 0.2, 110);
    scene.add(axes);

    const bedPlate = new THREE.Mesh(
      new THREE.BoxGeometry(270, 4, 210),
      new THREE.MeshStandardMaterial({ color: 0x18202c, metalness: 0.65, roughness: 0.45 })
    );
    bedPlate.position.set(0, -2.5, 0);
    bedPlate.receiveShadow = true;
    scene.add(bedPlate);

    const assemblyRoot = new THREE.Group();
    scene.add(assemblyRoot);

    const nurbsMesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshPhysicalMaterial({
        color: 0xcbd5e1,
        metalness: 0.88,
        roughness: 0.24,
        clearcoat: 0.25,
        side: THREE.DoubleSide,
      })
    );
    nurbsMesh.castShadow = true;
    nurbsMesh.receiveShadow = true;

    const wireOverlay = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.35 })
    );
    wireOverlay.visible = false;

    const isoGroup = new THREE.Group();
    const cageGroup = new THREE.Group();
    const bimGroup = new THREE.Group();
    const toolpathGroup = new THREE.Group();
    const importedGroup = new THREE.Group();
    const importedMeshGroup = new THREE.Group();
    const importedWireGroup = new THREE.Group();
    importedGroup.add(importedMeshGroup, importedWireGroup);

    assemblyRoot.add(
      nurbsMesh,
      wireOverlay,
      isoGroup,
      cageGroup,
      bimGroup,
      toolpathGroup,
      importedGroup
    );

    const spindleGroup = buildSpindleGroup();
    const robotRig = buildRobot6AxisRig();
    spindleGroup.visible = false;
    robotRig.root.visible = false;
    scene.add(spindleGroup, robotRig.root);

    // Visual GrabCAD Section Plane Helper (green frame + translucent cut sheet)
    const sectionHelperGroup = new THREE.Group();
    sectionHelperGroup.visible = false;
    const secPlaneGeo = new THREE.PlaneGeometry(1, 1);
    const secPlaneMesh = new THREE.Mesh(
      secPlaneGeo,
      new THREE.MeshBasicMaterial({
        color: 0x22c55e,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const secPlaneBorder = new THREE.LineSegments(
      new THREE.EdgesGeometry(secPlaneGeo),
      new THREE.LineBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.9 })
    );
    sectionHelperGroup.add(secPlaneMesh, secPlaneBorder);
    scene.add(sectionHelperGroup);

    const measureGroup = new THREE.Group();
    scene.add(measureGroup);

    const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 5000);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let lastTime = performance.now();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const updateMachinePose = (progress: number) => {
      const { toolpath: tp, machineType: mType } = stateRef.current;
      if (!tp || tp.points.length === 0) return;

      const idxFloat = Math.max(0, Math.min(1, progress)) * (tp.points.length - 1);
      const idx0 = Math.floor(idxFloat);
      const idx1 = Math.min(tp.points.length - 1, idx0 + 1);
      const frac = idxFloat - idx0;

      const p0 = tp.points[idx0];
      const p1 = tp.points[idx1];

      const wx = THREE.MathUtils.lerp(p0.x, p1.x, frac);
      const wy = THREE.MathUtils.lerp(p0.z, p1.z, frac);
      const wz = THREE.MathUtils.lerp(-p0.y, -p1.y, frac);

      const nx = THREE.MathUtils.lerp(p0.nx, p1.nx, frac);
      const ny = THREE.MathUtils.lerp(p0.nz, p1.nz, frac);
      const nz = THREE.MathUtils.lerp(-p0.ny, -p1.ny, frac);

      if (mType === 'robot-6axis') {
        const ik = solveRobot6AxisIK(wx, wy, wz, [nx, ny, nz]);
        robotRig.turret.rotation.y = ik.j1;
        robotRig.upperArmPivot.rotation.z = ik.j2;
        robotRig.forearmPivot.rotation.z = -ik.j3;
        robotRig.wristPivot.rotation.z = ik.j5;
        robotRig.spindleTip.rotation.y += 0.35;
      } else {
        spindleGroup.position.set(wx, wy, wz);
        _vec3A.set(nx, ny, nz).normalize();
        _quatA.setFromUnitVectors(_upVec, _vec3A);
        spindleGroup.quaternion.copy(_quatA);
      }

      setLiveReadout({
        x: Number(wx.toFixed(1)),
        y: Number((-wz).toFixed(1)),
        z: Number(wy.toFixed(1)),
      });
    };

    const applyExplodeOffsets = (factor: number, refs: NonNullable<typeof sceneRefs.current>) => {
      const ac = refs.assemblyCenter;
      const applyGroup = (group: THREE.Group, spreadMultiplier: number) => {
        for (let i = 0; i < group.children.length; i++) {
          const obj = group.children[i] as THREE.Mesh;
          const baseCenter = obj.userData?.baseCenter as THREE.Vector3 | undefined;
          if (!baseCenter) continue;
          _vec3B.copy(baseCenter).sub(ac);
          const len = _vec3B.length();
          if (len < 6) {
            const angle = (i / Math.max(1, group.children.length)) * Math.PI * 2;
            _vec3B.set(Math.cos(angle) * 45, 25 + i * 12, Math.sin(angle) * 45);
          } else {
            _vec3B.normalize().multiplyScalar(Math.max(40, len * spreadMultiplier));
          }
          obj.position.copy(baseCenter).addScaledVector(_vec3B, factor);
        }
      };

      applyGroup(refs.importedMeshGroup, 0.85);
      applyGroup(refs.bimGroup, 0.72);
    };

    const requestRender = () => {
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        renderDirty = false;
        const now = performance.now();
        const delta = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        const refs = sceneRefs.current;
        const curDisplay = stateRef.current.display;
        let needsAnother = false;

        if (refs) {
          // Smoothly damp explode factor
          if (Math.abs(refs.currentExplode - curDisplay.explodeFactor) > 0.002) {
            refs.currentExplode = THREE.MathUtils.damp(
              refs.currentExplode,
              curDisplay.explodeFactor,
              8.0,
              delta
            );
            applyExplodeOffsets(refs.currentExplode, refs);
            needsAnother = true;
          } else if (refs.currentExplode !== curDisplay.explodeFactor) {
            refs.currentExplode = curDisplay.explodeFactor;
            applyExplodeOffsets(refs.currentExplode, refs);
          }

          // Auto-rotate assembly if enabled and gizmo is not dragging
          if (curDisplay.autoRotate && !transformControls.dragging) {
            refs.assemblyRoot.rotation.y += delta * 0.55;
            needsAnother = true;
          }

          if (refs.cameraTargetPos && refs.cameraTargetLook) {
            const lambda = 7.5;
            camera.position.x = THREE.MathUtils.damp(camera.position.x, refs.cameraTargetPos.x, lambda, delta);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, refs.cameraTargetPos.y, lambda, delta);
            camera.position.z = THREE.MathUtils.damp(camera.position.z, refs.cameraTargetPos.z, lambda, delta);
            controls.target.x = THREE.MathUtils.damp(controls.target.x, refs.cameraTargetLook.x, lambda, delta);
            controls.target.y = THREE.MathUtils.damp(controls.target.y, refs.cameraTargetLook.y, lambda, delta);
            controls.target.z = THREE.MathUtils.damp(controls.target.z, refs.cameraTargetLook.z, lambda, delta);
            if (
              camera.position.distanceTo(refs.cameraTargetPos) < 0.5 &&
              controls.target.distanceTo(refs.cameraTargetLook) < 0.5
            ) {
              refs.cameraTargetPos = null;
              refs.cameraTargetLook = null;
            } else {
              needsAnother = true;
            }
          }
        }

        if (stateRef.current.simPlaying && stateRef.current.toolpath) {
          const next = (stateRef.current.simProgress + delta * 0.11) % 1;
          stateRef.current.simProgress = next;
          stateRef.current.onSimProgressChange?.(next);
          updateMachinePose(next);
          needsAnother = true;
        } else if (stateRef.current.toolpath) {
          updateMachinePose(stateRef.current.simProgress);
        }

        controls.update();
        renderer.render(scene, camera);

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsAnother) {
            requestRender();
          }
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    };

    const handleControlsStart = () => {
      if (sceneRefs.current) {
        sceneRefs.current.cameraTargetPos = null;
        sceneRefs.current.cameraTargetLook = null;
      }
    };
    const handleControlsChange = () => requestRender();
    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('change', handleControlsChange);

    const onTransformDraggingChanged = (event: { value: unknown }) => {
      controls.enabled = !event.value;
      requestRender();
    };
    const onTransformChange = () => requestRender();
    const onTransformMouseUp = () => {
      const obj = transformControls.object;
      if (!obj) return;
      const toDeg = (r: number) => Math.round(THREE.MathUtils.radToDeg(r));
      const rot: [number, number, number] = [
        toDeg(obj.rotation.x),
        toDeg(obj.rotation.y),
        toDeg(obj.rotation.z),
      ];
      if (obj === assemblyRoot) {
        stateRef.current.onUpdateDisplay({ assemblyRotationDeg: rot });
      } else if (obj.userData?.componentId) {
        const cid = String(obj.userData.componentId);
        stateRef.current.onUpdateDisplay({
          componentRotations: {
            ...stateRef.current.display.componentRotations,
            [cid]: rot,
          },
        });
      }
    };
    transformControls.addEventListener('dragging-changed', onTransformDraggingChanged);
    transformControls.addEventListener('change', onTransformChange);
    transformControls.addEventListener('mouseUp', onTransformMouseUp);

    // Raycasters: Layer 1 for NURBS control points, Layer 0 for component selection
    const cpRaycaster = new THREE.Raycaster();
    cpRaycaster.layers.set(1);
    const compRaycaster = new THREE.Raycaster();
    compRaycaster.layers.set(0);
    const pointer = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const handlePointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (transformControls.dragging) return;
      const moveDist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moveDist > 6) return; // Was orbit drag, not a click

      const refs = sceneRefs.current;
      if (!refs) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (refs.cageGroup.visible && refs.cpMeshes.length > 0) {
        cpRaycaster.setFromCamera(pointer, camera);
        const cpHits = cpRaycaster.intersectObjects(refs.cpMeshes, false);
        if (cpHits.length > 0) {
          const ud = cpHits[0].object.userData as { uIdx: number; vIdx: number };
          stateRef.current.onSelectControlPoint({ u: ud.uIdx, v: ud.vIdx });
          return;
        }
      }

      compRaycaster.setFromCamera(pointer, camera);
      const targets: THREE.Object3D[] = [];
      if (refs.importedGroup.visible) targets.push(...refs.importedMeshGroup.children);
      if (refs.bimGroup.visible) targets.push(...refs.bimGroup.children);
      if (refs.nurbsMesh.visible) targets.push(refs.nurbsMesh);

      const hits = compRaycaster.intersectObjects(targets, false);
      const visibleHit = hits.find((h) => h.object.visible);
      if (visibleHit) {
        if (stateRef.current.measureMode) {
          stateRef.current.onMeasureHit(visibleHit);
          return;
        }
        if (visibleHit.object.userData?.componentId) {
          const cid = String(visibleHit.object.userData.componentId);
          stateRef.current.onUpdateDisplay({ selectedComponentId: cid });
        }
      }
    };

    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);

    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        requestRender();
      }
    });
    resizeObserver.observe(container);

    sceneRefs.current = {
      scene,
      camera,
      renderer,
      controls,
      transformControls,
      assemblyRoot,
      assemblyCenter: new THREE.Vector3(0, 30, 0),
      floor,
      bedPlate,
      nurbsMesh,
      wireOverlay,
      isoGroup,
      cageGroup,
      bimGroup,
      toolpathGroup,
      importedGroup,
      importedMeshGroup,
      importedWireGroup,
      sectionHelperGroup,
      measureGroup,
      spindleGroup,
      robotRig,
      clipPlane,
      zebraTex,
      carbonAlbedoTex,
      carbonRoughTex,
      defaultEnv,
      cpMeshes: [],
      currentExplode: 0,
      cameraTargetPos: null,
      cameraTargetLook: null,
      requestRender,
      isSoftwareGl,
    };

    requestRender();

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('change', handleControlsChange);
      transformControls.removeEventListener('dragging-changed', onTransformDraggingChanged);
      transformControls.removeEventListener('change', onTransformChange);
      transformControls.removeEventListener('mouseUp', onTransformMouseUp);
      transformControls.dispose();
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      controls.dispose();
      secPlaneGeo.dispose();
      (secPlaneMesh.material as THREE.Material).dispose();
      secPlaneBorder.geometry.dispose();
      (secPlaneBorder.material as THREE.Material).dispose();
      while (measureGroup.children.length > 0) {
        const ch = measureGroup.children.pop() as THREE.Mesh | THREE.Line;
        ch.geometry.dispose();
        (ch.material as THREE.Material).dispose();
      }
      gridTex.dispose();
      zebraTex.dispose();
      carbonAlbedoTex.dispose();
      carbonRoughTex.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      defaultEnv?.dispose();
      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
      sceneRefs.current = null;
    };
  }, []);

  // Update NURBS Mesh Geometry, Isocurves, Control Cage & BIM Ribs
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(meshData.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(meshData.normals, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(meshData.uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(meshData.indices, 1));
    geo.computeTangents();
    geo.computeBoundingSphere();

    refs.nurbsMesh.geometry.dispose();
    refs.nurbsMesh.geometry = geo;

    const wfGeo = new THREE.WireframeGeometry(geo);
    refs.wireOverlay.geometry.dispose();
    refs.wireOverlay.geometry = wfGeo;

    while (refs.isoGroup.children.length > 0) {
      const child = refs.isoGroup.children.pop() as THREE.Line;
      child.geometry.dispose();
    }
    const isoMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.68,
    });
    for (const curve of meshData.isocurves) {
      const pts = curve.map((p) => new THREE.Vector3(p[0], p[1] + 0.35, p[2]));
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      refs.isoGroup.add(new THREE.Line(lineGeo, isoMat));
    }

    while (refs.cageGroup.children.length > 0) {
      const child = refs.cageGroup.children.pop() as THREE.Object3D;
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
    }
    refs.cpMeshes = [];

    const cageLinePts: number[] = [];
    const cpGeo = new THREE.SphereGeometry(2.6, 12, 12);
    for (let u = 0; u < surface.uCount; u++) {
      for (let v = 0; v < surface.vCount; v++) {
        const cp = surface.controlPoints[u][v];
        const isSel = selectedControlPoint?.u === u && selectedControlPoint?.v === v;
        const cpMat = new THREE.MeshStandardMaterial({
          color: isSel ? 0xf59e0b : 0x38bdf8,
          emissive: isSel ? 0x78350f : 0x0c4a6e,
          roughness: 0.3,
          metalness: 0.4,
        });
        const sphere = new THREE.Mesh(cpGeo, cpMat);
        sphere.position.set(cp.x, cp.y, cp.z);
        sphere.scale.setScalar(isSel ? 1.45 : 1.0);
        sphere.layers.enable(1);
        sphere.userData = { uIdx: u, vIdx: v };
        refs.cageGroup.add(sphere);
        refs.cpMeshes.push(sphere);

        if (u + 1 < surface.uCount) {
          const nextU = surface.controlPoints[u + 1][v];
          cageLinePts.push(cp.x, cp.y, cp.z, nextU.x, nextU.y, nextU.z);
        }
        if (v + 1 < surface.vCount) {
          const nextV = surface.controlPoints[u][v + 1];
          cageLinePts.push(cp.x, cp.y, cp.z, nextV.x, nextV.y, nextV.z);
        }
      }
    }
    const cageGeo = new THREE.BufferGeometry();
    cageGeo.setAttribute('position', new THREE.Float32BufferAttribute(cageLinePts, 3));
    refs.cageGroup.add(
      new THREE.LineSegments(
        cageGeo,
        new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.45 })
      )
    );

    while (refs.bimGroup.children.length > 0) {
      const child = refs.bimGroup.children.pop() as THREE.Mesh;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    for (const el of meshData.bimElements) {
      const mat = new THREE.MeshPhysicalMaterial({
        color: el.ifcClass === 'IfcBeam' ? 0x64748b : 0x475569,
        metalness: 0.72,
        roughness: 0.36,
      });
      const box = new THREE.Mesh(new THREE.BoxGeometry(el.size[0], el.size[1], el.size[2]), mat);
      box.position.set(el.center[0], el.center[1], el.center[2]);
      box.rotation.y = el.rotationY;
      box.castShadow = true;
      box.receiveShadow = true;
      box.userData = {
        componentId: el.id,
        elementId: el.id,
        ifcClass: el.ifcClass,
        baseCenter: new THREE.Vector3(el.center[0], el.center[1], el.center[2]),
        baseRotY: el.rotationY,
        maskColorHex: el.ifcClass === 'IfcBeam' ? '#14b8a6' : '#6366f1',
        inferredMaterial: (el.ifcClass === 'IfcBeam' ? 'aluminum' : 'titanium') as MaterialFinish,
      };
      refs.bimGroup.add(box);
    }

    if (!importedModel) {
      const b = meshData.boundingBox;
      refs.assemblyCenter.set(
        (b.min[0] + b.max[0]) / 2,
        (b.min[1] + b.max[1]) / 2,
        (b.min[2] + b.max[2]) / 2
      );
      refs.floor.position.y = -0.5;
      refs.bedPlate.visible = true;
    }

    refs.requestRender();
  }, [surface, meshData, selectedControlPoint, importedModel]);

  // Update Imported External Multi-Component CAD Model
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    while (refs.importedMeshGroup.children.length > 0) {
      const child = refs.importedMeshGroup.children.pop() as THREE.Mesh;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    while (refs.importedWireGroup.children.length > 0) {
      const child = refs.importedWireGroup.children.pop() as THREE.LineSegments;
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    if (importedModel) {
      const ib = importedModel.boundingBox;
      refs.assemblyCenter.set(
        (ib.min[0] + ib.max[0]) / 2,
        (ib.min[1] + ib.max[1]) / 2,
        (ib.min[2] + ib.max[2]) / 2
      );
      refs.floor.position.y = Math.min(-0.5, ib.min[1] - 4);
      refs.bedPlate.visible = false;

      const compList =
        importedModel.components && importedModel.components.length > 0
          ? importedModel.components
          : importedModel.positions.length > 0
            ? [
                {
                  id: 'COMP-1',
                  name: importedModel.filename,
                  family: 'Estrutura / Chassi Principal',
                  subFamily: 'Sólido Importado',
                  maskColorHex: '#22c55e',
                  inferredMaterial: 'aluminum' as MaterialFinish,
                  center: [
                    (ib.min[0] + ib.max[0]) / 2,
                    (ib.min[1] + ib.max[1]) / 2,
                    (ib.min[2] + ib.max[2]) / 2,
                  ] as [number, number, number],
                  size: ib.size,
                  positions: importedModel.positions,
                  normals: importedModel.normals,
                  triangleCount: importedModel.triangleCount,
                  sourceLayer: importedModel.layers[0] || 'IMPORTED',
                },
              ]
            : [];

      const spanY = Math.max(10, ib.max[1] - ib.min[1]);
      const spanX = Math.max(10, ib.max[0] - ib.min[0]);

      for (const comp of compList) {
        if (!comp.positions || comp.positions.length === 0) continue;

        // Re-center geometry vertices around comp.center so rotation/explode/gizmo pivot around part center
        const cx = comp.center[0];
        const cy = comp.center[1];
        const cz = comp.center[2];
        const vCount = comp.positions.length / 3;
        const localPos = new Float32Array(comp.positions.length);
        const stressCols = new Float32Array(comp.positions.length);

        for (let i = 0; i < vCount; i++) {
          const wx = comp.positions[i * 3];
          const wy = comp.positions[i * 3 + 1];
          const wz = comp.positions[i * 3 + 2];
          localPos[i * 3] = wx - cx;
          localPos[i * 3 + 1] = wy - cy;
          localPos[i * 3 + 2] = wz - cz;

          // Physical stress field proxy across assembly height/crown junction
          const ny = (wy - ib.min[1]) / spanY;
          const nx = Math.abs(wx - refs.assemblyCenter.x) / (spanX * 0.5);
          const crownZone = Math.exp(-Math.pow(ny - 0.56, 2) * 14);
          const rootZone = Math.exp(-Math.pow(ny - 0.12, 2) * 18) * 0.55;
          const stressRatio = Math.min(1, 0.18 + crownZone * 0.65 + (1 - nx) * 0.14 + rootZone);
          const [sr, sg, sb] = stressRatioToRgb(stressRatio);
          stressCols[i * 3] = sr;
          stressCols[i * 3 + 1] = sg;
          stressCols[i * 3 + 2] = sb;
        }

        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(localPos, 3));
        if (comp.normals && comp.normals.length === comp.positions.length) {
          g.setAttribute('normal', new THREE.BufferAttribute(comp.normals, 3));
        } else {
          g.computeVertexNormals();
        }
        g.setAttribute('color', new THREE.BufferAttribute(stressCols, 3));
        g.computeBoundingSphere();

        const mat = new THREE.MeshPhysicalMaterial({
          color: 0xcbd5e1,
          metalness: 0.78,
          roughness: 0.28,
          side: THREE.DoubleSide,
        });
        const m = new THREE.Mesh(g, mat);
        m.position.set(cx, cy, cz);
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData = {
          componentId: comp.id,
          name: comp.name,
          family: comp.family,
          subFamily: comp.subFamily,
          maskColorHex: comp.maskColorHex,
          inferredMaterial: comp.inferredMaterial,
          baseCenter: new THREE.Vector3(cx, cy, cz),
          baseRotY: 0,
        };
        refs.importedMeshGroup.add(m);
      }

      if (importedModel.wireSegments && importedModel.wireSegments.length > 0) {
        const wg = new THREE.BufferGeometry();
        wg.setAttribute('position', new THREE.BufferAttribute(importedModel.wireSegments, 3));
        refs.importedWireGroup.add(
          new THREE.LineSegments(
            wg,
            new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.48 })
          )
        );
      }
    } else {
      refs.floor.position.y = -0.5;
      refs.bedPlate.visible = true;
    }

    refs.requestRender();
  }, [importedModel]);

  // Update Display Modes, Material Finishes, Per-Component PBR, Object Mask, Section Cut & TransformControls
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    const hasImported = Boolean(importedModel && refs.importedMeshGroup.children.length > 0);
    const activeFea =
      display.stressComparisonView === 'before' && beforeFeaResult ? beforeFeaResult : feaResult;
    const isStressMode = display.mode === 'stress-heatmap' && Boolean(activeFea);
    const isMaskMode = display.mode === 'object-mask';
    const isComponentPbrMode = display.mode === 'component-pbr';
    const iso = display.isolationTarget || 'all';
    const isShellIsolatedOut = iso !== 'all' && iso !== 'shell';

    // Clipping plane update (supports GrabCAD X / Y / Z orientation + Flip + visual green-framed plane)
    if (display.sectionEnabled) {
      const b = hasImported && importedModel ? importedModel.boundingBox : meshData.boundingBox;
      const axisIdx = display.sectionAxis === 'x' ? 0 : display.sectionAxis === 'z' ? 2 : 1;
      const minA = b.min[axisIdx];
      const maxA = b.max[axisIdx];
      const coord = minA + (maxA - minA) * display.sectionRatio;
      const sign = display.sectionFlipped ? 1 : -1;

      const nx = display.sectionAxis === 'x' ? sign : 0;
      const ny = display.sectionAxis === 'y' ? sign : 0;
      const nz = display.sectionAxis === 'z' ? sign : 0;
      refs.clipPlane.set(new THREE.Vector3(nx, ny, nz), -sign * coord);

      const cx = (b.min[0] + b.max[0]) / 2;
      const cy = (b.min[1] + b.max[1]) / 2;
      const cz = (b.min[2] + b.max[2]) / 2;
      const sx = Math.max(40, (b.max[0] - b.min[0]) * 1.25);
      const sy = Math.max(40, (b.max[1] - b.min[1]) * 1.25);
      const sz = Math.max(40, (b.max[2] - b.min[2]) * 1.25);

      refs.sectionHelperGroup.visible = true;
      if (display.sectionAxis === 'x') {
        refs.sectionHelperGroup.position.set(coord, cy, cz);
        refs.sectionHelperGroup.rotation.set(0, Math.PI / 2, 0);
        refs.sectionHelperGroup.scale.set(sz, sy, 1);
      } else if (display.sectionAxis === 'z') {
        refs.sectionHelperGroup.position.set(cx, cy, coord);
        refs.sectionHelperGroup.rotation.set(0, 0, 0);
        refs.sectionHelperGroup.scale.set(sx, sy, 1);
      } else {
        refs.sectionHelperGroup.position.set(cx, coord, cz);
        refs.sectionHelperGroup.rotation.set(Math.PI / 2, 0, 0);
        refs.sectionHelperGroup.scale.set(sx, sz, 1);
      }
    } else {
      refs.sectionHelperGroup.visible = false;
    }
    const activeClipPlanes = display.sectionEnabled ? [refs.clipPlane] : [];

    // Update Assembly Global Rotation when gizmo isn't actively dragging it
    if (!refs.transformControls.dragging && !display.autoRotate) {
      refs.assemblyRoot.rotation.set(
        THREE.MathUtils.degToRad(display.assemblyRotationDeg[0]),
        THREE.MathUtils.degToRad(display.assemblyRotationDeg[1]),
        THREE.MathUtils.degToRad(display.assemblyRotationDeg[2])
      );
    }

    // Primary NURBS shell update
    const mat = refs.nurbsMesh.material as THREE.MeshPhysicalMaterial;
    const geo = refs.nurbsMesh.geometry;
    if (isStressMode && activeFea && activeFea.stressColors.length === meshData.colors.length) {
      geo.setAttribute('color', new THREE.BufferAttribute(activeFea.stressColors, 3));
    } else if (meshData.colors.length > 0) {
      geo.setAttribute('color', new THREE.BufferAttribute(meshData.colors, 3));
    }

    mat.clippingPlanes = activeClipPlanes;
    mat.clipShadows = true;
    const xrayOrGhost = display.mode === 'xray' || isShellIsolatedOut;
    mat.transparent = xrayOrGhost;
    mat.opacity = isShellIsolatedOut ? 0.08 : display.mode === 'xray' ? 0.36 : 1.0;
    mat.depthWrite = !xrayOrGhost;

    if (display.mode === 'zebra') {
      mat.vertexColors = false;
      mat.map = null;
      mat.color.setHex(0xffffff);
      mat.metalness = 1.0;
      mat.roughness = 0.04;
      refs.scene.environment = refs.zebraTex;
    } else if (display.mode === 'curvature' || isStressMode) {
      mat.vertexColors = true;
      mat.map = null;
      mat.color.setHex(0xffffff);
      mat.metalness = 0.08;
      mat.roughness = 0.56;
      refs.scene.environment = refs.defaultEnv;
    } else if (isMaskMode) {
      mat.vertexColors = false;
      mat.map = null;
      mat.color.set('#0ea5e9');
      mat.metalness = 0.12;
      mat.roughness = 0.58;
      mat.clearcoat = 0;
      refs.scene.environment = refs.defaultEnv;
    } else {
      refs.scene.environment = refs.defaultEnv;
      const shellFinish = isComponentPbrMode
        ? display.componentMaterials['shell'] ?? partProfile?.primaryMaterial ?? display.materialFinish
        : display.materialFinish;
      applyPbrFinishToMaterial(
        mat,
        shellFinish,
        refs.isSoftwareGl,
        refs.carbonAlbedoTex,
        refs.carbonRoughTex,
        xrayOrGhost
      );
    }
    if (display.selectedComponentId === 'shell') {
      mat.emissive.setHex(0x0284c7);
      mat.emissiveIntensity = 0.22;
    }
    mat.needsUpdate = true;

    // Update BIM Ribs individually (supports Object Mask, Per-Component PBR, Stress, Rotations, Hide)
    for (const child of refs.bimGroup.children) {
      const box = child as THREE.Mesh;
      const boxMat = box.material as THREE.MeshPhysicalMaterial;
      const {
        componentId,
        elementId,
        ifcClass,
        maskColorHex,
        inferredMaterial,
        baseRotY = 0,
      } = box.userData as {
        componentId: string;
        elementId: string;
        ifcClass: string;
        maskColorHex: string;
        inferredMaterial: MaterialFinish;
        baseRotY: number;
      };

      const isHidden = display.hiddenComponentIds.includes(componentId);
      let visibleByIso = !isHidden && !hasImported;
      if (visibleByIso) {
        if (iso === 'shell' || iso === 'imported') visibleByIso = false;
        else if (iso === 'ribs-u') visibleByIso = ifcClass === 'IfcBeam';
        else if (iso === 'ribs-v') visibleByIso = ifcClass === 'IfcMember';
        else if (iso !== 'all') visibleByIso = elementId === iso;
      }
      box.visible = visibleByIso;

      const customRot = display.componentRotations[componentId];
      if (!refs.transformControls.dragging) {
        if (customRot) {
          box.rotation.set(
            THREE.MathUtils.degToRad(customRot[0]),
            baseRotY + THREE.MathUtils.degToRad(customRot[1]),
            THREE.MathUtils.degToRad(customRot[2])
          );
        } else {
          box.rotation.set(0, baseRotY, 0);
        }
      }

      boxMat.clippingPlanes = activeClipPlanes;
      boxMat.clipShadows = true;
      boxMat.transparent = display.mode === 'xray';
      boxMat.opacity = display.mode === 'xray' ? 0.38 : 1.0;
      boxMat.depthWrite = display.mode !== 'xray';

      if (isStressMode && activeFea) {
        const elStress = activeFea.elementStresses.find((e) => e.elementId === elementId);
        const ratio = elStress ? elStress.maxStressMpa / Math.max(1, activeFea.maxStressMpa) : 0.25;
        const [r, g, b] = stressRatioToRgb(ratio);
        boxMat.color.setRGB(r, g, b);
        boxMat.metalness = 0.1;
        boxMat.roughness = 0.52;
        boxMat.map = null;
      } else if (isMaskMode) {
        boxMat.color.set(maskColorHex || '#14b8a6');
        boxMat.metalness = 0.1;
        boxMat.roughness = 0.6;
        boxMat.map = null;
      } else if (isComponentPbrMode || display.componentMaterials[componentId]) {
        const compMat = display.componentMaterials[componentId] ?? inferredMaterial;
        applyPbrFinishToMaterial(
          boxMat,
          compMat,
          refs.isSoftwareGl,
          refs.carbonAlbedoTex,
          refs.carbonRoughTex,
          display.mode === 'xray'
        );
      } else {
        applyPbrFinishToMaterial(
          boxMat,
          display.materialFinish,
          refs.isSoftwareGl,
          refs.carbonAlbedoTex,
          refs.carbonRoughTex,
          display.mode === 'xray'
        );
      }

      if (display.selectedComponentId === componentId) {
        boxMat.emissive.setHex(0xf59e0b);
        boxMat.emissiveIntensity = 0.25;
      } else {
        boxMat.emissive.setHex(0x000000);
        boxMat.emissiveIntensity = 0;
      }
      boxMat.needsUpdate = true;
    }

    // Update Imported CAD Multi-Component Meshes
    for (const child of refs.importedMeshGroup.children) {
      const m = child as THREE.Mesh;
      const mMat = m.material as THREE.MeshPhysicalMaterial;
      const { componentId, maskColorHex, inferredMaterial } = m.userData as {
        componentId: string;
        maskColorHex: string;
        inferredMaterial: MaterialFinish;
      };

      const isHidden = display.hiddenComponentIds.includes(componentId);
      const visibleByIso =
        !isHidden &&
        (iso === 'all' || iso === 'imported' || iso === componentId);
      m.visible = visibleByIso && (display.showImportedOverlay || iso === 'imported' || iso === componentId);

      const customRot = display.componentRotations[componentId];
      if (!refs.transformControls.dragging) {
        if (customRot) {
          m.rotation.set(
            THREE.MathUtils.degToRad(customRot[0]),
            THREE.MathUtils.degToRad(customRot[1]),
            THREE.MathUtils.degToRad(customRot[2])
          );
        } else {
          m.rotation.set(0, 0, 0);
        }
      }

      mMat.clippingPlanes = activeClipPlanes;
      mMat.clipShadows = true;
      mMat.transparent = display.mode === 'xray';
      mMat.opacity = display.mode === 'xray' ? 0.36 : 1.0;
      mMat.depthWrite = display.mode !== 'xray';

      if (isStressMode) {
        mMat.vertexColors = true;
        mMat.map = null;
        mMat.color.setHex(0xffffff);
        mMat.metalness = 0.08;
        mMat.roughness = 0.5;
        mMat.clearcoat = 0;
      } else if (isMaskMode) {
        mMat.vertexColors = false;
        mMat.map = null;
        mMat.color.set(maskColorHex || '#22c55e');
        mMat.metalness = 0.1;
        mMat.roughness = 0.56;
        mMat.clearcoat = 0;
      } else if (display.mode === 'zebra') {
        mMat.vertexColors = false;
        mMat.map = null;
        mMat.color.setHex(0xffffff);
        mMat.metalness = 1.0;
        mMat.roughness = 0.04;
      } else {
        const compFinish =
          display.componentMaterials[componentId] ??
          (isComponentPbrMode ? inferredMaterial : display.materialFinish);
        applyPbrFinishToMaterial(
          mMat,
          compFinish,
          refs.isSoftwareGl,
          refs.carbonAlbedoTex,
          refs.carbonRoughTex,
          display.mode === 'xray'
        );
      }

      if (display.mode === 'wireframe') {
        mMat.wireframe = true;
      }

      if (display.selectedComponentId === componentId) {
        mMat.emissive.setHex(0x38bdf8);
        mMat.emissiveIntensity = 0.28;
      }
      mMat.needsUpdate = true;
    }

    // Visibility switches: when an imported CAD model is loaded, focus cleanly on it unless user isolates parametric shell
    const showParametric = !hasImported && iso !== 'imported';
    refs.nurbsMesh.visible = showParametric && !display.hiddenComponentIds.includes('shell');
    refs.wireOverlay.visible = showParametric && display.mode === 'wireframe' && !isShellIsolatedOut;
    refs.isoGroup.visible = showParametric && display.showIsocurves && !isShellIsolatedOut;
    refs.cageGroup.visible = showParametric && display.showControlCage && !isShellIsolatedOut;
    refs.bimGroup.visible =
      showParametric &&
      (display.showBimRibs || iso === 'ribs-u' || iso === 'ribs-v' || iso.startsWith('BIM-'));
    refs.toolpathGroup.visible = display.showToolpath && !hasImported;
    refs.importedGroup.visible = hasImported && (display.showImportedOverlay || iso === 'imported' || iso.startsWith('COMP-'));
    refs.importedWireGroup.visible =
      refs.importedMeshGroup.children.length === 0 || display.mode === 'wireframe';

    const showMachine =
      !hasImported && display.showMachine && Boolean(toolpath && toolpath.points.length > 0);
    refs.spindleGroup.visible = showMachine && machineType !== 'robot-6axis';
    refs.robotRig.root.visible = showMachine && machineType === 'robot-6axis';

    // TransformControls Gizmo attachment
    const tHelper = refs.transformControls.getHelper();
    if (display.transformMode === 'none') {
      refs.transformControls.detach();
      tHelper.visible = false;
    } else {
      refs.transformControls.setMode(display.transformMode);
      let targetObj: THREE.Object3D = refs.assemblyRoot;
      if (display.selectedComponentId && display.selectedComponentId !== 'shell') {
        const foundImported = refs.importedMeshGroup.children.find(
          (c) => c.userData?.componentId === display.selectedComponentId
        );
        const foundBim = refs.bimGroup.children.find(
          (c) => c.userData?.componentId === display.selectedComponentId
        );
        if (foundImported && foundImported.visible) targetObj = foundImported;
        else if (foundBim && foundBim.visible) targetObj = foundBim;
      }
      refs.transformControls.attach(targetObj);
      tHelper.visible = true;
    }

    refs.requestRender();
  }, [display, machineType, toolpath, feaResult, beforeFeaResult, meshData, importedModel, partProfile]);

  // Update Toolpath Lines
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    while (refs.toolpathGroup.children.length > 0) {
      const child = refs.toolpathGroup.children.pop() as THREE.LineSegments;
      child.geometry.dispose();
    }

    if (toolpath && toolpath.points.length > 1) {
      const cutCoords: number[] = [];
      const rapidCoords: number[] = [];

      for (let i = 1; i < toolpath.points.length; i++) {
        const a = toolpath.points[i - 1];
        const b = toolpath.points[i];
        const target = b.rapid ? rapidCoords : cutCoords;
        target.push(a.x, a.z, -a.y, b.x, b.z, -b.y);
      }

      if (cutCoords.length > 0) {
        const cutGeo = new THREE.BufferGeometry();
        cutGeo.setAttribute('position', new THREE.Float32BufferAttribute(cutCoords, 3));
        refs.toolpathGroup.add(
          new THREE.LineSegments(cutGeo, new THREE.LineBasicMaterial({ color: 0x10b981 }))
        );
      }
      if (rapidCoords.length > 0) {
        const rapGeo = new THREE.BufferGeometry();
        rapGeo.setAttribute('position', new THREE.Float32BufferAttribute(rapidCoords, 3));
        refs.toolpathGroup.add(
          new THREE.LineSegments(
            rapGeo,
            new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.55 })
          )
        );
      }
    }
    refs.requestRender();
  }, [toolpath]);

  // Fit-to-View Framing Trigger (called automatically when CAD file opens or user presses Enquadrar)
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs || display.fitViewTrigger === 0) return;

    const targetGroup =
      importedModel && refs.importedMeshGroup.children.length > 0
        ? refs.importedGroup
        : refs.nurbsMesh;
    const box = new THREE.Box3().setFromObject(targetGroup);
    if (box.isEmpty()) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const radius = Math.max(45, size.length() * 0.5);

    refs.controls.maxDistance = Math.max(1600, radius * 8);
    refs.camera.far = Math.max(4500, radius * 18);
    refs.camera.updateProjectionMatrix();

    refs.cameraTargetLook = center.clone();
    refs.cameraTargetPos = center.clone().add(new THREE.Vector3(radius * 1.35, radius * 0.72, radius * 1.55));
    refs.requestRender();
  }, [display.fitViewTrigger, importedModel]);

  // Render 3D Measurement Markers & Dimension Lines
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs) return;

    while (refs.measureGroup.children.length > 0) {
      const ch = refs.measureGroup.children.pop() as THREE.Mesh | THREE.Line;
      ch.geometry.dispose();
      (ch.material as THREE.Material).dispose();
    }

    const box = new THREE.Box3().setFromObject(
      importedModel && refs.importedMeshGroup.children.length > 0 ? refs.importedGroup : refs.nurbsMesh
    );
    const sz = new THREE.Vector3();
    if (!box.isEmpty()) box.getSize(sz);
    const pinRadius = Math.max(1.8, Math.min(8, sz.length() * 0.012));

    const addPin = (pt: [number, number, number], hex: number) => {
      const geo = new THREE.SphereGeometry(pinRadius, 12, 12);
      const mat = new THREE.MeshBasicMaterial({ color: hex, depthTest: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(pt[0], pt[1], pt[2]);
      mesh.renderOrder = 999;
      refs.measureGroup.add(mesh);
    };

    if (pendingPick) {
      addPin([pendingPick.point.x, pendingPick.point.y, pendingPick.point.z], 0x38bdf8);
    }

    for (const m of measurements) {
      addPin(m.p1, 0xfacc15);
      if (m.p2) {
        addPin(m.p2, 0xfacc15);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...m.p1),
          new THREE.Vector3(...m.p2),
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false });
        const line = new THREE.Line(lineGeo, lineMat);
        line.renderOrder = 998;
        refs.measureGroup.add(line);
      }
    }

    refs.requestRender();
  }, [measurements, pendingPick, importedModel]);

  // Trigger camera preset smooth transition (all 7 GrabCAD Standard Views + perspective)
  useEffect(() => {
    const refs = sceneRefs.current;
    if (!refs || display.cameraTrigger === 0) return;

    const box = new THREE.Box3().setFromObject(
      importedModel && refs.importedMeshGroup.children.length > 0 ? refs.importedGroup : refs.nurbsMesh
    );
    const center = new THREE.Vector3(0, 32, 0);
    const size = new THREE.Vector3(210, 80, 145);
    if (!box.isEmpty()) {
      box.getCenter(center);
      box.getSize(size);
    }
    const dist = Math.max(180, size.length() * 1.45);

    const presets: Record<CameraPreset, { pos: [number, number, number]; look: [number, number, number] }> = {
      perspective: {
        pos: [center.x + dist * 0.65, center.y + dist * 0.48, center.z + dist * 0.78],
        look: [center.x, center.y, center.z],
      },
      isometric: {
        pos: [center.x + dist * 0.68, center.y + dist * 0.62, center.z + dist * 0.68],
        look: [center.x, center.y, center.z],
      },
      top: { pos: [center.x, center.y + dist * 1.15, center.z + 0.01], look: [center.x, center.y, center.z] },
      bottom: { pos: [center.x, center.y - dist * 1.15, center.z + 0.01], look: [center.x, center.y, center.z] },
      front: { pos: [center.x, center.y + dist * 0.04, center.z + dist * 1.15], look: [center.x, center.y, center.z] },
      back: { pos: [center.x, center.y + dist * 0.04, center.z - dist * 1.15], look: [center.x, center.y, center.z] },
      left: { pos: [center.x - dist * 1.15, center.y + dist * 0.04, center.z], look: [center.x, center.y, center.z] },
      right: { pos: [center.x + dist * 1.15, center.y + dist * 0.04, center.z], look: [center.x, center.y, center.z] },
    };
    const p = presets[display.cameraPreset];
    refs.cameraTargetPos = new THREE.Vector3(...p.pos);
    refs.cameraTargetLook = new THREE.Vector3(...p.look);
    refs.requestRender();
  }, [display.cameraPreset, display.cameraTrigger, importedModel]);

  useEffect(() => {
    sceneRefs.current?.requestRender();
  }, [simPlaying, simProgress]);

  // GrabCAD D-Pad Camera Orbit & Zoom Helpers
  const nudgeOrbit = (deltaTheta: number, deltaPhi: number) => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const target = refs.controls.target.clone();
    const offset = refs.camera.position.clone().sub(target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += deltaTheta;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaPhi, 0.08, Math.PI - 0.08);
    offset.setFromSpherical(spherical);
    refs.cameraTargetLook = target;
    refs.cameraTargetPos = target.clone().add(offset);
    refs.requestRender();
  };

  const nudgeZoom = (factor: number) => {
    const refs = sceneRefs.current;
    if (!refs) return;
    const target = refs.controls.target.clone();
    const offset = refs.camera.position.clone().sub(target);
    const nextLen = THREE.MathUtils.clamp(offset.length() * factor, 25, refs.controls.maxDistance);
    offset.setLength(nextLen);
    refs.cameraTargetLook = target;
    refs.cameraTargetPos = target.clone().add(offset);
    refs.requestRender();
  };

  const modes: { id: DisplayMode; label: string }[] = [
    { id: 'component-pbr', label: 'PBR p/ Peça' },
    { id: 'object-mask', label: 'Máscara Obj' },
    { id: 'solid', label: 'Sólido' },
    { id: 'stress-heatmap', label: 'Estresse FEA' },
    { id: 'wireframe', label: 'Malha' },
    { id: 'zebra', label: 'Zebra' },
    { id: 'curvature', label: 'Curvatura' },
    { id: 'xray', label: 'Raio-X' },
  ];

  const activeFea =
    display.stressComparisonView === 'before' && beforeFeaResult ? beforeFeaResult : feaResult;

  const selectedComponent = useMemo(
    () => components.find((c) => c.id === display.selectedComponentId) ?? null,
    [components, display.selectedComponentId]
  );

  // Deduplicated family legend for Object Mask mode
  const familyLegend = useMemo(() => {
    const map = new Map<string, { family: string; color: string; count: number }>();
    for (const c of components) {
      const prev = map.get(c.family);
      if (prev) prev.count += 1;
      else map.set(c.family, { family: c.family, color: c.maskColorHex, count: 1 });
    }
    return Array.from(map.values());
  }, [components]);

  const totalTriangles = importedModel
    ? importedModel.triangleCount
    : meshData.triangleCount;

  const allComponentIds = useMemo(() => components.map((c) => c.id), [components]);
  const allComponentsVisible =
    allComponentIds.length > 0 &&
    allComponentIds.every((id) => !display.hiddenComponentIds.includes(id));

  const toggleAllComponentsVisibility = () => {
    if (allComponentsVisible) {
      onUpdateDisplay({ hiddenComponentIds: allComponentIds });
    } else {
      onUpdateDisplay({ hiddenComponentIds: [] });
    }
  };

  const toggleComponentVisibility = (id: string) => {
    const isHidden = display.hiddenComponentIds.includes(id);
    onUpdateDisplay({
      hiddenComponentIds: isHidden
        ? display.hiddenComponentIds.filter((x) => x !== id)
        : [...display.hiddenComponentIds, id],
    });
  };

  const toggleGrabMenu = (tab: GrabCadMenuTab) => {
    setViewsMenuOpen(false);
    setHelpPopoverOpen(false);
    setActiveGrabMenu((prev) => (prev === tab ? 'none' : tab));
  };

  const measureModesList: { id: MeasureToolMode; label: string; hint: string }[] = [
    { id: 'edge-length', label: 'Comp. de aresta', hint: 'Clique em 1 aresta/face' },
    { id: 'edge-radius', label: 'Raio de aresta', hint: 'Clique no componente curvo' },
    { id: 'edge-diameter', label: 'Diâmetro', hint: 'Clique no tubo/furo' },
    { id: 'face-distance', label: 'Dist. entre faces', hint: 'Clique em 2 faces' },
    { id: 'point-distance', label: 'Dist. entre pontos', hint: 'Clique em 2 pontos 3D' },
    { id: 'face-angle', label: 'Ângulo entre faces', hint: 'Clique em 2 planos/faces' },
  ];

  const standardViews: { id: CameraPreset; label: string; full?: boolean }[] = [
    { id: 'front', label: 'FRONT' },
    { id: 'back', label: 'BACK' },
    { id: 'left', label: 'LEFT' },
    { id: 'right', label: 'RIGHT' },
    { id: 'top', label: 'TOP' },
    { id: 'bottom', label: 'BOTTOM' },
    { id: 'isometric', label: 'ISOMETRIC', full: true },
  ];

  return (
    <div
      className={`relative w-full h-full overflow-hidden bg-[#14171c] select-none ${
        measureMode ? 'cursor-crosshair' : ''
      }`}
    >
      <div ref={mountRef} className="w-full h-full" />

      {webglLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0c1017]/95 text-slate-200 z-30">
          <div className="text-center space-y-2 p-6 border border-white/10 rounded-xl bg-[#131924]">
            <p className="font-display text-base font-semibold">Contexto WebGL suspenso</p>
            <p className="text-xs text-slate-400">
              O navegador liberou os recursos gráficos temporariamente.
            </p>
          </div>
        </div>
      )}

      {/* GrabCAD Traditional Top 4-Icon Viewer Bar */}
      {!compact && (
        <div className="absolute top-0 left-0 right-0 z-20 flex flex-col items-center pointer-events-none">
          <div className="w-full h-11 bg-[#1f232b]/95 border-b border-white/10 flex items-center justify-center gap-1 sm:gap-2 px-2 pointer-events-auto shadow-md">
            <button
              type="button"
              title="Árvore de Modelos / Subcomponentes"
              onClick={() => toggleGrabMenu('models')}
              className={`h-full px-4 sm:px-6 flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
                activeGrabMenu === 'models'
                  ? 'bg-red-600 text-white'
                  : 'text-slate-200 hover:bg-white/8'
              }`}
            >
              <List className="w-5 h-5" />
              <span className="hidden md:inline">Modelos</span>
            </button>

            <button
              type="button"
              title="Plano de Corte em Seção (X / Y / Z)"
              onClick={() => toggleGrabMenu('section')}
              className={`h-full px-4 sm:px-6 flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
                activeGrabMenu === 'section' || display.sectionEnabled
                  ? 'bg-red-600 text-white'
                  : 'text-slate-200 hover:bg-white/8'
              }`}
            >
              <SplitSquareHorizontal className="w-5 h-5" />
              <span className="hidden md:inline">Seção</span>
            </button>

            <button
              type="button"
              title="Explodir Conjunto de Peças"
              onClick={() => toggleGrabMenu('explode')}
              className={`h-full px-4 sm:px-6 flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
                activeGrabMenu === 'explode' || display.explodeFactor > 0.01
                  ? 'bg-red-600 text-white'
                  : 'text-slate-200 hover:bg-white/8'
              }`}
            >
              <Box className="w-5 h-5" />
              <span className="hidden md:inline">Explodir</span>
            </button>

            <button
              type="button"
              title="Medir Arestas, Raios, Diâmetros, Distâncias e Ângulos"
              onClick={() => toggleGrabMenu('measure')}
              className={`h-full px-4 sm:px-6 flex items-center gap-2 text-xs font-medium transition-colors cursor-pointer ${
                activeGrabMenu === 'measure' || Boolean(measureMode)
                  ? 'bg-red-600 text-white'
                  : 'text-slate-200 hover:bg-white/8'
              }`}
            >
              <Ruler className="w-5 h-5" />
              <span className="hidden md:inline">Medir</span>
            </button>
          </div>

          {/* GrabCAD Popover 1: Models Tree Browser */}
          {activeGrabMenu === 'models' && (
            <div className="mt-2 ml-3 self-start sm:self-center sm:ml-0 w-[calc(100%-104px)] sm:w-80 max-h-[60vh] overflow-y-auto bg-[#232730]/95 border border-white/15 rounded-xl shadow-2xl p-3 text-xs text-slate-200 pointer-events-auto">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    title={treeExpandedAll ? 'Recolher tudo' : 'Expandir tudo'}
                    onClick={() => {
                      const next = !treeExpandedAll;
                      setTreeExpandedAll(next);
                      const map: Record<string, boolean> = {};
                      for (const c of components) map[c.id] = next;
                      setExpandedCompIds(map);
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded border border-white/20 bg-[#1a1d24] hover:border-white/40 cursor-pointer"
                  >
                    {treeExpandedAll ? <Minus className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={toggleAllComponentsVisibility}
                    className="flex items-center gap-2 font-semibold text-slate-100 cursor-pointer"
                  >
                    <span
                      className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
                        allComponentsVisible
                          ? 'bg-white text-slate-900 border-white'
                          : 'border-slate-400 bg-transparent'
                      }`}
                    >
                      {allComponentsVisible && <Check className="w-3 h-3 stroke-[3]" />}
                    </span>
                    <span>Models ({components.length})</span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveGrabMenu('none')}
                  className="text-slate-400 hover:text-white px-1 cursor-pointer"
                >
                  ×
                </button>
              </div>

              <div className="space-y-1">
                {components.map((comp) => {
                  const isVisible = !display.hiddenComponentIds.includes(comp.id);
                  const isExpanded = Boolean(expandedCompIds[comp.id]);
                  const isSelected = display.selectedComponentId === comp.id;
                  const isIsolated = display.isolationTarget === comp.id;
                  return (
                    <div
                      key={comp.id}
                      className={`rounded-lg border transition-colors ${
                        isSelected
                          ? 'border-sky-400/60 bg-sky-500/12'
                          : 'border-transparent hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 px-1.5 py-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedCompIds((prev) => ({ ...prev, [comp.id]: !prev[comp.id] }))
                          }
                          className="w-5 h-5 flex items-center justify-center rounded border border-white/15 bg-[#1a1d24] text-slate-300 shrink-0 cursor-pointer"
                        >
                          {isExpanded ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleComponentVisibility(comp.id)}
                          aria-label={`Alternar visibilidade de ${comp.name}`}
                          className={`w-4 h-4 rounded-sm border flex items-center justify-center shrink-0 cursor-pointer ${
                            isVisible
                              ? 'bg-white text-slate-900 border-white'
                              : 'border-slate-500 bg-transparent'
                          }`}
                        >
                          {isVisible && <Check className="w-3 h-3 stroke-[3]" />}
                        </button>
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: comp.maskColorHex }}
                        />
                        <button
                          type="button"
                          onClick={() => onUpdateDisplay({ selectedComponentId: comp.id })}
                          className="flex-1 text-left truncate text-[11px] font-medium text-slate-100 cursor-pointer"
                        >
                          {comp.name}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateDisplay({
                              isolationTarget: isIsolated ? 'all' : comp.id,
                              fitViewTrigger: display.fitViewTrigger + 1,
                            })
                          }
                          className={`px-1.5 py-0.5 text-[10px] rounded border shrink-0 cursor-pointer ${
                            isIsolated
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-semibold'
                              : 'border-white/15 text-slate-300 hover:border-amber-400/50'
                          }`}
                        >
                          {isIsolated ? 'Todos' : 'Isolar'}
                        </button>
                      </div>
                      {isExpanded && (
                        <div className="pl-8 pr-2 pb-2 text-[10px] text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>Família: {comp.family}</span>
                          <span>·</span>
                          <span>Sub: {comp.subFamily}</span>
                          <span>·</span>
                          <span className="font-mono-tabular">
                            {comp.triangleCount.toLocaleString('pt-BR')} tri
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* GrabCAD Popover 2: Section Plane Orientations (X | Y | Z + Flip + Slider) */}
          {activeGrabMenu === 'section' && (
            <div className="mt-2 w-72 bg-[#232730]/95 border border-white/15 rounded-xl shadow-2xl p-3 text-xs text-slate-200 space-y-2.5 pointer-events-auto">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-200">Orientação do plano de corte</span>
                <button
                  type="button"
                  onClick={() => setActiveGrabMenu('none')}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ×
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                {(['x', 'y', 'z'] as const).map((axis) => (
                  <button
                    key={axis}
                    type="button"
                    onClick={() =>
                      onUpdateDisplay({ sectionEnabled: true, sectionAxis: axis })
                    }
                    className={`flex-1 py-2 font-bold uppercase rounded-md border text-sm transition-colors cursor-pointer ${
                      display.sectionEnabled && display.sectionAxis === axis
                        ? 'bg-white text-slate-950 border-white'
                        : 'bg-[#191c23] text-slate-200 border-white/15 hover:border-white/40'
                    }`}
                  >
                    {axis}
                  </button>
                ))}
                <button
                  type="button"
                  title="Inverter direção do corte"
                  onClick={() =>
                    onUpdateDisplay({
                      sectionEnabled: true,
                      sectionFlipped: !display.sectionFlipped,
                    })
                  }
                  className={`px-3 py-2 rounded-md border transition-colors cursor-pointer ${
                    display.sectionFlipped
                      ? 'bg-red-600 text-white border-red-500'
                      : 'bg-[#191c23] text-slate-200 border-white/15 hover:border-white/40'
                  }`}
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span>Posição do plano</span>
                  <span className="font-mono-tabular text-emerald-400">
                    {Math.round(display.sectionRatio * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    aria-label="Posição do plano de corte"
                    min={0.05}
                    max={0.98}
                    step={0.01}
                    value={display.sectionRatio}
                    onChange={(e) =>
                      onUpdateDisplay({
                        sectionEnabled: true,
                        sectionRatio: parseFloat(e.target.value),
                      })
                    }
                    className="cad-slider flex-1"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                <span className="text-[10px] text-slate-400">
                  Arraste o controle para cortar a geometria
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateDisplay({ sectionEnabled: !display.sectionEnabled })
                  }
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                    display.sectionEnabled
                      ? 'bg-red-600 text-white'
                      : 'bg-emerald-500 text-slate-950'
                  }`}
                >
                  {display.sectionEnabled ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          )}

          {/* GrabCAD Popover 3: Explode Slider */}
          {activeGrabMenu === 'explode' && (
            <div className="mt-2 w-72 bg-[#232730]/95 border border-white/15 rounded-xl shadow-2xl px-3.5 py-2.5 text-xs text-slate-200 pointer-events-auto">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  aria-label="Reduzir explosão"
                  onClick={() =>
                    onUpdateDisplay({
                      explodeFactor: Math.max(0, Number((display.explodeFactor - 0.1).toFixed(2))),
                    })
                  }
                  className="w-6 h-6 flex items-center justify-center rounded bg-[#181b22] hover:bg-white/10 text-slate-200 cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="range"
                  aria-label="Explodir vista"
                  min={0}
                  max={1}
                  step={0.02}
                  value={display.explodeFactor}
                  onChange={(e) =>
                    onUpdateDisplay({ explodeFactor: parseFloat(e.target.value) })
                  }
                  className="cad-slider flex-1"
                />
                <button
                  type="button"
                  aria-label="Aumentar explosão"
                  onClick={() =>
                    onUpdateDisplay({
                      explodeFactor: Math.min(1, Number((display.explodeFactor + 0.1).toFixed(2))),
                    })
                  }
                  className="w-6 h-6 flex items-center justify-center rounded bg-[#181b22] hover:bg-white/10 text-slate-200 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono-tabular text-[11px] text-sky-300 w-8 text-right">
                  {Math.round(display.explodeFactor * 100)}%
                </span>
              </div>
            </div>
          )}

          {/* GrabCAD Popover 4: Measure Tools (6-grid + Clear + Unit Selector) */}
          {activeGrabMenu === 'measure' && (
            <div className="mt-2 w-[calc(100%-104px)] sm:w-80 max-h-[68vh] overflow-y-auto bg-[#232730]/95 border border-white/15 rounded-xl shadow-2xl p-3 text-xs text-slate-200 space-y-2.5 pointer-events-auto">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">Ferramenta de Medição 3D</span>
                <button
                  type="button"
                  onClick={() => setActiveGrabMenu('none')}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {measureModesList.map((m) => {
                  const active = measureMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setPendingPick(null);
                        setMeasureMode((prev) => (prev === m.id ? null : m.id));
                      }}
                      className={`p-2 rounded-lg border text-center transition-colors cursor-pointer ${
                        active
                          ? 'bg-red-600 text-white border-red-400'
                          : 'bg-[#191c23] text-slate-200 border-white/10 hover:border-white/30'
                      }`}
                    >
                      <div className="text-[11px] font-semibold leading-tight">{m.label}</div>
                      <div
                        className={`text-[9px] mt-0.5 ${
                          active ? 'text-red-100' : 'text-slate-400'
                        }`}
                      >
                        {m.hint}
                      </div>
                    </button>
                  );
                })}
              </div>

              {measureMode && (
                <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/35 text-[11px] text-amber-200">
                  {pendingPick
                    ? 'Ponto 1 marcado em azul. Clique no 2º ponto da peça na viewport 3D.'
                    : 'Modo medir ativo: toque ou clique diretamente sobre a peça 3D.'}
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  setMeasurements([]);
                  setPendingPick(null);
                }}
                className="w-full py-2 rounded-lg border border-white/15 bg-[#191c23] hover:bg-white/10 text-slate-200 font-medium flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpar medições
              </button>

              <div className="space-y-1">
                <label className="text-[11px] text-slate-400 block">Unidade de Medida:</label>
                <select
                  aria-label="Unidade de medida"
                  value={measureUnit}
                  onChange={(e) => setMeasureUnit(e.target.value as MeasureUnit)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#191c23] border border-white/15 text-slate-100 text-xs cursor-pointer"
                >
                  <option value="mm">milímetros (mm)</option>
                  <option value="cm">centímetros (cm)</option>
                  <option value="m">metros (m)</option>
                  <option value="in">polegadas (in)</option>
                </select>
              </div>

              {measurements.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-slate-400">
                    Leituras Recentes
                  </div>
                  {measurements.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between px-2 py-1 rounded bg-[#14171d] text-[11px]"
                    >
                      <span className="text-slate-300">{m.title}</span>
                      <span className="font-mono-tabular font-semibold text-yellow-300">
                        {formatMeasurement(m.valueMmOrDeg, m.isAngle, measureUnit)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Right-Side GrabCAD Red D-Pad + Zoom + VIEWS Menu */}
      {!compact && (
        <div className="absolute top-14 right-3 z-20 flex flex-col items-end gap-2">
          <div className="bg-red-600 rounded-xl p-1.5 shadow-xl border border-red-400/40 flex flex-col items-center gap-1">
            <div className="grid grid-cols-3 gap-0.5">
              <div />
              <button
                type="button"
                aria-label="Girar câmera para cima"
                onClick={() => nudgeOrbit(0, -0.26)}
                className="w-6 h-6 flex items-center justify-center rounded text-white hover:bg-white/20 cursor-pointer"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <div />

              <button
                type="button"
                aria-label="Girar câmera para esquerda"
                onClick={() => nudgeOrbit(-0.35, 0)}
                className="w-6 h-6 flex items-center justify-center rounded text-white hover:bg-white/20 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                title="Enquadrar Modelo"
                aria-label="Enquadrar modelo na tela"
                onClick={() =>
                  onUpdateDisplay({ fitViewTrigger: display.fitViewTrigger + 1 })
                }
                className="w-6 h-6 flex items-center justify-center rounded text-white hover:bg-white/20 cursor-pointer"
              >
                <Circle className="w-3 h-3 fill-white" />
              </button>
              <button
                type="button"
                aria-label="Girar câmera para direita"
                onClick={() => nudgeOrbit(0.35, 0)}
                className="w-6 h-6 flex items-center justify-center rounded text-white hover:bg-white/20 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <div />
              <button
                type="button"
                aria-label="Girar câmera para baixo"
                onClick={() => nudgeOrbit(0, 0.26)}
                className="w-6 h-6 flex items-center justify-center rounded text-white hover:bg-white/20 cursor-pointer"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
              <div />
            </div>

            <div className="w-full h-px bg-white/25 my-0.5" />

            <div className="flex items-center justify-around w-full">
              <button
                type="button"
                aria-label="Afastar zoom"
                onClick={() => nudgeZoom(1.22)}
                className="w-7 h-6 flex items-center justify-center rounded text-white hover:bg-white/20 cursor-pointer"
              >
                <Minus className="w-4 h-4 stroke-[2.5]" />
              </button>
              <button
                type="button"
                aria-label="Aproximar zoom"
                onClick={() => nudgeZoom(0.8)}
                className="w-7 h-6 flex items-center justify-center rounded text-white hover:bg-white/20 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
              </button>
            </div>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setHelpPopoverOpen(false);
                setViewsMenuOpen((v) => !v);
              }}
              className={`px-4 py-1.5 rounded-lg text-[11px] font-bold tracking-wider shadow-lg border transition-colors cursor-pointer ${
                viewsMenuOpen
                  ? 'bg-white text-red-600 border-white'
                  : 'bg-red-600 text-white border-red-400/40 hover:bg-red-500'
              }`}
            >
              VIEWS
            </button>

            {viewsMenuOpen && (
              <div className="absolute top-0 right-full mr-2 w-44 bg-[#232730]/95 border border-white/15 rounded-xl shadow-2xl overflow-hidden grid grid-cols-2 text-[11px] font-bold text-slate-100">
                {standardViews.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      onUpdateDisplay({
                        cameraPreset: v.id,
                        cameraTrigger: display.cameraTrigger + 1,
                      });
                      setViewsMenuOpen(false);
                    }}
                    className={`py-2.5 px-2 text-center border-b border-r border-white/10 hover:bg-red-600 hover:text-white transition-colors cursor-pointer ${
                      v.full ? 'col-span-2 border-r-0' : ''
                    } ${display.cameraPreset === v.id ? 'bg-red-600/30 text-white' : ''}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom-Right GrabCAD Quick Help (?) FAB */}
      {!compact && (
        <div className="absolute bottom-14 sm:bottom-4 right-3 z-20 flex flex-col items-end gap-2">
          {helpPopoverOpen && (
            <div className="w-64 bg-[#232730]/95 border border-white/15 rounded-xl shadow-2xl p-3 text-xs text-slate-200 space-y-2">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <span className="font-semibold text-slate-100">Navegação 3D GrabCAD</span>
                <button
                  type="button"
                  onClick={() => setHelpPopoverOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  ×
                </button>
              </div>
              <ul className="space-y-1 text-[11px] text-slate-300">
                <li>• <strong>Rotacionar</strong>: 1 dedo ou botão esquerdo</li>
                <li>• <strong>Mover (Pan)</strong>: 2 dedos ou botão direito</li>
                <li>• <strong>Zoom</strong>: Pinça, scroll ou + / -</li>
                <li>• <strong>Selecionar / Medir</strong>: Toque direto na peça</li>
                <li>• <strong>Toolbar Superior</strong>: Árvore, Seção, Explodir, Medir</li>
              </ul>
              {onOpenHelp && (
                <button
                  type="button"
                  onClick={() => {
                    setHelpPopoverOpen(false);
                    onOpenHelp();
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  Abrir Guia Completo c/ Voz
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            aria-label="Ajuda rápida de navegação 3D"
            onClick={() => {
              setViewsMenuOpen(false);
              setHelpPopoverOpen((v) => !v);
            }}
            className="w-10 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white shadow-xl border border-red-400/40 flex items-center justify-center cursor-pointer"
          >
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Top-Left Part Identity, Spec Readout & Selected Component Bar (safely below GrabCAD top strip) */}
      <div
        className={`absolute left-3 z-10 flex flex-col gap-1.5 ${
          compact
            ? 'top-3 max-w-[calc(100%-24px)]'
            : 'top-14 max-w-[calc(100%-108px)] sm:max-w-[460px]'
        }`}
      >
        <div className="pointer-events-none text-xs font-medium text-slate-200 bg-[#0e131c]/95 border border-white/10 rounded-lg px-3 py-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="font-semibold text-slate-100 truncate max-w-[220px]">
            {partProfile?.partName || importedModel?.filename || surface.name}
          </span>
          {partProfile?.manufacturer && (
            <>
              <span className="text-slate-500">·</span>
              <span className="text-[11px] text-sky-300 truncate">{partProfile.manufacturer}</span>
            </>
          )}
          <span className="text-slate-500">·</span>
          <span className="font-mono-tabular text-sky-400">
            {totalTriangles.toLocaleString('pt-BR')} tri
          </span>
          <span className="text-slate-500">·</span>
          <span className="font-mono-tabular text-emerald-300">
            {components.length} peças
          </span>
        </div>

        {display.isolationTarget !== 'all' && (
          <div className="flex items-center gap-2 text-[11px] bg-amber-500/15 border border-amber-400/40 text-amber-200 rounded-lg px-3 py-1 w-fit">
            <span>
              Peça Isolada: <strong className="font-mono-tabular">{display.isolationTarget}</strong>
            </span>
            <button
              type="button"
              onClick={() =>
                onUpdateDisplay({
                  isolationTarget: 'all',
                  fitViewTrigger: display.fitViewTrigger + 1,
                })
              }
              className="underline text-amber-300 hover:text-white cursor-pointer"
            >
              Restaurar Conjunto
            </button>
          </div>
        )}

        {selectedComponent && (
          <div className="flex flex-wrap items-center gap-2 text-[11px] bg-[#111620]/95 border border-sky-400/45 text-slate-200 rounded-lg px-3 py-1.5 shadow-lg">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ backgroundColor: selectedComponent.maskColorHex }}
            />
            <div className="min-w-0">
              <strong className="text-slate-100">{selectedComponent.name}</strong>
              <span className="text-slate-400 ml-1.5">
                ({selectedComponent.family} · {selectedComponent.subFamily})
              </span>
            </div>
            <select
              aria-label="Material do componente selecionado"
              value={
                display.componentMaterials[selectedComponent.id] ??
                selectedComponent.inferredMaterial
              }
              onChange={(e) =>
                onUpdateDisplay({
                  mode: 'component-pbr',
                  perComponentPbr: true,
                  componentMaterials: {
                    ...display.componentMaterials,
                    [selectedComponent.id]: e.target.value as MaterialFinish,
                  },
                })
              }
              className="px-2 py-0.5 text-[11px] bg-[#080a0f] border border-white/15 rounded text-slate-100 cursor-pointer"
            >
              {FINISH_OPTIONS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                const cur = display.componentRotations[selectedComponent.id] ?? [0, 0, 0];
                onUpdateDisplay({
                  componentRotations: {
                    ...display.componentRotations,
                    [selectedComponent.id]: [cur[0], (cur[1] + 45) % 360, cur[2]],
                  },
                });
              }}
              className="px-2 py-0.5 bg-[#0c1017] border border-white/12 hover:border-sky-400 rounded text-sky-300 cursor-pointer"
            >
              Girar +45°
            </button>
            <button
              type="button"
              onClick={() => toggleComponentVisibility(selectedComponent.id)}
              title="Ocultar / Mostrar peça"
              className="px-1.5 py-0.5 bg-[#0c1017] border border-white/12 hover:border-white/30 rounded text-slate-300 cursor-pointer"
            >
              {display.hiddenComponentIds.includes(selectedComponent.id) ? (
                <Eye className="w-3.5 h-3.5" />
              ) : (
                <EyeOff className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() =>
                onUpdateDisplay({
                  isolationTarget:
                    display.isolationTarget === selectedComponent.id ? 'all' : selectedComponent.id,
                  fitViewTrigger: display.fitViewTrigger + 1,
                })
              }
              className="px-2 py-0.5 bg-amber-500/15 border border-amber-400/40 rounded text-amber-200 cursor-pointer"
            >
              {display.isolationTarget === selectedComponent.id ? 'Desisolar' : 'Isolar'}
            </button>
            <button
              type="button"
              onClick={() => onUpdateDisplay({ selectedComponentId: null })}
              className="text-slate-400 hover:text-white ml-1 cursor-pointer"
            >
              ×
            </button>
          </div>
        )}

        {liveReadout && display.showMachine && !importedModel && (
          <div className="pointer-events-none text-[11px] font-mono-tabular text-emerald-300 bg-[#0e131c]/90 border border-emerald-500/25 rounded-lg px-3 py-1 w-fit">
            DRO X {liveReadout.x.toFixed(1)} · Y {liveReadout.y.toFixed(1)} · Z{' '}
            {liveReadout.z.toFixed(1)} mm
          </div>
        )}
      </div>

      {/* Bottom-Left FEA Stress Heatmap Legend (avoids colliding with Right D-Pad) */}
      {display.mode === 'stress-heatmap' && activeFea && (
        <div className="absolute bottom-20 left-3 z-10 w-64 bg-[#0e131c]/95 border border-white/12 rounded-xl p-3 space-y-2 hidden sm:block">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-100">Mapa de Calor Von Mises</span>
            <span
              className={`font-mono-tabular font-semibold ${
                activeFea.status === 'seguro'
                  ? 'text-emerald-400'
                  : activeFea.status === 'alerta'
                    ? 'text-amber-400'
                    : 'text-rose-400'
              }`}
            >
              SF {activeFea.safetyFactor}×
            </span>
          </div>
          <div
            className="h-2.5 w-full rounded-sm"
            style={{
              background:
                'linear-gradient(90deg, #1240e0 0%, #12e6fa 25%, #30db54 50%, #f7eb14 75%, #f72429 100%)',
            }}
          />
          <div className="flex justify-between text-[10px] font-mono-tabular text-slate-400">
            <span>{activeFea.minStressMpa} MPa</span>
            <span>{activeFea.meanStressMpa} méd</span>
            <span className="text-rose-300 font-semibold">{activeFea.maxStressMpa} MPa</span>
          </div>
          {activeFea.complianceNote && (
            <div className="text-[10px] text-slate-300 leading-snug pt-1 border-t border-white/8">
              {activeFea.complianceNote}
            </div>
          )}
          {beforeFeaResult && (
            <div className="flex items-center gap-1 pt-1 border-t border-white/10">
              <button
                type="button"
                onClick={() => onUpdateDisplay({ stressComparisonView: 'before' })}
                className={`flex-1 py-1 text-[10px] font-medium rounded cursor-pointer ${
                  display.stressComparisonView === 'before'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#141a24] text-slate-300 hover:text-white'
                }`}
              >
                Antes ({beforeFeaResult.maxStressMpa} MPa)
              </button>
              <button
                type="button"
                onClick={() => onUpdateDisplay({ stressComparisonView: 'current' })}
                className={`flex-1 py-1 text-[10px] font-medium rounded cursor-pointer ${
                  display.stressComparisonView === 'current'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#141a24] text-slate-300 hover:text-white'
                }`}
              >
                Depois ({feaResult?.maxStressMpa ?? 0} MPa)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Bottom-Left Object Mask Family Legend */}
      {display.mode === 'object-mask' && (
        <div className="absolute bottom-20 left-3 z-10 w-64 max-h-60 overflow-y-auto bg-[#0e131c]/95 border border-white/12 rounded-xl p-3 space-y-2 hidden sm:block">
          <div className="text-[11px] font-semibold text-slate-100">
            Object Mask · Famílias ({familyLegend.length})
          </div>
          <div className="space-y-1">
            {familyLegend.map((fam) => (
              <div
                key={fam.family}
                className="flex items-center justify-between gap-2 text-[11px] text-slate-300"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: fam.color }}
                  />
                  <span className="truncate">{fam.family}</span>
                </div>
                <span className="font-mono-tabular text-[10px] text-slate-500 shrink-0">
                  {fam.count}×
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collapsible Engineering Shaders, Materials & Gizmo Dock */}
      {!compact && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center max-w-[calc(100vw-110px)] sm:max-w-[90vw]">
          <button
            type="button"
            onClick={() => setDockCollapsed((v) => !v)}
            className="mb-1.5 px-3 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-[#131924]/95 border border-white/10 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {dockCollapsed ? '▴ Shaders, Materiais & Gizmo' : '▾ Ocultar Barra Inferior'}
          </button>

          {!dockCollapsed && (
            <div className="flex flex-col gap-2 px-3 py-2.5 bg-[#131924]/95 border border-white/10 rounded-xl shadow-2xl max-w-full overflow-x-auto">
              {/* Row 1: Display Modes + Global Material Swatches */}
              <div className="flex items-center gap-2.5 overflow-x-auto pb-0.5">
                <div className="flex items-center gap-0.5 p-0.5 bg-[#0b0e14] border border-white/5 rounded-lg shrink-0">
                  {modes.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => onUpdateDisplay({ mode: m.id })}
                      className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        display.mode === m.id
                          ? 'bg-sky-500 text-slate-950'
                          : 'text-slate-400 hover:text-slate-100'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>

                <div className="h-4 w-px bg-white/10 shrink-0" />

                <div className="flex items-center gap-1 shrink-0">
                  {FINISH_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      title={`Aplicar ${f.label}`}
                      onClick={() =>
                        display.selectedComponentId
                          ? onUpdateDisplay({
                              mode: 'component-pbr',
                              perComponentPbr: true,
                              componentMaterials: {
                                ...display.componentMaterials,
                                [display.selectedComponentId]: f.id,
                              },
                            })
                          : onUpdateDisplay({ materialFinish: f.id, mode: 'solid' })
                      }
                      className={`flex items-center gap-1 px-2 py-1 text-[11px] rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        (display.selectedComponentId
                          ? display.componentMaterials[display.selectedComponentId] === f.id
                          : display.materialFinish === f.id && display.mode === 'solid')
                          ? 'border-sky-400 bg-sky-500/15 text-slate-100'
                          : 'border-white/10 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: f.swatch }}
                      />
                      <span className="hidden xl:inline">{f.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Quick Rotation, Auto-Giro, Gizmo 3D & Fit */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDisplay({
                        assemblyRotationDeg: [
                          display.assemblyRotationDeg[0],
                          (display.assemblyRotationDeg[1] + 45) % 360,
                          display.assemblyRotationDeg[2],
                        ],
                      })
                    }
                    className="px-2 py-1 rounded-md border border-white/10 text-slate-300 hover:text-white hover:border-sky-400/50 whitespace-nowrap cursor-pointer"
                  >
                    Girar +45°
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateDisplay({ autoRotate: !display.autoRotate })}
                    className={`px-2 py-1 rounded-md border whitespace-nowrap cursor-pointer ${
                      display.autoRotate
                        ? 'border-sky-400/60 bg-sky-500/15 text-sky-300'
                        : 'border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Auto-Giro
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDisplay({
                        transformMode: display.transformMode === 'rotate' ? 'none' : 'rotate',
                      })
                    }
                    className={`px-2 py-1 rounded-md border whitespace-nowrap cursor-pointer ${
                      display.transformMode !== 'none'
                        ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                        : 'border-white/10 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Gizmo 3D
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateDisplay({ fitViewTrigger: display.fitViewTrigger + 1 })
                    }
                    className="px-2 py-1 rounded-md border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 whitespace-nowrap cursor-pointer"
                  >
                    Enquadrar
                  </button>
                  {(
                    [
                      { id: 'isometric', label: 'Iso' },
                      { id: 'top', label: 'Topo' },
                      { id: 'front', label: 'Frontal' },
                      { id: 'right', label: 'Lateral' },
                    ] as { id: CameraPreset; label: string }[]
                  ).map((cam) => (
                    <button
                      key={cam.id}
                      type="button"
                      onClick={() =>
                        onUpdateDisplay({
                          cameraPreset: cam.id,
                          cameraTrigger: display.cameraTrigger + 1,
                        })
                      }
                      className="px-2 py-1 text-slate-300 hover:text-white hover:bg-white/10 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {cam.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
