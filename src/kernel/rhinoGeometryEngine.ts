import type { MagicPenOperationKind } from '../types/cad';

export interface RhinoCommandCatalogEntry {
  kind: Extract<MagicPenOperationKind, `rhino-${string}`>;
  command: string;
  category: 'Sólidos & Extrusão' | 'Superfícies NURBS' | 'Booleanos & Casca' | 'Matriz & Deformação';
  description: string;
  syntaxExample: string;
  defaultParams: {
    widthMm: number;
    lengthMm: number;
    diameterMm: number;
    depthMm: number;
    radiusMm?: number;
    wallThicknessMm?: number;
    angleDeg?: number;
    count?: number;
    axis?: 'x' | 'y' | 'z';
  };
}

export const RHINO_COMMAND_CATALOG: RhinoCommandCatalogEntry[] = [
  {
    kind: 'rhino-extrude-crv',
    command: 'ExtrudeCrv',
    category: 'Sólidos & Extrusão',
    description: 'Extruda um perfil fechado/aberto ao longo da normal com altura paramétrica em mm.',
    syntaxExample: 'ExtrudeCrv 18mm',
    defaultParams: { widthMm: 22, lengthMm: 28, diameterMm: 22, depthMm: 18, axis: 'y' },
  },
  {
    kind: 'rhino-revolve',
    command: 'Revolve',
    category: 'Sólidos & Extrusão',
    description: 'Revoluciona perfil geratriz em torno do eixo selecionado (até 360°).',
    syntaxExample: 'Revolve 360 r=16',
    defaultParams: { widthMm: 32, lengthMm: 32, diameterMm: 32, depthMm: 24, radiusMm: 16, angleDeg: 360, axis: 'y' },
  },
  {
    kind: 'rhino-loft',
    command: 'Loft',
    category: 'Superfícies NURBS',
    description: 'Cria transição suave multi-seção NURBS entre curvas de perfil.',
    syntaxExample: 'Loft h=26 w=24',
    defaultParams: { widthMm: 24, lengthMm: 36, diameterMm: 24, depthMm: 26 },
  },
  {
    kind: 'rhino-sweep1',
    command: 'Sweep1',
    category: 'Superfícies NURBS',
    description: 'Varre seção transversal ao longo de 1 trilho spline contínuo.',
    syntaxExample: 'Sweep1 l=42 w=14',
    defaultParams: { widthMm: 14, lengthMm: 42, diameterMm: 14, depthMm: 14 },
  },
  {
    kind: 'rhino-sweep2',
    command: 'Sweep2',
    category: 'Superfícies NURBS',
    description: 'Varre seção controlada por 2 trilhos de contorno com continuidade G2.',
    syntaxExample: 'Sweep2 l=48 w=18',
    defaultParams: { widthMm: 18, lengthMm: 48, diameterMm: 18, depthMm: 16 },
  },
  {
    kind: 'rhino-pipe',
    command: 'Pipe',
    category: 'Sólidos & Extrusão',
    description: 'Gera duto/tubo cilíndrico ao longo de curva ou eixo com raio controlado.',
    syntaxExample: 'Pipe r=6 l=40',
    defaultParams: { widthMm: 12, lengthMm: 40, diameterMm: 12, depthMm: 12, radiusMm: 6 },
  },
  {
    kind: 'rhino-fillet-edge',
    command: 'FilletEdge',
    category: 'Sólidos & Extrusão',
    description: 'Arredonda arestas com raio constante tangente para alívio de tensão.',
    syntaxExample: 'FilletEdge 3.5mm',
    defaultParams: { widthMm: 7, lengthMm: 26, diameterMm: 7, depthMm: 7, radiusMm: 3.5 },
  },
  {
    kind: 'rhino-chamfer-edge',
    command: 'ChamferEdge',
    category: 'Sólidos & Extrusão',
    description: 'Aplica chanfro angular usinado (45°) nas arestas selecionadas.',
    syntaxExample: 'ChamferEdge 2.5mm',
    defaultParams: { widthMm: 5, lengthMm: 26, diameterMm: 5, depthMm: 2.5, radiusMm: 2.5 },
  },
  {
    kind: 'rhino-boolean-union',
    command: 'BooleanUnion',
    category: 'Booleanos & Casca',
    description: 'Funde dois sólidos fechados em um único B-Rep contínuo.',
    syntaxExample: 'BooleanUnion 24mm',
    defaultParams: { widthMm: 24, lengthMm: 24, diameterMm: 24, depthMm: 16 },
  },
  {
    kind: 'rhino-boolean-diff',
    command: 'BooleanDifference',
    category: 'Booleanos & Casca',
    description: 'Subtrai volume cortante (alívio, bolso CNC ou rasgo) do sólido alvo.',
    syntaxExample: 'BooleanDifference 16mm',
    defaultParams: { widthMm: 16, lengthMm: 28, diameterMm: 16, depthMm: 12 },
  },
  {
    kind: 'rhino-boolean-intersect',
    command: 'BooleanIntersection',
    category: 'Booleanos & Casca',
    description: 'Mantém exclusivamente a interseção volumétrica entre os dois sólidos.',
    syntaxExample: 'BooleanIntersection 20mm',
    defaultParams: { widthMm: 20, lengthMm: 20, diameterMm: 20, depthMm: 18 },
  },
  {
    kind: 'rhino-shell',
    command: 'Shell',
    category: 'Booleanos & Casca',
    description: 'Escava sólido fechado mantendo parede estrutural de espessura constante.',
    syntaxExample: 'Shell t=2.5mm',
    defaultParams: { widthMm: 26, lengthMm: 26, diameterMm: 26, depthMm: 18, wallThicknessMm: 2.5 },
  },
  {
    kind: 'rhino-offset-srf',
    command: 'OffsetSrf',
    category: 'Superfícies NURBS',
    description: 'Desloca superfície normal formando sólido paralelo com espessura uniforme.',
    syntaxExample: 'OffsetSrf 3mm',
    defaultParams: { widthMm: 24, lengthMm: 24, diameterMm: 24, depthMm: 6, wallThicknessMm: 3 },
  },
  {
    kind: 'rhino-mirror',
    command: 'Mirror',
    category: 'Matriz & Deformação',
    description: 'Espelha geometria ou subconjunto em torno do plano ortogonal (X, Y ou Z).',
    syntaxExample: 'Mirror X',
    defaultParams: { widthMm: 20, lengthMm: 24, diameterMm: 20, depthMm: 16, axis: 'x' },
  },
  {
    kind: 'rhino-array-polar',
    command: 'ArrayPolar',
    category: 'Matriz & Deformação',
    description: 'Replica elementos em matriz circular uniforme (N cópias em até 360°).',
    syntaxExample: 'ArrayPolar 6 r=18',
    defaultParams: { widthMm: 10, lengthMm: 10, diameterMm: 36, depthMm: 12, radiusMm: 18, count: 6, angleDeg: 360 },
  },
  {
    kind: 'rhino-array-linear',
    command: 'ArrayLinear',
    category: 'Matriz & Deformação',
    description: 'Replica elementos em passo linear uniforme ao longo do eixo ativo.',
    syntaxExample: 'ArrayLinear 4',
    defaultParams: { widthMm: 10, lengthMm: 44, diameterMm: 10, depthMm: 12, count: 4, axis: 'x' },
  },
  {
    kind: 'rhino-bend',
    command: 'Bend',
    category: 'Matriz & Deformação',
    description: 'Curva o sólido ao longo de arco cilíndrico mantendo seção transversal.',
    syntaxExample: 'Bend 35deg',
    defaultParams: { widthMm: 18, lengthMm: 34, diameterMm: 18, depthMm: 14, angleDeg: 35 },
  },
  {
    kind: 'rhino-twist',
    command: 'Twist',
    category: 'Matriz & Deformação',
    description: 'Torce o sólido progressivamente em torno do eixo longitudinal.',
    syntaxExample: 'Twist 45deg',
    defaultParams: { widthMm: 18, lengthMm: 32, diameterMm: 18, depthMm: 22, angleDeg: 45, axis: 'y' },
  },
  {
    kind: 'rhino-taper',
    command: 'Taper',
    category: 'Matriz & Deformação',
    description: 'Afunila progressivamente a seção transversal ao longo da extrusão.',
    syntaxExample: 'Taper 15deg',
    defaultParams: { widthMm: 22, lengthMm: 22, diameterMm: 22, depthMm: 24, angleDeg: 15 },
  },
  {
    kind: 'rhino-flow-along-srf',
    command: 'FlowAlongSrf',
    category: 'Matriz & Deformação',
    description: 'Conforma nervuras ou detalhes sólidos diretamente sobre a superfície NURBS alvo.',
    syntaxExample: 'FlowAlongSrf 28mm',
    defaultParams: { widthMm: 28, lengthMm: 28, diameterMm: 20, depthMm: 10 },
  },
];

