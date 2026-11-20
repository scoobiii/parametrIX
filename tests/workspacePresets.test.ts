import { describe, expect, it, vi } from 'vitest';
import * as imageToCadMod from '../src/kernel/imageToCad';
import {
  ACCEPTED_CAD_EXTENSIONS,
  parseUploadedCadOrImageFile,
  WORKSPACE_PROJECT_PRESETS,
} from '../src/kernel/workspacePresets';

describe('workspacePresets kernel', () => {
  it('validates all 9 workspace presets and their optional imported models', () => {
    expect(ACCEPTED_CAD_EXTENSIONS).toContain('.ipt');
    expect(WORKSPACE_PROJECT_PRESETS).toHaveLength(9);
    for (const p of WORKSPACE_PROJECT_PRESETS) {
      if (p.buildImportedModel) {
        const model = p.buildImportedModel();
        expect(model.triangleCount).toBeGreaterThan(0);
      }
    }
  });

  it('dispatches uploaded files across STL, OBJ, DXF, 3DM, STEP/STP/IFC, IPT, SVG, raster images, and rejects unsupported', async () => {
    const stlTxt = 'solid s\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 5 0 0\nvertex 0 5 0\nendloop\nendfacet\nendsolid s';
    expect((await parseUploadedCadOrImageFile(new File([stlTxt], 'part.stl'))).format).toBe('STL');

    const objTxt = 'v 0 0 0\nv 5 0 0\nv 0 5 0\nf 1 2 3';
    expect((await parseUploadedCadOrImageFile(new File([objTxt], 'part.obj'))).format).toBe('OBJ');

    const dxfTxt = '0\nSECTION\n2\nENTITIES\n0\nCIRCLE\n8\nL\n10\n0\n20\n0\n30\n0\n40\n15\n0\nENDSEC\n0\nEOF';
    expect((await parseUploadedCadOrImageFile(new File([dxfTxt], 'part.dxf'))).format).toBe('DXF');

    const svgTxt = '<svg><rect x="0" y="0" width="20" height="20"/></svg>';
    expect((await parseUploadedCadOrImageFile(new File([svgTxt], 'part.svg'))).format).toBe('SVG');

    const stepTxt = 'ISO-10303-21;\nDATA;\n#1=CARTESIAN_POINT(\'\',(0.,0.,0.));\n#2=CARTESIAN_POINT(\'\',(10.,0.,0.));\n#3=CARTESIAN_POINT(\'\',(0.,10.,0.));\nENDSEC;';
    expect((await parseUploadedCadOrImageFile(new File([stepTxt], 'part.stp'))).format).toBe('STEP');
    expect((await parseUploadedCadOrImageFile(new File([stepTxt], 'part.step'))).format).toBe('STEP');

    const ifcTxt = "ISO-10303-21;\nDATA;\n#1=IFCCARTESIANPOINT((0.,0.,0.));\n#2=IFCCARTESIANPOINT((10.,0.,0.));\n#3=IFCCARTESIANPOINT((0.,10.,0.));\n#4=IFCPOLYLOOP((#1,#2,#3));\n#5=IFCFACEOUTERBOUND(#4,.T.);\n#6=IFCFACE((#5));\nENDSEC;";
    expect((await parseUploadedCadOrImageFile(new File([ifcTxt], 'beam.ifc'))).format).toBe('IFC');

    // 3DM & IPT invalid buffers reject cleanly as expected from parser dispatch
    await expect(
      parseUploadedCadOrImageFile(new File([new Uint8Array([1, 2, 3])], 'bad.3dm'))
    ).rejects.toThrow();
    await expect(
      parseUploadedCadOrImageFile(new File([new Uint8Array([1, 2, 3])], 'bad.ipt'))
    ).rejects.toThrow();

    // Raster image dispatch
    const spy = vi.spyOn(imageToCadMod, 'convertImageToCadModel').mockResolvedValueOnce({
      model: {
        id: 'imp-img-1',
        filename: 'foto.webp',
        format: 'IMAGE',
        positions: new Float32Array(9),
        normals: new Float32Array(9),
        triangleCount: 1,
        entityCount: 1,
        boundingBox: { min: [0, 0, 0], max: [10, 10, 10], size: [10, 10, 10] },
        layers: ['IMG'],
        notes: 'ok',
      },
      ragTextSummary: 'ok',
    });
    const imgRes = await parseUploadedCadOrImageFile(
      new File([new Uint8Array([1, 2])], 'foto.webp', { type: 'image/webp' })
    );
    expect(imgRes.format).toBe('IMAGE');
    spy.mockRestore();

    // Unsupported extension & extensionless filename
    await expect(parseUploadedCadOrImageFile(new File(['x'], 'doc.pdf'))).rejects.toThrow(
      'Extensão .pdf não suportada'
    );
    const noDot = { name: 'README', type: '' } as File;
    await expect(parseUploadedCadOrImageFile(noDot)).rejects.toThrow('não suportada');
  });
});
