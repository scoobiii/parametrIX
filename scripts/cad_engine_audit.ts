import zlib from 'zlib';
import * as CFB from 'cfb';
import {
  buildIsolatedEvaluatedMesh,
  exportAsciiDXF,
  exportBinarySTL,
  exportOpenNurbs3DM,
  parse3DM,
  parseDXF,
  parseOBJ,
  parseSTEPorIFC,
  parseSTL,
  parseSVGToCad,
  SAMPLE_CAD_FILES,
} from '../src/kernel/cadFormats';
import { WORKSPACE_PROJECT_PRESETS } from '../src/kernel/workspacePresets';
import { buildNurbsSurfaceFromParams, tessellateNurbsSurface } from '../src/kernel/nurbs';
import { evaluateStructuralFea } from '../src/kernel/structuralFea';
import { analyzeCurvatureAndOptimizeWeight } from '../src/kernel/curvatureOptimizer';
import { evaluateLayerToleranceCompliance, inferDefaultLayerSpecs } from '../src/kernel/layerTolerances';
import { computeScoobiiiVucProof } from '../src/kernel/scoobiiiVuc';
import { resolvePartEngineeringProfile } from '../src/kernel/componentClassifier';
import { calculateCarbonFootprint } from '../src/kernel/carbonFootprint';
import { CAM_TOOLS, generateCamToolpath } from '../src/kernel/camRobotics';
import { buildCadLlmBriefing, parseIptWithOle2, parseStepWithOcct } from '../serverCadParser';
import type { ParametricDesignParams } from '../src/types/cad';

interface TestResult {
  name: string;
  passed: boolean;
  detail: string;
}

const results: TestResult[] = [];
function check(name: string, cond: boolean, detail: string) {
  results.push({ name, passed: cond, detail });
  const badge = cond ? 'PASS' : 'FAIL';
  console.log(`[${badge}] ${name}: ${detail}`);
}

function measurePositionsBounds(pos: Float32Array | number[]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i + 2 < pos.length; i += 3) {
    if (pos[i] < minX) minX = pos[i];
    if (pos[i + 1] < minY) minY = pos[i + 1];
    if (pos[i + 2] < minZ) minZ = pos[i + 2];
    if (pos[i] > maxX) maxX = pos[i];
    if (pos[i + 1] > maxY) maxY = pos[i + 1];
    if (pos[i + 2] > maxZ) maxZ = pos[i + 2];
  }
  return { minX, minY, minZ, maxX, maxY, maxZ, sx: maxX - minX, sy: maxY - minY, sz: maxZ - minZ };
}