export interface ParsedRhinoPromptResult {
  matched: boolean;
  kind?: Extract<MagicPenOperationKind, `rhino-${string}`>;
  rhinoCommand?: string;
  label?: string;
  widthMm?: number;
  lengthMm?: number;
  diameterMm?: number;
  depthMm?: number;
  radiusMm?: number;
  wallThicknessMm?: number;
  angleDeg?: number;
  count?: number;
  axis?: 'x' | 'y' | 'z';
}

function extractLabeledOrFirstNumber(q: string, regex: RegExp, fallback: number, min: number, max: number): number {
  const m = regex.exec(q);
  if (m) {
    const val = parseFloat(m[1]);
    if (Number.isFinite(val)) return Math.max(min, Math.min(max, val));
  }
  return fallback;
}

export function parseRhinoCommandPrompt(rawPrompt: string): ParsedRhinoPromptResult {
  const trimmed = rawPrompt.trim();
  if (!trimmed) return { matched: false };

  const q = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const commandMatchers: Array<{ kind: RhinoCommandCatalogEntry['kind']; rx: RegExp }> = [
    { kind: 'rhino-extrude-crv', rx: /\b(extrudecrv|extrudar|extrude|extrusao)\b/ },
    { kind: 'rhino-revolve', rx: /\b(revolve|revolucao|revolucionar|tornear)\b/ },
    { kind: 'rhino-loft', rx: /\b(loft|transicao entre curvas)\b/ },
    { kind: 'rhino-sweep2', rx: /\b(sweep2|sweep ?2|varredura dupla)\b/ },
    { kind: 'rhino-sweep1', rx: /\b(sweep1|sweep ?1|sweep|varredura)\b/ },
    { kind: 'rhino-pipe', rx: /\b(pipe|tubo|tubular|duto)\b/ },
    { kind: 'rhino-fillet-edge', rx: /\b(filletedge|fillet|arredondar aresta|raio de aresta)\b/ },
    { kind: 'rhino-chamfer-edge', rx: /\b(chamferedge|chanfrar aresta|bisel)\b/ },
    { kind: 'rhino-boolean-union', rx: /\b(booleanunion|uniao booleana|fundir solidos)\b/ },
    { kind: 'rhino-boolean-diff', rx: /\b(booleandifference|booleandiff|diferenca booleana|subtrair solido)\b/ },
    { kind: 'rhino-boolean-intersect', rx: /\b(booleanintersection|booleanintersect|intersecao booleana)\b/ },
    { kind: 'rhino-shell', rx: /\b(shell|casca oca|esvaziar solido|espessura de parede)\b/ },
    { kind: 'rhino-offset-srf', rx: /\b(offsetsrf|offset|deslocamento de superficie)\b/ },
    { kind: 'rhino-mirror', rx: /\b(mirror|espelhar|espelho)\b/ },
    { kind: 'rhino-array-polar', rx: /\b(arraypolar|matriz polar|array circular)\b/ },
    { kind: 'rhino-array-linear', rx: /\b(arraylinear|matriz linear|copia linear)\b/ },
    { kind: 'rhino-bend', rx: /\b(bend|dobrar|curvar solido)\b/ },
    { kind: 'rhino-twist', rx: /\b(twist|torcer|torcao)\b/ },
    { kind: 'rhino-taper', rx: /\b(taper|afunilar|conicidade)\b/ },
    { kind: 'rhino-flow-along-srf', rx: /\b(flowalongsrf|flow|conformar superficie)\b/ },
  ];

  const hit = commandMatchers.find((m) => m.rx.test(q));
  if (!hit) return { matched: false };

  const spec = RHINO_COMMAND_CATALOG.find((c) => c.kind === hit.kind)!;
  const firstNumMatch = /(\d+(?:[.,]\d+)?)/.exec(q.replace(/sweep[12]/g, ''));
  const standaloneNum = firstNumMatch ? parseFloat(firstNumMatch[1].replace(',', '.')) : undefined;

  const axisMatch = /\beixo\s*([xyz])\b|\baxis\s*[:=]?\s*([xyz])\b|\b([xyz])\s*$/i.exec(q);
  const axis = (axisMatch?.[1] || axisMatch?.[2] || axisMatch?.[3] || spec.defaultParams.axis || 'y') as
    | 'x'
    | 'y'
    | 'z';

  const radiusMm = extractLabeledOrFirstNumber(
    q,
    /(?:r|raio|radius)\s*[:=]?\s*(\d+(?:\.\d+)?)/,
    spec.defaultParams.radiusMm ?? (standaloneNum !== undefined ? Math.max(1, Math.min(60, standaloneNum)) : 6),
    0.5,
    80
  );
  const wallThicknessMm = extractLabeledOrFirstNumber(
    q,
    /(?:t|espessura|wall|parede)\s*[:=]?\s*(\d+(?:\.\d+)?)/,
    spec.defaultParams.wallThicknessMm ??
      (standaloneNum !== undefined ? Math.max(0.8, Math.min(20, standaloneNum)) : 2.5),
    0.5,
    30
  );
  const angleDeg = extractLabeledOrFirstNumber(
    q,
    /(\d+(?:\.\d+)?)\s*(?:deg|graus|°)/,
    spec.defaultParams.angleDeg ?? (standaloneNum !== undefined ? Math.max(5, Math.min(360, standaloneNum)) : 45),
    1,
    360
  );
  const count = Math.round(
    extractLabeledOrFirstNumber(
      q,
      /(?:n|copias|copies|qtd|count)\s*[:=]?\s*(\d+)/,
      standaloneNum !== undefined && (hit.kind === 'rhino-array-polar' || hit.kind === 'rhino-array-linear')
        ? Math.max(2, Math.min(24, Math.round(standaloneNum)))
        : (spec.defaultParams.count ?? 4),
      2,
      24
    )
  );

  const depthMm = extractLabeledOrFirstNumber(
    q,
    /(?:h|altura|depth|profundidade)\s*[:=]?\s*(\d+(?:\.\d+)?)/,
    standaloneNum !== undefined && (hit.kind === 'rhino-extrude-crv' || hit.kind === 'rhino-loft')
      ? Math.max(2, Math.min(120, standaloneNum))
      : spec.defaultParams.depthMm,
    1,
    160
  );
  const widthMm = extractLabeledOrFirstNumber(
    q,
    /(?:w|largura|width)\s*[:=]?\s*(\d+(?:\.\d+)?)/,
    hit.kind === 'rhino-fillet-edge' || hit.kind === 'rhino-chamfer-edge'
      ? Math.max(2, radiusMm * 2)
      : spec.defaultParams.widthMm,
    2,
    160
  );
  const lengthMm = extractLabeledOrFirstNumber(
    q,
    /(?:l|comprimento|length)\s*[:=]?\s*(\d+(?:\.\d+)?)/,
    spec.defaultParams.lengthMm,
    4,
    220
  );
  const diameterMm = Math.max(4, radiusMm * 2);

  const label = `Rhino ${spec.command} (${
    hit.kind === 'rhino-array-polar' || hit.kind === 'rhino-array-linear'
      ? `${count}×`
      : hit.kind === 'rhino-bend' || hit.kind === 'rhino-twist' || hit.kind === 'rhino-taper' || hit.kind === 'rhino-revolve'
        ? `${angleDeg}°`
        : hit.kind === 'rhino-shell' || hit.kind === 'rhino-offset-srf'
          ? `t=${wallThicknessMm}mm`
          : hit.kind === 'rhino-fillet-edge' || hit.kind === 'rhino-chamfer-edge' || hit.kind === 'rhino-pipe'
            ? `r=${radiusMm}mm`
            : hit.kind === 'rhino-mirror'
              ? `Eixo ${axis.toUpperCase()}`
              : `${depthMm}mm`
  })`;

  return {
    matched: true,
    kind: hit.kind,
    rhinoCommand: spec.command,
    label,
    widthMm,
    lengthMm,
    diameterMm,
    depthMm,
    radiusMm,
    wallThicknessMm,
    angleDeg,
    count,
    axis,
  };
}

