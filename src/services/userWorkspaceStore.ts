import type { User } from 'firebase/auth';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { OperationType, db, handleFirestoreError } from '../firebase';
import type {
  CamSettings,
  DisplayMode,
  MaterialFinish,
  ParametricDesignParams,
  SessionDeliverable,
} from '../types/cad';

export interface SavedCadProject {
  id: string;
  ownerId: string;
  name: string;
  preset: ParametricDesignParams['preset'];
  materialFinish: MaterialFinish;
  displayMode: DisplayMode;
  designParams: ParametricDesignParams;
  camSettings: CamSettings;
  sessionSeconds: number;
  updatedAtMs: number;
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_-]+$/;
const VALID_PRESETS: ParametricDesignParams['preset'][] = [
  'shell',
  'impeller',
  'cavity',
  'diagrid',
];
const VALID_FINISHES: MaterialFinish[] = [
  'aluminum',
  'titanium',
  'clay',
  'oak',
  'glass',
  'carbon-fiber',
  'matte-plastic',
];
const VALID_DISPLAY_MODES: DisplayMode[] = [
  'solid',
  'wireframe',
  'zebra',
  'curvature',
  'xray',
];
const VALID_KINDS: SessionDeliverable['kind'][] = [
  '3DM',
  'STL',
  'DXF',
  'NC',
  'SRC',
  'MOD',
  'PLUGIN',
  'MCP',
  'ICS',
  'REPORT',
  'SVG',
  'PDF',
  'PNG',
  'JPG',
];

function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(max, Math.max(min, val));
}