async function runAudit() {
  console.log('=== AUDITORIA EXPERIMENTAL DO MOTOR CAD / CAE / CAM ===\n');

  // 1. DXF Flange (matches user screenshot bug: 0 tri + flat white rectangle box)
  const dxfSample = SAMPLE_CAD_FILES[0];
  const dxfModel = parseDXF(dxfSample.content, dxfSample.filename);
  check(
    'DXF: Triângulos gerados em Flange 2D (CIRCLE + LWPOLYLINE)',
    dxfModel.triangleCount > 0 && dxfModel.positions.length > 0,
    `triangleCount=${dxfModel.triangleCount}, components=${dxfModel.components?.length}, wires=${(dxfModel.wireSegments?.length ?? 0) / 6}`
  );
  check(
    'DXF: Componentes não viram caixas retangulares AABB genéricas de 12 triângulos',
    (dxfModel.components ?? []).every((c) => c.triangleCount !== 12 && c.triangleCount > 0),
    `triCounts por peça=[${(dxfModel.components ?? []).map((c) => `${c.name}:${c.triangleCount}`).join(', ')}]`
  );

  // 2. DXF Complex entities (ARC, POLYLINE/VERTEX/SEQEND, SPLINE, multi-layer 3DFACE)
  const complexDxf = [
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'ARC', '8', 'ARCO_COROA', '10', '0', '20', '0', '30', '0', '40', '45', '50', '0', '51', '180',
    '0', 'POLYLINE', '8', 'CONTORNO_R12', '70', '1',
    '0', 'VERTEX', '8', 'CONTORNO_R12', '10', '-80', '20', '-20', '30', '0',
    '0', 'VERTEX', '8', 'CONTORNO_R12', '10', '80', '20', '-20', '30', '0',
    '0', 'VERTEX', '8', 'CONTORNO_R12', '10', '80', '20', '20', '30', '0',
    '0', 'VERTEX', '8', 'CONTORNO_R12', '10', '-80', '20', '20', '30', '0',
    '0', 'SEQEND',
    '0', '3DFACE', '8', 'CAMADA_FACE_A', '10', '0', '20', '0', '30', '5', '11', '20', '21', '0', '31', '5', '12', '20', '22', '20', '32', '5', '13', '0', '23', '20', '33', '5',
    '0', '3DFACE', '8', 'CAMADA_FACE_B', '10', '30', '20', '0', '30', '5', '11', '50', '21', '0', '31', '5', '12', '50', '22', '20', '32', '5', '13', '30', '23', '20', '33', '5',
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n');
  const complexDxfRes = parseDXF(complexDxf, 'coroa_complexa.dxf');
  check(
    'DXF: Suporte a ARC + POLYLINE/VERTEX + multi-camadas 3DFACE',
    (complexDxfRes.wireSegments?.length ?? 0) > 60 &&
      (complexDxfRes.components?.find((c) => c.sourceLayer === 'CAMADA_FACE_B')?.triangleCount ?? 0) === 2,
    `wires=${(complexDxfRes.wireSegments?.length ?? 0) / 6} segs, CAMADA_FACE_B tris=${
      complexDxfRes.components?.find((c) => c.sourceLayer === 'CAMADA_FACE_B')?.triangleCount ?? 'missing'
    }`
  );

  // 3. OpenNURBS 3DM Round-trip
  const baseParams: ParametricDesignParams = {
    preset: 'shell',
    spanX: 200,
    spanY: 140,
    archHeight: 50,
    waveAmplitude: 12,
    twistDeg: 15,
    thicknessMm: 6,
    uDivisions: 24,
    vDivisions: 24,
    ribCountU: 4,
    ribCountV: 3,
    ribHeightMm: 14,
    attractorStrength: 0,
  };
  const surf = buildNurbsSurfaceFromParams(baseParams);
  const mesh = tessellateNurbsSurface(surf, baseParams.ribCountU, baseParams.ribCountV, baseParams.ribHeightMm);
  const blob3dm = exportOpenNurbs3DM(surf, mesh);
  const parsed3dm = parse3DM(await blob3dm.arrayBuffer(), 'teste_roundtrip.3dm');
  const firstWireX = parsed3dm.wireSegments?.[0] ?? NaN;
  const expectedCp0X = surf.controlPoints[0][0].x;
  check(
    '3DM Round-trip: Chunk NURBS (0x20000002) alinha offset de 16 bytes (sem ler grau como coordenada)',
    Math.abs(firstWireX - expectedCp0X) < 1e-2,
    `firstWireX=${firstWireX.toFixed(3)}, expectedCp0X=${expectedCp0X.toFixed(3)}, tris=${parsed3dm.triangleCount}`
  );

  // 4. ASCII STL > 256-byte header
  const longHeaderAsciiStl = `solid ${'X'.repeat(300)}\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 50 0 0\nvertex 0 50 0\nendloop\nendfacet\nendsolid test\n`;
  const parsedStl = parseSTL(new TextEncoder().encode(longHeaderAsciiStl).buffer, 'cabecalho_longo.stl');
  check(
    'STL ASCII: Detecta "facet" mesmo se nome do solid > 256 bytes',
    parsedStl.triangleCount === 1 && Number.isFinite(parsedStl.boundingBox.size[0]) && parsedStl.boundingBox.size[0] === 50,
    `triangleCount=${parsedStl.triangleCount}, bboxX=${parsedStl.boundingBox.size[0]}`
  );

  // 5. Binary STL round-trip
  const blobStl = exportBinarySTL(mesh, 'casca_nurbs');
  const parsedBinStl = parseSTL(await blobStl.arrayBuffer(), 'roundtrip.stl');
  check(
    'STL Binário Round-trip: Contagem de triângulos e dimensões preservadas',
    parsedBinStl.triangleCount === mesh.triangleCount &&
      Math.abs(parsedBinStl.boundingBox.size[0] - mesh.boundingBox.size[0]) < 0.1,
    `exported=${mesh.triangleCount}, reimported=${parsedBinStl.triangleCount}`
  );

  // 6. Export Isolation bug
  const multiObjModel = WORKSPACE_PROJECT_PRESETS[0].buildImportedModel!();
  const exportedImportedAll = buildIsolatedEvaluatedMesh(mesh, 'all', multiObjModel);
  const isolatedPart = buildIsolatedEvaluatedMesh(mesh, multiObjModel.components![1].id, multiObjModel);
  check(
    'Exportação de Conjunto Importado: isolationTarget="all" exporta importedModel e parte isolada usa bbox própria',
    exportedImportedAll.evaluated.triangleCount === multiObjModel.triangleCount &&
      Math.abs(isolatedPart.evaluated.boundingBox.size[0] - multiObjModel.components![1].size[0]) < 0.1,
    `objTris=${multiObjModel.triangleCount}, exportedTris=${exportedImportedAll.evaluated.triangleCount}, isoPartBboxX=${isolatedPart.evaluated.boundingBox.size[0].toFixed(1)}`
  );

  // 7. STEP Explicit SI_UNIT(.MILLI.,.METRE.) on <6mm part + comments/semicolon + IFC IFCPOLYLOOP
  const smallStepMm = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('M4 Precision Spacer; rev2'),'2;1');",
    'ENDSEC;',
    'DATA;',
    '/* unit decl; test */',
    "#1=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));",
    "#10=CARTESIAN_POINT('P1',(-2.0,-2.0,0.0));",
    "#11=CARTESIAN_POINT('P2',(2.0,-2.0,0.0));",
    "#12=CARTESIAN_POINT('P3',(2.0,2.0,0.0));",
    "#13=CARTESIAN_POINT('P4',(-2.0,2.0,0.0));",
    "#14=CARTESIAN_POINT('P5',(-2.0,-2.0,3.0));",
    "#15=CARTESIAN_POINT('P6',(2.0,-2.0,3.0));",
    "#16=CARTESIAN_POINT('P7',(2.0,2.0,3.0));",
    "#17=CARTESIAN_POINT('P8',(-2.0,2.0,3.0));",
    'ENDSEC;',
    'END-ISO-10303-21;',
  ].join('\n');
  const smallStepRes = parseSTEPorIFC(smallStepMm, 'm4_spacer_4mm.step', 'STEP');
  check(
    'STEP Unidade Explícita: Peça de 4mm com SI_UNIT(.MILLI.,.METRE.) NÃO é multiplicada por 1000x',
    smallStepRes.boundingBox.size[0] < 10 && Math.abs(smallStepRes.boundingBox.size[0] - 4) < 0.5,
    `bboxX=${smallStepRes.boundingBox.size[0].toFixed(2)} mm (esperado 4.00 mm)`
  );

  const ifcPolyLoop = [
    'ISO-10303-21;',
    'DATA;',
    "#1=IFCCARTESIANPOINT((0.,0.,0.));",
    "#2=IFCCARTESIANPOINT((120.,0.,0.));",
    "#3=IFCCARTESIANPOINT((120.,60.,0.));",
    "#4=IFCCARTESIANPOINT((0.,60.,0.));",
    "#5=IFCPOLYLOOP((#1,#2,#3,#4));",
    "#6=IFCFACEOUTERBOUND(#5,.T.);",
    "#7=IFCFACE((#6));",
    'ENDSEC;',
  ].join('\n');
  const ifcRes = parseSTEPorIFC(ifcPolyLoop, 'laje_bim.ifc', 'IFC');
  check(
    'IFC: Suporta faces reais IFCFACE / IFCFACEOUTERBOUND / IFCPOLYLOOP',
    ifcRes.triangleCount === 2,
    `triangleCount=${ifcRes.triangleCount} (esperado 2)`
  );

  // 8. OCCT WASM STEP test
  try {
    const occtRes = await parseStepWithOcct(Buffer.from(SAMPLE_CAD_FILES[2].content, 'utf8'), 'bloco_matriz.step');
    check('OCCT WASM: STEP válido ou fallback limpo', occtRes.meshes.length > 0, `meshes=${occtRes.meshes.length}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(
      'OCCT WASM: Rejeição limpa de STEP apenas com pontos (para acionar fallback B-Rep TS)',
      msg.includes('OpenCASCADE'),
      msg
    );
  }

  // 9. Inventor (.IPT) real bug probes:
  // 9a: Multi-line ACIS SAT with cylinder / point fallback + Z=0 datum coords
  const acisWrapped = [
    '700 0 1 0',
    '10 1e-06 1e-10',
    '10',
    '-0 body $-1 $-1 $-1 $-1',
    '  #',
    '-8 point $-1 0.0 0.0 0.0 #',
    '-9 point $-1',
    '  15.0 0.0 0.0 #',
    '-10 point $-1 15.0 8.0 0.0 #',
    '-11 point $-1 0.0 8.0 0.0 #',
    '-12 point $-1 0.0 0.0 3.0 #',
    '-13 point $-1 15.0 8.0 3.0 #',
    'End-of-ACIS-data',
  ].join('\n');
  const iptAcisZlib = Buffer.concat([zlib.deflateSync(Buffer.from(acisWrapped, 'utf8')), Buffer.from('TRAILING_OLE_BYTES_0123456789')]);
  const cfbAcis = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfbAcis, 'BRepStream', Buffer.concat([Buffer.from('HDR'), iptAcisZlib]));
  try {
    const acisRes = await parseIptWithOle2(Buffer.from(CFB.write(cfbAcis, { type: 'buffer' })), 'cilindro_acis_quebrado.ipt');
    const b = measurePositionsBounds(acisRes.meshes[0].positions);
    check(
      'IPT ACIS + zlib c/ trailing bytes: Lê registros multi-linha #, infla zlib e preserva vértices Z=0',
      acisRes.meshes.length > 0 && Math.abs(b.minY) < 0.5 && Math.abs(b.sx - 150) < 5,
      `engine=${acisRes.engine}, bboxX=${b.sx.toFixed(1)}mm, minY=${b.minY.toFixed(1)}mm`
    );
  } catch (err) {
    check(
      'IPT ACIS + zlib c/ trailing bytes: Lê registros multi-linha #, infla zlib e preserva vértices Z=0',
      false,
      err instanceof Error ? err.message : String(err)
    );
  }

  // 9b: Float32 vertex buffer resting on Z=0 and symmetric around X=0 with cm->mm scaling & exact bounds
  const f32Verts = new Float32Array([
    -9, 0, 0,  9, 0, 0,  9, 6, 0,  -9, 6, 0,
    -9, 0, 2,  9, 0, 2,  9, 6, 2,  -9, 6, 2,
    -9, 0, 0,  9, 0, 0,  9, 6, 0,  -9, 6, 2,
  ]);
  const f32Idx = new Uint32Array([
    0, 1, 2,  0, 2, 3,
    4, 5, 6,  4, 6, 7,
    0, 1, 5,  0, 5, 4,
    2, 3, 7,  2, 7, 6,
  ]);
  const headerU32 = new Uint32Array([12]);
  const tCountU32 = new Uint32Array([8]);
  const displayMeshPayload = Buffer.concat([
    Buffer.from('TAG!'),
    Buffer.from(headerU32.buffer),
    Buffer.from(f32Verts.buffer),
    Buffer.from(tCountU32.buffer),
    Buffer.from(f32Idx.buffer),
  ]);
  const cfbMesh = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfbMesh, 'GraphicsMesh', zlib.deflateSync(displayMeshPayload));
  try {
    const meshIptRes = await parseIptWithOle2(Buffer.from(CFB.write(cfbMesh, { type: 'buffer' })), 'suporte_indexed_cm.ipt');
    const b = measurePositionsBounds(meshIptRes.meshes[0].positions);
    check(
      'IPT Indexed Display Mesh (cm->mm + datum Z=0): Escala 18cm->180mm e preserva Y_min=0',
      Math.abs(b.sx - 180) < 1 && Math.abs(b.minY) < 0.5 && Math.abs(b.sy - 20) < 1,
      `engine=${meshIptRes.engine}, size=(${b.sx.toFixed(1)}, ${b.sy.toFixed(1)}, ${b.sz.toFixed(1)})mm, minY=${b.minY.toFixed(1)}`
    );
  } catch (err) {
    check(
      'IPT Indexed Display Mesh (cm->mm + datum Z=0): Escala 18cm->180mm e preserva Y_min=0',
      false,
      err instanceof Error ? err.message : String(err)
    );
  }

  // 9c: Cloud-only Float32 resting heavily on Z=0 and X=0 (strictly planar datum points!)
  const cloudPts = new Float32Array([
    0, 0, 0,   12, 0, 0,   12, 8, 0,   0, 8, 0,
    0, 0, 2.5, 12, 0, 2.5, 12, 8, 2.5, 0, 8, 2.5,
    6, 0, 0,   6, 8, 0,    0, 4, 0,    12, 4, 0,
  ]);
  const cfbCloud = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfbCloud, 'Model', zlib.deflateSync(Buffer.from(cloudPts.buffer)));
  try {
    const cloudRes = await parseIptWithOle2(Buffer.from(CFB.write(cfbCloud, { type: 'buffer' })), 'chapa_datum_zero.ipt');
    const b = measurePositionsBounds(cloudRes.meshes[0].positions);
    check(
      'IPT Float32 Cloud c/ X=0/Y=0/Z=0: Preserva Xmin=0, Ymin=0 e dimensões reais 120×25×80mm',
      Math.abs(b.minX) < 1 && Math.abs(b.minY) < 1 && Math.abs(b.sx - 120) < 5 && Math.abs(b.sy - 25) < 5,
      `min=(${b.minX.toFixed(1)},${b.minY.toFixed(1)},${b.minZ.toFixed(1)}), size=(${b.sx.toFixed(1)},${b.sy.toFixed(1)},${b.sz.toFixed(1)})`
    );
  } catch (err) {
    check(
      'IPT Float32 Cloud c/ X=0/Y=0/Z=0: Preserva Xmin=0, Ymin=0 e dimensões reais 120×25×80mm',
      false,
      err instanceof Error ? err.message : String(err)
    );
  }

  // 10. SVG pure-JS / Node fallback & transforms
  try {
    const svgSample = `<svg viewBox="0 0 200 100"><g transform="translate(20,10)"><rect x="0" y="0" width="80" height="40"/><path d="M 10 10 Q 50 0 70 30 T 90 40 L 10 40 Z"/></g></svg>`;
    const svgRes = parseSVGToCad(svgSample, 'suporte_svg.svg');
    check(
      'SVG Parser: Funciona c/ transform + comando T sem depender só de DOMParser',
      svgRes.triangleCount > 0 && svgRes.components!.length >= 2,
      `tris=${svgRes.triangleCount}, comps=${svgRes.components?.length}`
    );
  } catch (err) {
    check(
      'SVG Parser: Funciona c/ transform + comando T sem depender só de DOMParser',
      false,
      err instanceof Error ? err.message : String(err)
    );
  }

  // 11. Preset toolId consistency + End-to-end physics + Curvature weight optimization
  const missingTools = WORKSPACE_PROJECT_PRESETS.filter(
    (p) => !CAM_TOOLS.some((t) => t.id === p.camSettings.toolId)
  ).map((p) => `${p.id}->${p.camSettings.toolId}`);
  check(
    'CAM Tools: Todos toolIds dos Presets existem em CAM_TOOLS',
    missingTools.length === 0,
    missingTools.length === 0 ? 'OK' : `Faltando: ${missingTools.join(', ')}`
  );

  for (const preset of WORKSPACE_PROJECT_PRESETS) {
    const pSurf = buildNurbsSurfaceFromParams(preset.designParams);
    const pMesh = tessellateNurbsSurface(
      pSurf,
      preset.designParams.ribCountU,
      preset.designParams.ribCountV,
      preset.designParams.ribHeightMm
    );
    const pImp = preset.buildImportedModel ? preset.buildImportedModel() : null;
    const pProfile = resolvePartEngineeringProfile({
      filename: pImp?.filename,
      layers: pImp?.layers,
      preset: preset.designParams.preset,
      segmentOverride: preset.segment,
      surfaceName: pSurf.name,
    });
    const pFea = evaluateStructuralFea(
      pSurf,
      pMesh,
      preset.designParams,
      preset.materialFinish,
      preset.feaSettings,
      'all',
      pProfile,
      pImp,
      preset.initialFeatures ?? []
    );
    const pCurv = analyzeCurvatureAndOptimizeWeight({
      surface: pSurf,
      meshData: pMesh,
      designParams: preset.designParams,
      materialFinish: preset.materialFinish,
      feaSettings: preset.feaSettings,
      feaResult: pFea,
      partProfile: pProfile,
      isolationTarget: 'all',
      importedModel: pImp,
      featureOps: preset.initialFeatures ?? [],
    });
    const pVuc = computeScoobiiiVucProof({
      surface: pSurf,
      meshData: pMesh,
      designParams: preset.designParams,
      materialFinish: preset.materialFinish,
      feaSettings: preset.feaSettings,
      feaResult: pFea,
      partProfile: pProfile,
      featureOps: preset.initialFeatures ?? [],
      importedModel: pImp,
    });
    const pCam = generateCamToolpath(pSurf, pMesh, preset.camSettings);
    const pCo2 = calculateCarbonFootprint({
      meshData: pMesh,
      importedModel: pImp,
      materialFinish: preset.materialFinish,
      camSettings: preset.camSettings,
      toolpath: pCam,
      featureOps: preset.initialFeatures ?? [],
    });
    const pLayers = inferDefaultLayerSpecs({
      importedModel: pImp,
      components: pImp?.components ?? [],
      partProfile: pProfile,
    });
    const pTol = evaluateLayerToleranceCompliance({
      surface: pSurf,
      specs: pLayers,
      feaResult: pFea,
      partProfile: pProfile,
    });

    const okImported = !pImp || (pImp.triangleCount > 0 && (pImp.components?.length ?? 0) > 0);
    const okPhysics =
      Number.isFinite(pFea.maxStressMpa) &&
      Number.isFinite(pFea.safetyFactor) &&
      Number.isFinite(pCo2.totalCo2Kg) &&
      pCo2.totalCo2Kg > 0 &&
      pTol.totalLayers > 0 &&
      pCurv.weightReductionPct > 0 &&
      pVuc.nurbsProof.maxPartitionUnityResidual < 1e-10;

    check(
      `Preset "${preset.id}" End-to-End`,
      okImported && okPhysics,
      `impTris=${pImp?.triangleCount ?? 'n/a'}, mass=${pFea.totalMassKg}kg, curvDrop=${pCurv.weightReductionPct}%, VUC_res=${pVuc.nurbsProof.maxPartitionUnityResidual}, CO2=${pCo2.totalCo2Kg}kg`
    );
  }

  // 21. LLM Briefing Translator for .IPT (compact token-safe summary, no raw vertex dumps) & encrypted ASM fallback
  const briefingBrief = await buildCadLlmBriefing(
    Buffer.from(CFB.write(cfbMesh, { type: 'buffer' })),
    'suporte_indexed_cm.ipt'
  );
  const jsonLen = JSON.stringify(briefingBrief).length;
  check(
    'LLM Briefing (.IPT Display Mesh): Resumo compacto sem dump de vértices + dimensões em mm',
    briefingBrief.ok &&
      briefingBrief.geometryStatus === 'tessellated' &&
      Math.abs(briefingBrief.summaryStats.boundingBoxMm.size[0] - 180) < 1 &&
      !('positions' in (briefingBrief.components[0] ?? {})) &&
      jsonLen < 6000 &&
      briefingBrief.llmSummaryText.includes('180'),
    `status=${briefingBrief.geometryStatus}, jsonBytes=${jsonLen}, boxX=${briefingBrief.summaryStats.boundingBoxMm.size[0]}mm`
  );

  const cfbEncrypted = CFB.utils.cfb_new();
  CFB.utils.cfb_add(cfbEncrypted, 'SummaryInformation', Buffer.from('RockShox BoXXer Crown 6061-T6 ISO4210', 'utf8'));
  CFB.utils.cfb_add(cfbEncrypted, 'RSeStorage', Buffer.from([0x13, 0xaa, 0xfe, 0x99, 0x41, 0x22, 0x77, 0x05]));
  const encryptedBrief = await buildCadLlmBriefing(
    Buffer.from(CFB.write(cfbEncrypted, { type: 'buffer' })),
    'coroa_asm_fechada.ipt'
  );
  check(
    'LLM Briefing (.IPT ShapeManager ASM fechado): Degradação limpa c/ iProperties e instrução STEP',
    !encryptedBrief.ok &&
      encryptedBrief.geometryStatus === 'metadata_only_asm_encrypted' &&
      encryptedBrief.metadata.inferredSegment === 'ciclismo-mobilidade' &&
      encryptedBrief.metadata.extractedTokens.some((t) => t.includes('RockShox')) &&
      Boolean(encryptedBrief.diagnostics.recommendedFallbackAction),
    `status=${encryptedBrief.geometryStatus}, segment=${encryptedBrief.metadata.inferredSegment}, tokens=${encryptedBrief.metadata.extractedTokens.length}`
  );

  const failed = results.filter((r) => !r.passed);
  console.log(`\n=== RESUMO: ${results.length - failed.length}/${results.length} PASSARAM (${failed.length} FALHAS) ===`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

void runAudit();
