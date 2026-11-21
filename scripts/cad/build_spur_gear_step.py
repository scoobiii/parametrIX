"""Gera o STEP B-Rep e o STL da engrenagem M2 Z24 a partir do perfil do kernel.

Executar de dentro do repositório:
    QT_QPA_PLATFORM=offscreen freecadcmd scripts/cad/build_spur_gear_step.py

O perfil (contorno de evolvente + furos) vem de deliverables/engrenagem_m2_z24/profile.json,
produzido por scripts/cad/export_spur_gear_geometry.ts. Assim o STEP e a malha do
Parametrix compartilham a mesma fonte geométrica.
"""

import hashlib
import json
import os

import FreeCAD
import Mesh
import Part

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(REPO_ROOT, "deliverables", "engrenagem_m2_z24")
PROFILE_PATH = os.path.join(OUT_DIR, "profile.json")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def vector_list(points):
    return [FreeCAD.Vector(float(x), float(y), 0.0) for x, y in points]


def closed_wire(points):
    vectors = vector_list(points)
    if vectors[0].distanceToPoint(vectors[-1]) > 1e-7:
        vectors.append(vectors[0])
    return Part.makePolygon(vectors)


def main():
    with open(PROFILE_PATH, "r", encoding="utf-8") as handle:
        profile = json.load(handle)

    thickness = float(profile["thicknessMm"])
    outline = profile["outline"]
    holes = profile["holes"]

    face = Part.Face(closed_wire(outline))
    if not face.isValid():
        raise RuntimeError("Face externa inválida após a construção do wire.")

    for hole in holes:
        hole_face = Part.Face(closed_wire(hole["points"]))
        if not hole_face.isValid():
            raise RuntimeError(f"Face interna inválida para o furo {hole['kind']}.")
        face = face.cut(hole_face)
        if not face.isValid():
            raise RuntimeError(f"Corte booleano inválido para o furo {hole['kind']}.")

    solid = face.extrude(FreeCAD.Vector(0.0, 0.0, thickness))
    solid = solid.removeSplitter()
    if not solid.isValid():
        raise RuntimeError("Sólido inválido após a extrusão.")
    if len(solid.Solids) != 1:
        raise RuntimeError(f"Esperado 1 sólido, obtidos {len(solid.Solids)}.")

    step_path = os.path.join(OUT_DIR, "engrenagem_m2_z24.step")
    stl_path = os.path.join(OUT_DIR, "engrenagem_m2_z24.stl")

    doc = FreeCAD.newDocument("Engrenagem_M2_Z24")
    obj = doc.addObject("Part::Feature", "Engrenagem_M2_Z24")
    obj.Shape = solid
    doc.recompute()
    Part.export([obj], step_path)
    Mesh.export([obj], stl_path)
    FreeCAD.closeDocument(doc.Name)

    box = solid.BoundBox
    center = getattr(solid, "CenterOfMass", None)
    if center is None:
        center_mm = [
            (box.XMin + box.XMax) / 2.0,
            (box.YMin + box.YMax) / 2.0,
            (box.ZMin + box.ZMax) / 2.0,
        ]
    else:
        center_mm = [center.x, center.y, center.z]
    metrics = {
        "source": "FreeCAD %s (OpenCASCADE B-Rep)" % ".".join(FreeCAD.Version()[0:3]),
        "partName": profile.get("partName"),
        "modelCode": profile.get("modelCode"),
        "solidCount": len(solid.Solids),
        "shellCount": len(solid.Shells),
        "faceCount": len(solid.Faces),
        "edgeCount": len(solid.Edges),
        "isValid": bool(solid.isValid()),
        "volumeMm3": float(solid.Volume),
        "surfaceAreaMm2": float(solid.Area),
        "massKg7075T6": float(solid.Volume) * 1e-9 * 2810.0,
        "boundingBox": {
            "min": [box.XMin, box.YMin, box.ZMin],
            "max": [box.XMax, box.YMax, box.ZMax],
            "size": [box.XLength, box.YLength, box.ZLength],
        },
        "centerOfMassMm": center_mm,
        "artifacts": {
            "step": {
                "file": os.path.basename(step_path),
                "bytes": os.path.getsize(step_path),
                "sha256": sha256_file(step_path),
            },
            "stl": {
                "file": os.path.basename(stl_path),
                "bytes": os.path.getsize(stl_path),
                "sha256": sha256_file(stl_path),
            },
        },
    }

    metrics_path = os.path.join(OUT_DIR, "engrenagem_m2_z24_metricas_freecad.json")
    with open(metrics_path, "w", encoding="utf-8") as handle:
        json.dump(metrics, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    print("STEP=%s" % step_path)
    print("STL=%s" % stl_path)
    print("SOLIDS=%d FACES=%d EDGES=%d" % (len(solid.Solids), len(solid.Faces), len(solid.Edges)))
    print("VOLUME_MM3=%.6f" % float(solid.Volume))
    print("AREA_MM2=%.6f" % float(solid.Area))
    print(
        "BBOX=%.6f x %.6f x %.6f"
        % (box.XLength, box.YLength, box.ZLength)
    )
    print("VALID=%s" % bool(solid.isValid()))


main()