export function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  if (cleaned.length > 0 && VALID_ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}_${Date.now()}`;
}

function sanitizeDesignParams(p: ParametricDesignParams): ParametricDesignParams {
  return {
    preset: VALID_PRESETS.includes(p.preset) ? p.preset : 'shell',
    spanX: clamp(p.spanX, 20, 2000),
    spanY: clamp(p.spanY, 20, 2000),
    archHeight: clamp(p.archHeight, -500, 500),
    waveAmplitude: clamp(p.waveAmplitude, 0, 300),
    twistDeg: clamp(p.twistDeg, -360, 360),
    thicknessMm: clamp(p.thicknessMm, 0.5, 100),
    uDivisions: Math.round(clamp(p.uDivisions, 4, 128)),
    vDivisions: Math.round(clamp(p.vDivisions, 4, 128)),
    ribCountU: Math.round(clamp(p.ribCountU, 0, 40)),
    ribCountV: Math.round(clamp(p.ribCountV, 0, 40)),
    ribHeightMm: clamp(p.ribHeightMm, 0, 200),
    attractorStrength: clamp(p.attractorStrength, -200, 200),
  };
}

function sanitizeCamSettings(c: CamSettings): CamSettings {
  const validMachines: CamSettings['machineType'][] = [
    'manual',
    'cnc-3axis',
    'cnc-5axis',
    'robot-6axis',
    'powder-metal',
    'resin-sla',
    'robot-weld',
    'laser-cut',
  ];
  const validStrategies: CamSettings['strategy'][] = ['raster', 'isoparm', 'contour'];
  const validPosts: CamSettings['postFormat'][] = [
    'fanuc-nc',
    'grbl-gcode',
    'kuka-krl',
    'abb-rapid',
    'manual-sheet',
    'slm-powder',
    'sla-resin',
    'weld-tig-mig',
    'laser-g',
  ];
  return {
    machineType: validMachines.includes(c.machineType) ? c.machineType : 'cnc-5axis',
    strategy: validStrategies.includes(c.strategy) ? c.strategy : 'isoparm',
    toolId: (c.toolId || 'tool-ball-8').slice(0, 64),
    stepoverPct: clamp(c.stepoverPct, 1, 100),
    stepdownMm: clamp(c.stepdownMm, 0.05, 100),
    stockMarginMm: clamp(c.stockMarginMm, 0, 50),
    safeZMm: clamp(c.safeZMm, 1, 500),
    cutSpeedMultiplier: clamp(c.cutSpeedMultiplier, 0.1, 5.0),
    postFormat: validPosts.includes(c.postFormat) ? c.postFormat : 'fanuc-nc',
    ...(c.additiveConfig
      ? {
          additiveConfig: {
            layerThicknessUm: clamp(c.additiveConfig.layerThicknessUm, 10, 150),
            supportPattern: c.additiveConfig.supportPattern,
            supportDensityPct: clamp(c.additiveConfig.supportDensityPct, 0, 60),
            overhangAngleDeg: clamp(c.additiveConfig.overhangAngleDeg, 15, 75),
            sinterLaserPowerW: clamp(c.additiveConfig.sinterLaserPowerW, 0.05, 1200),
            sinterScanSpeedMmS: clamp(c.additiveConfig.sinterScanSpeedMmS, 100, 5000),
            sinterTempC: clamp(c.additiveConfig.sinterTempC, 25, 1500),
            sinterHoldMinutes: clamp(c.additiveConfig.sinterHoldMinutes, 5, 360),
            atmosphere: c.additiveConfig.atmosphere,
            hatchSpacingMm: clamp(c.additiveConfig.hatchSpacingMm, 0.03, 0.4),
          },
        }
      : {}),
  };
}

function isTransientOfflineError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code).toLowerCase()
      : '';
  return (
    code === 'unavailable' ||
    msg.includes('client is offline') ||
    msg.includes('unavailable') ||
    msg.includes('network')
  );
}

export async function ensureUserProfile(user: User): Promise<void> {
  if (!user.uid || !user.email || !user.emailVerified) return;
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const displayName = (user.displayName?.trim() || user.email.split('@')[0] || 'Usuário CAD').slice(
    0,
    120
  );
  const email = user.email.slice(0, 254);
  const photoUrl = (user.photoURL || '').slice(0, 512);

  const retryDelays = [0, 900, 2000];
  let lastError: unknown;

  for (let i = 0; i < retryDelays.length; i += 1) {
    if (retryDelays[i] > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelays[i]));
    }
    try {
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          uid: user.uid,
          displayName,
          email,
          photoUrl,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(userRef, {
          displayName,
          email,
          photoUrl,
          updatedAt: serverTimestamp(),
        });
      }
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientOfflineError(error) || i === retryDelays.length - 1) {
        break;
      }
    }
  }

  handleFirestoreError(lastError, OperationType.WRITE, path);
}

export async function saveUserCadProject(
  uid: string,
  rawProjectId: string,
  data: {
    name: string;
    materialFinish: MaterialFinish;
    displayMode: DisplayMode;
    designParams: ParametricDesignParams;
    camSettings: CamSettings;
    sessionSeconds: number;
  }
): Promise<string> {
  const projectId = sanitizeId(rawProjectId, 'proj');
  const path = `users/${uid}/projects/${projectId}`;
  const projRef = doc(db, 'users', uid, 'projects', projectId);

  const safeDesign = sanitizeDesignParams(data.designParams);
  const safeCam = sanitizeCamSettings(data.camSettings);
  const safeName = (data.name.trim() || 'Projeto Paramétrico').slice(0, 120);
  const safeFinish = VALID_FINISHES.includes(data.materialFinish)
    ? data.materialFinish
    : 'aluminum';
  const safeDisplay = VALID_DISPLAY_MODES.includes(data.displayMode)
    ? data.displayMode
    : 'solid';
  const safeSeconds = Math.round(clamp(data.sessionSeconds, 0, 8640000));

  try {
    const existing = await getDoc(projRef);
    if (!existing.exists()) {
      await setDoc(projRef, {
        id: projectId,
        ownerId: uid,
        name: safeName,
        preset: safeDesign.preset,
        materialFinish: safeFinish,
        displayMode: safeDisplay,
        designParams: safeDesign,
        camSettings: safeCam,
        sessionSeconds: safeSeconds,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(projRef, {
        name: safeName,
        preset: safeDesign.preset,
        materialFinish: safeFinish,
        displayMode: safeDisplay,
        designParams: safeDesign,
        camSettings: safeCam,
        sessionSeconds: safeSeconds,
        updatedAt: serverTimestamp(),
      });
    }
    return projectId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserCadProject(uid: string, projectId: string): Promise<void> {
  const safeId = sanitizeId(projectId, 'proj');
  const path = `users/${uid}/projects/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'projects', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserProjects(
  uid: string,
  onData: (projects: SavedCadProject[]) => void
): Unsubscribe {
  const path = `users/${uid}/projects`;
  const q = query(
    collection(db, 'users', uid, 'projects'),
    where('ownerId', '==', uid),
    limit(25)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items: SavedCadProject[] = snapshot.docs.map((d) => {
        const raw = d.data();
        const updatedAt = raw.updatedAt instanceof Timestamp ? raw.updatedAt.toMillis() : Date.now();
        return {
          id: String(raw.id || d.id),
          ownerId: String(raw.ownerId || uid),
          name: String(raw.name || 'Projeto sem nome'),
          preset: (raw.preset || 'shell') as ParametricDesignParams['preset'],
          materialFinish: (raw.materialFinish || 'aluminum') as MaterialFinish,
          displayMode: (raw.displayMode || 'solid') as DisplayMode,
          designParams: raw.designParams as ParametricDesignParams,
          camSettings: raw.camSettings as CamSettings,
          sessionSeconds: Number(raw.sessionSeconds || 0),
          updatedAtMs: updatedAt,
        };
      });
      items.sort((a, b) => b.updatedAtMs - a.updatedAtMs);
      onData(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveUserDeliverable(
  uid: string,
  item: SessionDeliverable,
  sessionSeconds: number
): Promise<void> {
  const safeId = sanitizeId(item.id, 'deliv');
  const path = `users/${uid}/deliverables/${safeId}`;
  const docRef = doc(db, 'users', uid, 'deliverables', safeId);
  const safeKind = VALID_KINDS.includes(item.kind) ? item.kind : 'REPORT';

  try {
    await setDoc(docRef, {
      id: safeId,
      ownerId: uid,
      filename: (item.filename || 'artefato.bin').slice(0, 160),
      kind: safeKind,
      summary: (item.summary || 'Entregável CAD/CAM').slice(0, 240),
      timestampLabel: (item.timestamp || new Date().toLocaleTimeString('pt-BR')).slice(0, 32),
      sessionSeconds: Math.round(clamp(sessionSeconds, 0, 8640000)),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeUserDeliverables(
  uid: string,
  onData: (deliverables: SessionDeliverable[]) => void
): Unsubscribe {
  const path = `users/${uid}/deliverables`;
  const q = query(
    collection(db, 'users', uid, 'deliverables'),
    where('ownerId', '==', uid),
    limit(30)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map((d) => {
        const raw = d.data();
        const createdMs = raw.createdAt instanceof Timestamp ? raw.createdAt.toMillis() : 0;
        return {
          createdMs,
          item: {
            id: String(raw.id || d.id),
            filename: String(raw.filename || ''),
            kind: (raw.kind || 'REPORT') as SessionDeliverable['kind'],
            timestamp: String(raw.timestampLabel || ''),
            summary: String(raw.summary || ''),
          } satisfies SessionDeliverable,
        };
      });
      list.sort((a, b) => b.createdMs - a.createdMs);
      onData(list.map((x) => x.item));
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}
