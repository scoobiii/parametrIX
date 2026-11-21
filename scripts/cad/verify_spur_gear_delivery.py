"""Valida a entrega CAD da engrenagem em três camadas independentes:

1. Kernel paramétrico (TypeScript)  — métricas analíticas + malha fechada
2. STEP B-Rep (FreeCAD/OpenCASCADE) — sólido, volume, área e raio externo
3. STL exportado                    — volume fechado calculado por divergência

Grava deliverables/engrenagem_m2_z24/engrenagem_m2_z24_validacao.json.

Executar:
    MPLCONFIGDIR=.cache/matplotlib python3 scripts/cad/verify_spur_gear_delivery.py
"""

import hashlib
import json
import os
import struct

import numpy as np

import FreeCAD
import Import

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(REPO_ROOT, "deliverables", "engrenagem_m2_z24")

PROFILE_PATH = os.path.join(OUT_DIR, "profile.json")
KERNEL_METRICS_PATH = os.path.join(OUT_DIR, "engrenagem_m2_z24_metricas_kernel.json")
FREECAD_METRICS_PATH = os.path.join(OUT_DIR, "engrenagem_m2_z24_metricas_freecad.json")
STEP_PATH = os.path.join(OUT_DIR, "engrenagem_m2_z24.step")
STL_PATH = os.path.join(OUT_DIR, "engrenagem_m2_z24.stl")
VALIDATION_PATH = os.path.join(OUT_DIR, "engrenagem_m2_z24_validacao.json")

REL_TOL_VOLUME = 1e-6
ABS_TOL_THICKNESS = 1e-6
ABS_TOL_RADIUS = 1e-4


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def stl_volume(path):
    with open(path, "rb") as handle:
        data = handle.read()
    triangle_count = struct.unpack_from("<I", data, 80)[0]
    record = np.dtype([("normal", "<3f4"), ("vertices", "<9f4"), ("attr", "<u2")])
    triangles = np.frombuffer(data, dtype=record, count=triangle_count, offset=84)["vertices"]
    triangles = triangles.reshape(-1, 3, 3).astype(np.float64)
    volume = np.sum(
        np.einsum("ij,ij->i", triangles[:, 0], np.cross(triangles[:, 1], triangles[:, 2]))
    ) / 6.0
    return float(volume), int(triangle_count)


def main():
    with open(PROFILE_PATH, "r", encoding="utf-8") as handle:
        profile = json.load(handle)
    with open(KERNEL_METRICS_PATH, "r", encoding="utf-8") as handle:
        kernel_metrics = json.load(handle)["metrics"]
    with open(FREECAD_METRICS_PATH, "r", encoding="utf-8") as handle:
        freecad_metrics = json.load(handle)

    doc = FreeCAD.newDocument("Validacao_Engrenagem")
    Import.insert(STEP_PATH, doc.Name)
    if not doc.Objects:
        raise RuntimeError("STEP não produziu nenhum objeto ao ser reimportado.")
    shape = doc.Objects[0].Shape
    step_volume = float(shape.Volume)
    step_area = float(shape.Area)
    step_solids = len(shape.Solids)
    step_valid = bool(shape.isValid())
    box = shape.BoundBox
    step_thickness = float(box.ZLength)
    max_radius = max(
        float((vertex.Point.x ** 2 + vertex.Point.y ** 2) ** 0.5) for vertex in shape.Vertexes
    )
    top_radius = max(
        float((vertex.Point.x ** 2 + vertex.Point.y ** 2) ** 0.5)
        for vertex in shape.Vertexes
        if abs(vertex.Point.z - step_thickness) < 1e-6
    )

    stl_volume_mm3, stl_triangles = stl_volume(STL_PATH)

    kernel_volume = float(kernel_metrics["volumeMm3"])
    kernel_area = float(kernel_metrics["surfaceAreaMm2"])

    def check(name, measured, expected, tolerance, kind):
        if kind == "rel":
            deviation = abs(measured - expected) / max(abs(expected), 1e-12)
            passed = deviation <= tolerance
        else:
            deviation = abs(measured - expected)
            passed = deviation <= tolerance
        return {
            "name": name,
            "measured": measured,
            "expected": expected,
            "tolerance": tolerance,
            "toleranceKind": kind,
            "deviation": deviation,
            "pass": passed,
        }

    checks = [
        check("STEP é um único sólido", step_solids, 1, 0, "abs"),
        check("STEP válido (OpenCASCADE)", 1 if step_valid else 0, 1, 0, "abs"),
        check("Volume STEP vs kernel", step_volume, kernel_volume, REL_TOL_VOLUME, "rel"),
        check("Área STEP vs kernel", step_area, kernel_area, REL_TOL_VOLUME, "rel"),
        check("Volume STL vs kernel", stl_volume_mm3, kernel_volume, 1e-6, "rel"),
        check("Espessura STEP (b)", step_thickness, profile["thicknessMm"], ABS_TOL_THICKNESS, "abs"),
        check(
            "Raio externo máximo STEP (da/2)",
            max_radius,
            profile["metrics"]["tipDiameterMm"] / 2.0,
            ABS_TOL_RADIUS,
            "abs",
        ),
        check(
            "Raio externo no topo STEP",
            top_radius,
            profile["metrics"]["tipDiameterMm"] / 2.0,
            ABS_TOL_RADIUS,
            "abs",
        ),
        check("Triângulos STL", stl_triangles, 4496, 0, "abs"),
    ]

    status = "PASS" if all(item["pass"] for item in checks) else "FAIL"
    validation = {
        "status": status,
        "partName": profile["partName"],
        "modelCode": profile["modelCode"],
        "standardReferences": ["ISO 53:1998", "ISO 21771:2007", "ISO 2768-mK"],
        "measurements": {
            "kernelVolumeMm3": kernel_volume,
            "kernelSurfaceAreaMm2": kernel_area,
            "stepVolumeMm3": step_volume,
            "stepSurfaceAreaMm2": step_area,
            "stlVolumeMm3": stl_volume_mm3,
            "stepThicknessMm": step_thickness,
            "stepMaxRadiusMm": max_radius,
            "stepTopRadiusMm": top_radius,
            "stepSolidCount": step_solids,
            "stepFaceCount": len(shape.Faces),
            "stepEdgeCount": len(shape.Edges),
            "stlTriangleCount": stl_triangles,
        },
        "checks": checks,
        "artifacts": {
            name: {"file": os.path.basename(path), "bytes": os.path.getsize(path), "sha256": sha256_file(path)}
            for name, path in {
                "profile": PROFILE_PATH,
                "kernelMetrics": KERNEL_METRICS_PATH,
                "freecadMetrics": FREECAD_METRICS_PATH,
                "step": STEP_PATH,
                "stl": STL_PATH,
            }.items()
        },
    }

    with open(VALIDATION_PATH, "w", encoding="utf-8") as handle:
        json.dump(validation, handle, indent=2, ensure_ascii=False)
        handle.write("\n")

    FreeCAD.closeDocument(doc.Name)

    print("STATUS=%s" % status)
    for item in checks:
        print(
            "%s | %s | medido=%.9f esperado=%.9f desvio=%.3e"
            % (("OK" if item["pass"] else "FALHA"), item["name"], item["measured"], item["expected"], item["deviation"])
        )
    print("VALIDACAO=%s" % VALIDATION_PATH)


main()