class ObjMeshBuilder {
  private verts: [number, number, number][] = [];
  private lines: string[] = [];

  beginObject(name: string): void {
    this.lines.push(`o ${name}`);
  }

  private addVertex(x: number, y: number, z: number): number {
    this.verts.push([x, y, z]);
    this.lines.push(`v ${x.toFixed(3)} ${y.toFixed(3)} ${z.toFixed(3)}`);
    return this.verts.length;
  }

  addLatheSegment(
    axis: 'y' | 'x',
    cx: number,
    cy: number,
    cz: number,
    profile: Array<[number, number]>,
    radialSegs = 24
  ): void {
    const ringCount = profile.length;
    const baseIdx = this.verts.length + 1;

    for (let s = 0; s < radialSegs; s++) {
      const a = (s / radialSegs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (const [posAlong, rad] of profile) {
        if (axis === 'y') {
          this.addVertex(cx + ca * rad, cy + posAlong, cz + sa * rad);
        } else {
          this.addVertex(cx + posAlong, cy + ca * rad, cz + sa * rad);
        }
      }
    }

    for (let s = 0; s < radialSegs; s++) {
      const nextS = (s + 1) % radialSegs;
      for (let r = 0; r < ringCount - 1; r++) {
        const i00 = baseIdx + s * ringCount + r;
        const i01 = baseIdx + s * ringCount + r + 1;
        const i10 = baseIdx + nextS * ringCount + r;
        const i11 = baseIdx + nextS * ringCount + r + 1;
        this.lines.push(`f ${i00} ${i10} ${i11} ${i01}`);
      }
    }

    const botCapIdx = this.addVertex(
      axis === 'y' ? cx : cx + profile[0][0],
      axis === 'y' ? cy + profile[0][0] : cy,
      cz
    );
    const topCapIdx = this.addVertex(
      axis === 'y' ? cx : cx + profile[ringCount - 1][0],
      axis === 'y' ? cy + profile[ringCount - 1][0] : cy,
      cz
    );

    for (let s = 0; s < radialSegs; s++) {
      const nextS = (s + 1) % radialSegs;
      const b0 = baseIdx + s * ringCount;
      const b1 = baseIdx + nextS * ringCount;
      this.lines.push(`f ${botCapIdx} ${b1} ${b0}`);

      const t0 = baseIdx + s * ringCount + ringCount - 1;
      const t1 = baseIdx + nextS * ringCount + ringCount - 1;
      this.lines.push(`f ${topCapIdx} ${t0} ${t1}`);
    }
  }

  addChamferedPlate(
    cx: number,
    cy: number,
    cz: number,
    sx: number,
    sy: number,
    sz: number,
    bevelMm = 2.4
  ): void {
    const hx = Math.max(2, sx / 2);
    const hy = Math.max(1.5, sy / 2);
    const hz = Math.max(2, sz / 2);
    const b = Math.min(bevelMm, hx * 0.25, hy * 0.35, hz * 0.25);

    const ringBot: [number, number][] = [
      [-hx + b, -hz],
      [hx - b, -hz],
      [hx, -hz + b],
      [hx, hz - b],
      [hx - b, hz],
      [-hx + b, hz],
      [-hx, hz - b],
      [-hx, -hz + b],
    ];
    const ringMidBot = ringBot;
    const ringMidTop = ringBot;
    const ringTop: [number, number][] = ringBot.map(([x, z]) => [x * 0.96, z * 0.96]);

    const rings: Array<{ y: number; pts: [number, number][] }> = [
      { y: cy - hy, pts: ringTop },
      { y: cy - hy + b * 0.7, pts: ringMidBot },
      { y: cy + hy - b * 0.7, pts: ringMidTop },
      { y: cy + hy, pts: ringTop },
    ];

    const n = ringBot.length;
    const baseIdx = this.verts.length + 1;
    for (const rg of rings) {
      for (const [px, pz] of rg.pts) {
        this.addVertex(cx + px, rg.y, cz + pz);
      }
    }

    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < n; i++) {
        const ni = (i + 1) % n;
        const a = baseIdx + r * n + i;
        const bIdx = baseIdx + r * n + ni;
        const c = baseIdx + (r + 1) * n + ni;
        const d = baseIdx + (r + 1) * n + i;
        this.lines.push(`f ${a} ${bIdx} ${c} ${d}`);
      }
    }

