import { describe, expect, it } from 'vitest';
import {
  BIM_IFC_TOOL_CATALOG,
  BLENDER_TOOL_CATALOG,
  EXTENDED_MAGIC_PEN_CATALOG,
  parseExtendedMagicPenPrompt,
} from '../src/kernel/magicPenToolsCatalog';

describe('magicPenToolsCatalog (Blender + BIM/IFC)', () => {
  it('exposes 10 Blender modifiers and 10 BIM/IFC structural/MEP elements', () => {
    expect(BLENDER_TOOL_CATALOG).toHaveLength(10);
    expect(BIM_IFC_TOOL_CATALOG).toHaveLength(10);
    expect(EXTENDED_MAGIC_PEN_CATALOG).toHaveLength(20);
  });

  it('parses every Blender and BIM/IFC command prompt including dimensions, axis, count, and invalid prompts', () => {
    expect(parseExtendedMagicPenPrompt('').matched).toBe(false);
    expect(parseExtendedMagicPenPrompt('   ').matched).toBe(false);
    expect(parseExtendedMagicPenPrompt('comando desconhecido xyz').matched).toBe(false);

    const subsurf = parseExtendedMagicPenPrompt('Subsurf 4');
    expect(subsurf.matched).toBe(true);
    expect(subsurf.suite).toBe('blender');
    expect(subsurf.kind).toBe('blender-subsurf');
    expect(subsurf.count).toBe(4);
    expect(subsurf.label).toContain('Blender');

    const bevel = parseExtendedMagicPenPrompt('bevel 3.5mm 6');
    expect(bevel.kind).toBe('blender-bevel');

    const arrayMod = parseExtendedMagicPenPrompt('ArrayModifier 6 z');
    expect(arrayMod.kind).toBe('blender-array-mod');
    expect(arrayMod.count).toBe(6);
    expect(arrayMod.axis).toBe('z');
    expect(arrayMod.depthMm).toBe(10);

    const boolMod = parseExtendedMagicPenPrompt('bmesh boolean 18mm');
    expect(boolMod.kind).toBe('blender-boolean-mod');
    expect(boolMod.depthMm).toBe(18);

    const ifcBeam = parseExtendedMagicPenPrompt('IfcBeam 22mm');
    expect(ifcBeam.matched).toBe(true);
    expect(ifcBeam.suite).toBe('bim-ifc');
    expect(ifcBeam.kind).toBe('bim-ifc-beam');
    expect(ifcBeam.depthMm).toBe(22);
    expect(ifcBeam.label).toContain('BIM/IFC');

    const ifcStair = parseExtendedMagicPenPrompt('IfcStair 8');
    expect(ifcStair.kind).toBe('bim-ifc-stair');
    expect(ifcStair.count).toBe(8);

    const ifcDuct = parseExtendedMagicPenPrompt('ifcduct d=16');
    expect(ifcDuct.kind).toBe('bim-ifc-mep-duct');
    expect(ifcDuct.depthMm).toBe(16);

    const prompts: Array<[string, string]> = [
      ['solidify 4mm', 'blender-solidify'],
      ['decimate 12mm', 'blender-decimate'],
      ['remesh voxel', 'blender-remesh-voxel'],
      ['bridgeloops 30mm', 'blender-bridge-loops'],
      ['screw 25mm', 'blender-screw-lathe'],
      ['lattice 20mm', 'blender-lattice-deform'],
      ['ifccolumn 40mm', 'bim-ifc-column'],
      ['ifcslab 10mm', 'bim-ifc-slab'],
      ['ifcwall 28mm', 'bim-ifc-wall'],
      ['ifctruss 18mm', 'bim-ifc-truss'],
      ['ifcbracing 20mm', 'bim-ifc-bracing'],
      ['ifcfooting 16mm', 'bim-ifc-footing'],
      ['ifccurtainwall 30mm', 'bim-ifc-curtainwall'],
    ];
    for (const [text, expectedKind] of prompts) {
      expect(parseExtendedMagicPenPrompt(text).kind).toBe(expectedKind);
    }
  });
});
