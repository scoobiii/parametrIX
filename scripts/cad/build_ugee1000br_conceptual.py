"""FreeCAD macro: modelo CAD conceitual e NÃO FUNCIONAL do pacote UGEE1000BR.

Execução (a partir da raiz do repositório):
    QT_QPA_PLATFORM=offscreen freecadcmd scripts/cad/build_ugee1000br_conceptual.py

Gera somente um FCStd com blocos simbólicos. Não contém rotor, pás, combustor,
trajeto de fluido, cotas, interfaces, materiais, tolerâncias ou dados operacionais.
As proporções são exclusivamente gráficas e não representam dimensões reais.
"""
import os
import FreeCAD
import Part

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(REPO_ROOT, "deliverables", "ugee1000br_conceptual")
OUT_FILE = os.path.join(OUT_DIR, "ugee1000br_conceptual.FCStd")

# Unidades gráficas arbitrárias: não são mm nem escala de engenharia.
MODULES = [
    ("M01_Enclosure", "Invólucro conceitual", (0, 0, 0), (24, 18, 16)),
    ("M02_Air_System", "Módulo de admissão — simbólico", (30, 3, 3), (14, 12, 10)),
    ("M03_Core", "Núcleo — volume abstrato, sem internos", (49, 3, 3), (18, 12, 10)),
    ("M04_Exhaust_System", "Módulo de exaustão — simbólico", (72, 3, 3), (14, 12, 10)),
    ("M05_Generator", "Módulo gerador — volume abstrato", (91, 3, 3), (18, 12, 10)),
    ("M06_Control", "Módulo de controle — simbólico", (30, 22, 0), (16, 7, 6)),
    ("M07_Base", "Base de referência visual", (0, -3, -4), (112, 34, 3)),
]

doc = FreeCAD.newDocument("UGEE1000BR_CONCEPTUAL_ONLY")
group = doc.addObject("App::DocumentObjectGroup", "ConceptualAssembly")
group.Label = "UGEE1000BR — montagem conceitual (não funcional)"

for name, label, origin, size in MODULES:
    obj = doc.addObject("Part::Feature", name)
    obj.Label = label
    obj.Shape = Part.makeBox(size[0], size[1], size[2],
                             FreeCAD.Vector(origin[0], origin[1], origin[2]))
    obj.addProperty("App::PropertyString", "ModelClass", "Governance")
    obj.ModelClass = "SYMBOLIC_ENVELOPE_ONLY"
    obj.addProperty("App::PropertyString", "DimensionalValidity", "Governance")
    obj.DimensionalValidity = "NONE — arbitrary display units"
    obj.addProperty("App::PropertyString", "ManufacturingStatus", "Governance")
    obj.ManufacturingStatus = "PROHIBITED — not manufacturing geometry"
    group.addObject(obj)
    if hasattr(obj, "ViewObject"):
        try:
            obj.ViewObject.ShapeColor = (0.55, 0.68, 0.78)
            obj.ViewObject.LineColor = (0.12, 0.16, 0.20)
        except Exception:
            pass

doc.addObject("App::FeaturePython", "ModelGovernance") if False else None
doc.recompute()
os.makedirs(OUT_DIR, exist_ok=True)
doc.saveAs(OUT_FILE)
print("STATUS=CONCEPTUAL_ONLY")
print("DIMENSIONAL_VALIDITY=NONE")
print("MANUFACTURING_RELEASE=BLOCKED")
print("MODULE_COUNT=%d" % len(MODULES))
print("FCSTD=%s" % OUT_FILE)
