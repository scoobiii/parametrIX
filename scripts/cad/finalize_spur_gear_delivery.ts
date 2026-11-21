import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sha256Hex, createFormalVucCertificate, verifyFormalVucCertificate } from '../../src/server/vucFormalProof';
import type { SpurGearSpec } from '../../src/kernel/spurGear';

/**
 * Fecha a entrega CAD:
 * 1. Emite certificado VUC Ed25519 sobre as entradas (spec + kernel) e saídas (STEP/STL/DXF/PNG/medições).
 * 2. Gera o relatório técnico em Markdown com números medidos (sem valores inventados).
 * 3. Gera um manifesto SHA-256 de todos os arquivos entregues.
 */
const startedAt = Date.now();
const root = process.cwd();
const outDir = path.join(root, 'deliverables', 'engrenagem_m2_z24');
const proofDir = path.join(root, 'proof');
fs.mkdirSync(proofDir, { recursive: true });

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function br(value: number, digits: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

interface MetricsFile {
  metrics: {
    moduleMm: number;
    teeth: number;
    pressureAngleDeg: number;
    pitchDiameterMm: number;
    baseDiameterMm: number;
    tipDiameterMm: number;
    rootDiameterMm: number;
    circularPitchMm: number;
    toothThicknessAtPitchMm: number;
    tipToothThicknessMm: number;
    faceWidthMm: number;
    boreDiameterMm: number;
    lighteningHoleCount: number;
    lighteningHoleDiameterMm: number;
    lighteningHolePitchRadiusMm: number;
    faceAreaMm2: number;
    volumeMm3: number;
    massKg: number;
    surfaceAreaMm2: number;
    densityKgM3: number;
  };
  spec: SpurGearSpec;
}

interface ValidationFile {
  status: string;
  partName: string;
  modelCode: string;
  standardReferences: string[];
  measurements: Record<string, number>;
  checks: {
    name: string;
    measured: number;
    expected: number;
    tolerance: number;
    toleranceKind: string;
    deviation: number;
    pass: boolean;
  }[];
  artifacts: Record<string, { file: string; bytes: number; sha256: string }>;
}

interface FreeCadMetricsFile {
  source: string;
  solidCount: number;
  shellCount: number;
  faceCount: number;
  edgeCount: number;
  isValid: boolean;
  volumeMm3: number;
  surfaceAreaMm2: number;
  massKg7075T6: number;
  boundingBox: { min: number[]; max: number[]; size: number[] };
  centerOfMassMm: number[];
}

const profilePath = path.join(outDir, 'profile.json');
const kernelMetricsPath = path.join(outDir, 'engrenagem_m2_z24_metricas_kernel.json');
const freecadMetricsPath = path.join(outDir, 'engrenagem_m2_z24_metricas_freecad.json');
const validationPath = path.join(outDir, 'engrenagem_m2_z24_validacao.json');
const stepPath = path.join(outDir, 'engrenagem_m2_z24.step');
const stlPath = path.join(outDir, 'engrenagem_m2_z24.stl');
const dxfPath = path.join(outDir, 'engrenagem_m2_z24.dxf');
const pngPath = path.join(outDir, 'engrenagem_m2_z24_4vistas.png');
const isoPath = path.join(outDir, 'engrenagem_m2_z24_iso.png');
const kernelSourcePath = path.join(root, 'src', 'kernel', 'spurGear.ts');

const kernelMetrics = readJson<MetricsFile>(kernelMetricsPath);
const freecadMetrics = readJson<FreeCadMetricsFile>(freecadMetricsPath);
const validation = readJson<ValidationFile>(validationPath);
const profileRaw = fs.readFileSync(profilePath);

const artifactPaths = {
  profile: profilePath,
  step: stepPath,
  stl: stlPath,
  dxf: dxfPath,
  png: pngPath,
  iso: isoPath,
  kernelMetrics: kernelMetricsPath,
  freecadMetrics: freecadMetricsPath,
  validation: validationPath,
} as const;

const artifacts: Record<string, { file: string; bytes: number; sha256: string }> = {};
for (const [key, artifactPath] of Object.entries(artifactPaths)) {
  const buffer = fs.readFileSync(artifactPath);
  artifacts[key] = {
    file: path.basename(artifactPath),
    bytes: buffer.length,
    sha256: sha256Hex(buffer),
  };
}

const inputPayload = {
  domain: 'CAD_PART_DELIVERY_VUC',
  partName: validation.partName,
  modelCode: validation.modelCode,
  standards: validation.standardReferences,
  spec: kernelMetrics.spec,
  kernelSourceSha256: sha256Hex(fs.readFileSync(kernelSourcePath)),
  profileJsonSha256: sha256Hex(profileRaw),
  solidModelingChain: 'TypeScript kernel -> profile.json -> FreeCAD/OpenCASCADE STEP -> STL',
};

const outputPayload = {
  status: validation.status,
  measurements: {
    volumeMm3: validation.measurements.stepVolumeMm3,
    surfaceAreaMm2: validation.measurements.stepSurfaceAreaMm2,
    stlVolumeMm3: validation.measurements.stlVolumeMm3,
    thicknessMm: validation.measurements.stepThicknessMm,
    maxRadiusMm: validation.measurements.stepMaxRadiusMm,
    solidCount: validation.measurements.stepSolidCount,
    faceCount: validation.measurements.stepFaceCount,
    stlTriangleCount: validation.measurements.stlTriangleCount,
    massKg: freecadMetrics.massKg7075T6,
  },
  artifacts,
};

if (validation.status !== 'PASS') {
  throw new Error(`Validação CAD não passou: ${validation.status}`);
}

const certificate = createFormalVucCertificate({
  domain: 'CAD_PART_DELIVERY_VUC',
  status: 'PASS',
  inputPayload,
  outputPayload,
  durationMs: Math.max(1, Date.now() - startedAt),
  runner: 'local-sandbox-cad-pipeline',
});

const verification = verifyFormalVucCertificate(certificate, inputPayload, outputPayload);
if (!verification.valid) {
  throw new Error(`Certificado VUC inválido: ${verification.reason}`);
}

const proofPayload = {
  certificate,
  verify: verification,
  inputPayload,
  outputPayload,
  inputHashSummary: {
    kernelSourceSha256: inputPayload.kernelSourceSha256,
    profileJsonSha256: inputPayload.profileJsonSha256,
  },
  artifacts,
  notes:
    'Assinatura Ed25519 sobre SHA-256(entrada):SHA-256(saída):SHA-256(processo). Chave privada efêmera gerada no processo; a chave pública vai no certificado.',
};
const proofPath = path.join(proofDir, 'vuc-engrenagem-m2-z24.json');
fs.writeFileSync(proofPath, `${JSON.stringify(proofPayload, null, 2)}\n`, 'utf8');
fs.writeFileSync(
  path.join(outDir, 'vuc_proof.json'),
  `${JSON.stringify(proofPayload, null, 2)}\n`,
  'utf8'
);

const m = kernelMetrics.metrics;
const checksTable = validation.checks
  .map(
    (check) =>
      `| ${check.pass ? '✅' : '❌'} | ${check.name} | ${br(check.measured, 6)} | ${br(
        check.expected,
        6
      )} | ${check.deviation.toExponential(2)} |`
  )
  .join('\n');

const artifactsTable = Object.entries(artifacts)
  .map(
    ([key, info]) =>
      `| \`${info.file}\` | ${info.bytes.toLocaleString('pt-BR')} | \`${info.sha256}\` |`
  )
  .join('\n');

const report = `# Relatório técnico — Engrenagem Cilíndrica Reta M2 Z24

**Peça:** ${validation.partName}  
**Código:** ${validation.modelCode}  
**Data:** ${new Date().toISOString()}  
**Repositório:** \`scoobiii/parametrIX\`  
**Status da validação:** **${validation.status}**  
**Certificado VUC:** \`${certificate.vuc_id}\`

---

## 1. Especificação geométrica (derivada, não estimada)

| Parâmetro | Símbolo | Valor |
| :--- | :---: | ---: |
| Módulo | m | ${br(m.moduleMm, 3)} mm |
| Número de dentes | z | ${m.teeth} |
| Ângulo de pressão | α | ${br(m.pressureAngleDeg, 3)}° |
| Diâmetro primitivo | d = m·z | ${br(m.pitchDiameterMm, 3)} mm |
| Diâmetro externo | da = m·(z+2) | ${br(m.tipDiameterMm, 3)} mm |
| Diâmetro de raiz | df = m·(z−2,5) | ${br(m.rootDiameterMm, 3)} mm |
| Diâmetro de base | db = d·cos α | ${br(m.baseDiameterMm, 3)} mm |
| Passo circular | p = π·m | ${br(m.circularPitchMm, 4)} mm |
| Espessura no primitivo | s = p/2 | ${br(m.toothThicknessAtPitchMm, 4)} mm |
| Espessura no topo | sa | ${br(m.tipToothThicknessMm, 4)} mm |
| Largura de face | b | ${br(m.faceWidthMm, 3)} mm |
| Furo central | Ø | ${br(m.boreDiameterMm, 3)} mm (H7) |
| Alívios | — | ${m.lighteningHoleCount} × Ø${br(m.lighteningHoleDiameterMm, 3)} mm |
| PCD dos alívios | — | ${br(m.lighteningHolePitchRadiusMm * 2, 3)} mm |
| Área da seção | A | ${br(m.faceAreaMm2, 3)} mm² |
| Volume (B-Rep) | V | ${br(validation.measurements.stepVolumeMm3 / 1000, 4)} cm³ |
| Massa (7075-T6, 2,81 g/cm³) | m | ${br(freecadMetrics.massKg7075T6 * 1000, 2)} g |

Referências normativas usadas apenas para as fórmulas: **ISO 53:1998** (perfil de referência) e **ISO 21771:2007** (geometria). Tolerâncias gerais indicadas como **ISO 2768-mK**; não há certificado dimensional de inspeção.

---

## 2. Método de construção

1. **Kernel paramétrico** (\`src/kernel/spurGear.ts\`): gera flancos de evolvente, arco de topo, arco de raiz, furo central e alívios. A malha é fechada e triangulada com o \`ShapeUtils\` do Three.js; o volume é medido por divergência.
2. **Perfil 2D** (\`profile.json\`): contorno de ${profileRaw.length.toLocaleString('pt-BR')} bytes compartilhado entre o kernel e o FreeCAD, garantindo que STEP e malha venham da mesma geometria.
3. **STEP B-Rep** (FreeCAD 0.20.2 / OpenCASCADE 7.6): face planar com furos, extrusão de ${br(m.faceWidthMm, 3)} mm, validação de sólido único, exportação STEP AP214.
4. **STL binário**: tesselação do B-Rep exportada pelo FreeCAD; volume fechado recalculado de forma independente.
5. **4 vistas**: projeções ortográficas e isométrica calculadas a partir dos triângulos do STL (frontal XY, superior XZ, lateral YZ e isométrica).

---

## 3. Verificação tridimensional (medida)

| OK | Verificação | Medido | Esperado | Desvio |
| :---: | :--- | ---: | ---: | ---: |
${checksTable}

- Volume do kernel: **${br(validation.measurements.kernelVolumeMm3, 6)} mm³**
- Volume do STEP: **${br(validation.measurements.stepVolumeMm3, 6)} mm³**
- Volume do STL: **${br(validation.measurements.stlVolumeMm3, 6)} mm³**
- Sólidos no STEP: **${validation.measurements.stepSolidCount}** · faces: **${validation.measurements.stepFaceCount}** · arestas: **${validation.measurements.stepEdgeCount}**
- Caixa do STEP: ${br(freecadMetrics.boundingBox.size[0], 6)} × ${br(freecadMetrics.boundingBox.size[1], 6)} × ${br(freecadMetrics.boundingBox.size[2], 6)} mm
- Centro de massa: (${br(freecadMetrics.centerOfMassMm[0], 6)}, ${br(freecadMetrics.centerOfMassMm[1], 6)}, ${br(freecadMetrics.centerOfMassMm[2], 6)}) mm

> O diâmetro externo geométrico é 52,000 mm (raio de topo 26,000 mm, verificado nos vértices do STEP).
> A caixa alinhada aos eixos mede 51,999212 mm em X/Y porque o arco de topo é amostrado e nenhum
> vértice cai exatamente sobre o eixo X; isso é uma característica da discretização do perfil, não uma
> dimensão de projeto diferente.

---

## 4. Artefatos entregues (SHA-256)

| Arquivo | Bytes | SHA-256 |
| :--- | ---: | :--- |
${artifactsTable}

O \`manifest.json\` inclui também o hash deste relatório e do certificado VUC.

---

## 5. Prova VUC (Ed25519 + SHA-256)

- \`vuc_id\`: **${certificate.vuc_id}**
- \`hash_input\`: \`${certificate.hash_input}\`
- \`hash_output\`: \`${certificate.hash_output}\`
- \`hash_processo\`: \`${certificate.hash_processo}\`
- \`commit\`: \`${certificate.commit}\`
- \`runner\`: \`${certificate.runner}\`
- \`duracao_ms\`: ${certificate.duracao_ms}
- Verificação da assinatura: **${verification.valid ? 'VÁLIDA' : 'INVÁLIDA'}** — ${verification.reason}

A chave privada Ed25519 é efêmera (gerada no processo) e a chave pública acompanha o certificado em
\`vuc_proof.json\`, permitindo verificar que os hashes de entrada/saída não foram alterados.

---

## 6. Limitações declaradas (engenharia, não marketing)

- A raiz é modelada com arco de raiz e transição radial, **sem filete trocoidal**; para produção seriada recomenda-se aplicar o filete de raiz conforme ISO 53 e recalcular a tensão.
- Não há **coroamento de flanco**, **backlash** definido nem tratamento térmico/superficial especificado; a espessura no primitivo é teórica (s = p/2).
- O STEP contém **${validation.measurements.stepFaceCount} faces planas** resultantes da discretização do perfil, adequado para CAM/inspeção, mas não é um modelo B-Rep com flancos em spline.
- A massa usa densidade nominal de 2.810 kg/m³ para 7075-T6; a massa real depende do certificado do lote de material.
- As 4 vistas são projeções de referência, **não substituem** um desenho normatizado ASME Y14.5 / ISO 129 com GD&T.
- O STEP carrega o timestamp do exportador no cabeçalho; a reprodutibilidade é verificada por volume/área/raio (e não por hash byte a byte do arquivo).
- Não foi executado ensaio mecânico nem medição em CMM; a validação é geométrica e documental.

---

## 7. Reprodução

\`\`\`bash
cd parametrIX
npm ci
npx tsx scripts/cad/export_spur_gear_geometry.ts
QT_QPA_PLATFORM=offscreen freecadcmd scripts/cad/build_spur_gear_step.py
MPLCONFIGDIR=.cache/matplotlib python3 scripts/cad/render_spur_gear_views.py
QT_QPA_PLATFORM=offscreen MPLCONFIGDIR=.cache/matplotlib freecadcmd scripts/cad/verify_spur_gear_delivery.py
npx tsx scripts/cad/finalize_spur_gear_delivery.ts
\`\`\`

No Parametrix CAD Studio, a peça está disponível no preset **“Engrenagem Cilíndrica M2 Z24 (ISO 53 · 7075-T6)”**, que carrega a malha paramétrica, o perfil de engenharia, o CAM 3-eixos e o FEA configurados.
`;

const reportPath = path.join(outDir, 'relatorio_tecnico.md');
fs.writeFileSync(reportPath, report, 'utf8');

const manifestFiles = [
  ...Object.values(artifacts).map((info) => ({ file: info.file, bytes: info.bytes, sha256: info.sha256 })),
  {
    file: path.basename(reportPath),
    bytes: fs.readFileSync(reportPath).length,
    sha256: sha256Hex(fs.readFileSync(reportPath)),
  },
  {
    file: 'vuc_proof.json',
    bytes: fs.readFileSync(path.join(outDir, 'vuc_proof.json')).length,
    sha256: sha256Hex(fs.readFileSync(path.join(outDir, 'vuc_proof.json'))),
  },
];

const manifest = {
  generatedAt: new Date().toISOString(),
  partName: validation.partName,
  modelCode: validation.modelCode,
  status: validation.status,
  vucId: certificate.vuc_id,
  files: manifestFiles,
};
fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
);

console.log(`RELATORIO=${reportPath}`);
console.log(`PROVA=${proofPath}`);
console.log(`VUC_ID=${certificate.vuc_id}`);
console.log(`HASH_INPUT=${certificate.hash_input}`);
console.log(`HASH_OUTPUT=${certificate.hash_output}`);
console.log(`HASH_PROCESSO=${certificate.hash_processo}`);
console.log(`VERIFIED=${verification.valid}`);
console.log(`STATUS=${validation.status}`);