    const botCenter = this.addVertex(cx, cy - hy, cz);
    const topCenter = this.addVertex(cx, cy + hy, cz);
    for (let i = 0; i < n; i++) {
      const ni = (i + 1) % n;
      this.lines.push(`f ${botCenter} ${baseIdx + ni} ${baseIdx + i}`);
      const tOff = baseIdx + (rings.length - 1) * n;
      this.lines.push(`f ${topCenter} ${tOff + i} ${tOff + ni}`);
    }
  }

  toObjString(): string {
    return this.lines.join('\n');
  }
}

/**
 * Generates high-precision Rhinoceros-grade B-Rep tessellated OBJ for the RockShox BoXXer DH Dual-Crown Fork.
 * Eliminates all flat-box/Lego geometry and coplanar Z-fighting slabs.
 */
export function buildRhinoRockShoxForkObj(): string {
  const b = new ObjMeshBuilder();

  b.beginObject('Canela_Esquerda_Lower_Leg_L');
  b.addLatheSegment('y', -55, 0, 0, [
    [0, 14],
    [8, 17],
    [22, 18.5],
    [85, 20.5],
    [114, 21.8],
    [122, 22.8],
    [124, 20.5],
  ], 24);
  b.addChamferedPlate(-27.5, 114, -3, 28, 12, 14, 2.2);

  b.beginObject('Canela_Direita_Lower_Leg_R');
  b.addLatheSegment('y', 55, 0, 0, [
    [0, 14],
    [8, 17],
    [22, 18.5],
    [85, 20.5],
    [114, 21.8],
    [122, 22.8],
    [124, 20.5],
  ], 24);
  b.addChamferedPlate(27.5, 114, -3, 28, 12, 14, 2.2);

  b.beginObject('Coroa_Inferior_CNC');
  b.addChamferedPlate(0, 134, -3, 66, 15, 34, 3.2);
  b.addLatheSegment('y', -55, 126, 0, [
    [0, 19.5],
    [16, 19.5],
  ], 24);
  b.addLatheSegment('y', 55, 126, 0, [
    [0, 19.5],
    [16, 19.5],
  ], 24);
  b.addLatheSegment('y', 0, 126, -15, [
    [0, 14.3],
    [89, 14.3],
  ], 24);

  b.beginObject('Bengala_Superior_L');
  b.addLatheSegment('y', -55, 142.5, 0, [
    [0, 17.5],
    [72, 17.5],
    [73.5, 17.5],
    [86, 17.5],
    [87, 15.8],
    [94, 15.8],
  ], 28);

  b.beginObject('Bengala_Superior_R');
  b.addLatheSegment('y', 55, 142.5, 0, [
    [0, 17.5],
    [72, 17.5],
    [73.5, 17.5],
    [86, 17.5],
    [87, 15.8],
    [94, 15.8],
  ], 28);

  b.beginObject('Coroa_Superior_Forged');
  b.addChamferedPlate(0, 222, -3, 68, 13, 32, 2.8);
  b.addLatheSegment('y', -55, 215.5, 0, [
    [0, 19.5],
    [13, 19.5],
  ], 24);
  b.addLatheSegment('y', 55, 215.5, 0, [
    [0, 19.5],
    [13, 19.5],
  ], 24);
  b.addLatheSegment('y', 0, 228.5, -15, [
    [0, 14.3],
    [22, 14.3],
  ], 24);

  b.beginObject('Eixo_Passante_Maxle_20x110');
  b.addLatheSegment('x', -78, 15, 0, [
    [0, 12.5],
    [7, 12.5],
    [8, 10.0],
    [148, 10.0],
    [149, 12.0],
    [156, 12.0],
  ], 24);

  return b.toObjString();
}

