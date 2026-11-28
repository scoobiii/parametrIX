import { describe, expect, it, vi } from 'vitest';
import {
  base64ToArrayBuffer,
  chunkTextForRag,
  retrieveTopRagChunks,
  tryBuildCadAndRagDoc,
  tryBuildCadAndRagDocAsync,
} from '../src/kernel/ragEngine';
import type { ImportedCadModel } from '../src/types/cad';

describe('ragEngine kernel', () => {
  it('chunks text, handles empty text, respects limits, and decodes base64', () => {
    expect(chunkTextForRag('d0', 'Empty', '   \r\n ')).toEqual([]);

    const longText = 'A'.repeat(2500);
    const chunks = chunkTextForRag('d1', 'Long', longText);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].index).toBe(1);

    // Trigger whitespace-only slice skipped if tail is spaces & cap at 40 chunks
    const huge = Array.from({ length: 5000 }, (_, i) => `palavra${i}`).join(' ');
    const capped = chunkTextForRag('d2', 'Huge', huge);
    expect(capped.length).toBe(40);

    const trailingSpaces = 'hello' + ' '.repeat(1200);
    expect(chunkTextForRag('d3', 'Trailing', trailingSpaces).length).toBe(1);

    const ab = base64ToArrayBuffer(Buffer.from('CAD').toString('base64'));
    expect(new TextDecoder().decode(ab)).toBe('CAD');
  });

  it('retrieves top chunks with empty docs, empty query tokens, positive scores, and zero-score fallback', () => {
    expect(retrieveTopRagChunks([], 'flange')).toEqual([]);

    const d1 = tryBuildCadAndRagDoc({
      title: 'norma.txt',
      kind: 'upload',
      mimeType: 'text/plain',
      byteSize: 120,
      extractedText: 'ISO 4210 exige fator de segurança 2.5 em garfos downhill e eixo passante.',
    }).ragDoc;
    const d2 = tryBuildCadAndRagDoc({
      title: 'manual.txt',
      kind: 'url',
      originUrl: 'https://example.com/manual.txt',
      mimeType: 'text/plain',
      byteSize: 80,
      extractedText: 'Torque máximo dos parafusos M6 é 10 Nm.',
    }).ragDoc;

    // Short tokens (<2 chars) return slice
    expect(retrieveTopRagChunks([d1, d2], 'a !', 1)).toHaveLength(1);
    // Positive match ranks d1 first
    const matched = retrieveTopRagChunks([d1, d2], 'ISO garfos downhill', 2);
    expect(matched[0].docTitle).toBe('norma.txt');
    // Unmatched query falls back to first slices
    const unmatched = retrieveTopRagChunks([d1, d2], 'zzzzzz nonexistent', 2);
    expect(unmatched).toHaveLength(2);
  });

  it('builds CAD + RAG documents for STL, 3DM, IPT, OBJ, DXF, STEP, IFC, SVG, preBuiltCad, and binary fallback', async () => {
    const stlAscii = 'solid box\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 10 0 0\nvertex 0 10 0\nendloop\nendfacet\nendsolid box\n';
    const stlRes = tryBuildCadAndRagDoc({
      title: 'peca.stl',
      kind: 'upload',
      mimeType: 'model/stl',
      byteSize: stlAscii.length,
      buffer: Buffer.from(stlAscii).buffer,
    });
    expect(stlRes.importedCad?.format).toBe('STL');

    const objText = 'v 0 0 0\nv 10 0 0\nv 0 10 0\nf 1 2 3\n';
    expect(
      tryBuildCadAndRagDoc({
        title: 'peca.obj',
        kind: 'upload',
        mimeType: 'text/plain',
        byteSize: objText.length,
        extractedText: objText,
      }).importedCad?.format
    ).toBe('OBJ');

    const dxfText = '0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\nL1\n10\n0\n20\n0\n30\n0\n40\n20\n0\nENDSEC\n0\nEOF';
    expect(
      tryBuildCadAndRagDoc({
        title: 'peca.dxf',
        kind: 'upload',
        mimeType: 'application/dxf',
        byteSize: dxfText.length,
        extractedText: dxfText,
      }).importedCad?.format
    ).toBe('DXF');

    const svgText = '<svg viewBox="0 0 50 50"><rect x="0" y="0" width="40" height="40"/></svg>';
    expect(
      tryBuildCadAndRagDoc({
        title: 'logo.svg',
        kind: 'upload',
        mimeType: 'image/svg+xml',
        byteSize: svgText.length,
        extractedText: svgText,
      }).importedCad?.format
    ).toBe('SVG');

    const stepText = 'ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=CARTESIAN_POINT(\'\',(0.,0.,0.));\n#2=CARTESIAN_POINT(\'\',(10.,0.,0.));\n#3=CARTESIAN_POINT(\'\',(0.,10.,0.));\nENDSEC;\nEND-ISO-10303-21;';
    expect(
      tryBuildCadAndRagDoc({
        title: 'peca.step',
        kind: 'upload',
        mimeType: 'application/step',
        byteSize: stepText.length,
        extractedText: stepText,
      }).importedCad?.format
    ).toBe('STEP');

    const ifcText = "ISO-10303-21;\nDATA;\n#1=IFCCARTESIANPOINT((0.,0.,0.));\n#2=IFCCARTESIANPOINT((20.,0.,0.));\n#3=IFCCARTESIANPOINT((0.,20.,0.));\n#4=IFCPOLYLOOP((#1,#2,#3));\n#5=IFCFACEOUTERBOUND(#4,.T.);\n#6=IFCFACE((#5));\nENDSEC;";
    expect(
      tryBuildCadAndRagDoc({
        title: 'viga.ifc',
        kind: 'upload',
        mimeType: 'application/ifc',
        byteSize: ifcText.length,
        extractedText: ifcText,
      }).importedCad?.format
    ).toBe('IFC');

    // Trigger 3DM & IPT catch/fallback branches cleanly without throwing
    const bad3dm = tryBuildCadAndRagDoc({
      title: 'invalid.3dm',
      kind: 'upload',
      mimeType: 'application/octet-stream',
      byteSize: 8,
      buffer: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer,
    });
    expect(bad3dm.ragDoc.formatTag).toBe('3DM');

    const badIpt = tryBuildCadAndRagDoc({
      title: 'invalid.ipt',
      kind: 'upload',
      mimeType: 'application/octet-stream',
      byteSize: 8,
      buffer: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]).buffer,
    });
    expect(badIpt.ragDoc.formatTag).toBe('IPT');

    // Extensionless doc + preBuiltCad
    const preBuilt: ImportedCadModel = {
      id: 'imp-rag-1',
      filename: 'foto.png',
      format: 'IMAGE',
      positions: new Float32Array(9),
      normals: new Float32Array(9),
      triangleCount: 1,
      entityCount: 1,
      boundingBox: { min: [0, 0, 0], max: [50, 20, 10], size: [50, 20, 10] },
      layers: ['FOTO'],
      notes: 'Imagem convertida',
    };
    const noExt = tryBuildCadAndRagDoc({
      title: 'README_NO_EXT',
      kind: 'gdrive',
      mimeType: 'application/octet-stream',
      byteSize: 1024,
      preBuiltCad: preBuilt,
    });
    expect(noExt.ragDoc.formatTag).toBe('DOC');
    expect(noExt.ragDoc.summary).toBe('Imagem convertida');

    // Async variant for STEP, IPT, and preBuiltCad
    const asyncStep = await tryBuildCadAndRagDocAsync({
      title: 'peca.stp',
      kind: 'upload',
      mimeType: 'application/step',
      byteSize: stepText.length,
      extractedText: stepText,
    });
    expect(asyncStep.importedCad?.format).toBe('STEP');

    const asyncStepBuf = await tryBuildCadAndRagDocAsync({
      title: 'peca_buf.step',
      kind: 'upload',
      mimeType: 'application/step',
      byteSize: stepText.length,
      buffer: Buffer.from(stepText).buffer,
    });
    expect(asyncStepBuf.importedCad?.format).toBe('STEP');

    const asyncIpt = await tryBuildCadAndRagDocAsync({
      title: 'empty.ipt',
      kind: 'upload',
      mimeType: 'application/octet-stream',
      byteSize: 4,
      buffer: new Uint8Array([1, 2, 3, 4]).buffer,
    });
    expect(asyncIpt.ragDoc.formatTag).toBe('IPT');

    const asyncPre = await tryBuildCadAndRagDocAsync({
      title: 'img.png',
      kind: 'upload',
      mimeType: 'image/png',
      byteSize: 100,
      preBuiltCad: preBuilt,
    });
    expect(asyncPre.importedCad).toBe(preBuilt);

    const asyncIptNoBuf = await tryBuildCadAndRagDocAsync({
      title: 'no_buf.ipt',
      kind: 'upload',
      mimeType: 'application/octet-stream',
      byteSize: 0,
    });
    expect(asyncIptNoBuf.importedCad).toBeNull();

    const asyncIptNullBuf = await tryBuildCadAndRagDocAsync({
      title: 'null_buf.ipt',
      kind: 'upload',
      mimeType: 'application/octet-stream',
      byteSize: 0,
      buffer: null as unknown as ArrayBuffer,
    });
    expect(asyncIptNullBuf.importedCad).toBeNull();

    const asyncTextFallback = await tryBuildCadAndRagDocAsync({
      title: 'notes.txt',
      kind: 'upload',
      mimeType: 'text/plain',
      byteSize: 18,
      extractedText: 'Notas de cálculo.',
    });
    expect(asyncTextFallback.importedCad).toBeNull();
    expect(asyncTextFallback.ragDoc.formatTag).toBe('TXT');

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response);
    const asyncIptFallback = await tryBuildCadAndRagDocAsync({
      title: 'fallback.ipt',
      kind: 'upload',
      mimeType: 'application/octet-stream',
      byteSize: 64,
      buffer: new Uint8Array(64).buffer,
    });
    expect(fetchSpy).toHaveBeenCalledWith('/api/cad/parse-ipt', expect.any(Object));
    expect(asyncIptFallback.ragDoc.formatTag).toBe('IPT');
    fetchSpy.mockRestore();

    const rejectedFetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('IPT service offline'));
    const asyncIptNetworkFallback = await tryBuildCadAndRagDocAsync({
      title: 'network_fallback.ipt',
      kind: 'upload',
      mimeType: 'application/octet-stream',
      byteSize: 64,
      buffer: new Uint8Array(64).buffer,
    });
    expect(rejectedFetchSpy).toHaveBeenCalled();
    expect(asyncIptNetworkFallback.importedCad).toBeNull();
    rejectedFetchSpy.mockRestore();

    const gappedChunks = chunkTextForRag('g1', 'Gapped', 'start ' + ' '.repeat(2400) + 'end');
    expect(gappedChunks.length).toBeGreaterThanOrEqual(2);
  });
});