/**
 * Generates high-precision Rhinoceros-grade B-Rep tessellated OBJ for the Frostbite 1MW 800VDC vs Nvidia Rack.
 */
export function buildRhinoFrostbiteRackObj(): string {
  const b = new ObjMeshBuilder();

  b.beginObject('Barramento_Principal_800VDC_Busbar');
  b.addChamferedPlate(0, 7, 0, 176, 14, 110, 3.0);
  b.addLatheSegment('x', -80, 15, -38, [
    [0, 4.5],
    [160, 4.5],
  ], 18);
  b.addLatheSegment('x', -80, 15, 38, [
    [0, 4.5],
    [160, 4.5],
  ], 18);

  b.beginObject('Rack_Nvidia_1MW_Baseline');
  b.addChamferedPlate(-47, 83, 0, 70, 136, 94, 4.0);
  b.addLatheSegment('y', -72, 16, 42, [
    [0, 5.5],
    [132, 5.5],
  ], 18);

  b.beginObject('Rack_FrostbiteEngine_7nm_CMOS_Tiles');
  b.addChamferedPlate(47, 83, 0, 70, 136, 94, 4.0);
  b.addLatheSegment('y', 22, 16, 42, [
    [0, 6.2],
    [132, 6.2],
  ], 18);
  b.addLatheSegment('y', 72, 16, 42, [
    [0, 6.2],
    [132, 6.2],
  ], 18);

  b.beginObject('Trocador_Calor_HVAC_800VDC_Coolant');
  b.addChamferedPlate(0, 165, 0, 136, 26, 78, 3.5);
  b.addLatheSegment('x', -62, 181, 0, [
    [0, 8.5],
    [124, 8.5],
  ], 20);

  return b.toObjString();
}
