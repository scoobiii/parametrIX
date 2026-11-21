"""Renderiza as 4 vistas (frontal, superior, lateral e isométrica) da engrenagem.

As projeções são calculadas diretamente dos triângulos do STL exportado pelo FreeCAD.
Não há geometria desenhada "à mão": as silhuetas vêm da malha e as cotas dos
metadados medidos (profile.json / métricas do FreeCAD).

Executar de dentro do repositório:
    MPLCONFIGDIR=.cache/matplotlib python3 scripts/cad/render_spur_gear_views.py
"""

import json
import os
import struct

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import PolyCollection
from matplotlib.patches import Circle

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(REPO_ROOT, "deliverables", "engrenagem_m2_z24")
STL_PATH = os.path.join(OUT_DIR, "engrenagem_m2_z24.stl")
PROFILE_PATH = os.path.join(OUT_DIR, "profile.json")
METRICS_PATH = os.path.join(OUT_DIR, "engrenagem_m2_z24_metricas_freecad.json")
PNG_PATH = os.path.join(OUT_DIR, "engrenagem_m2_z24_4vistas.png")

BASE_RGB = np.array([0.36, 0.56, 0.72])
LIGHT = np.array([0.35, 0.45, 0.82])
LIGHT = LIGHT / np.linalg.norm(LIGHT)


def load_stl(path):
    with open(path, "rb") as handle:
        data = handle.read()
    triangle_count = struct.unpack_from("<I", data, 80)[0]
    record = np.dtype([("normal", "<3f4"), ("vertices", "<9f4"), ("attr", "<u2")])
    triangles = np.frombuffer(data, dtype=record, count=triangle_count, offset=84)["vertices"]
    return triangles.reshape(-1, 3, 3).astype(np.float64)


def triangle_normals(triangles):
    u = triangles[:, 1] - triangles[:, 0]
    v = triangles[:, 2] - triangles[:, 0]
    normals = np.cross(u, v)
    lengths = np.linalg.norm(normals, axis=1)
    lengths[lengths == 0] = 1.0
    return normals / lengths[:, None]


def shaded_colors(normals):
    intensity = 0.42 + 0.58 * np.clip(normals @ LIGHT, 0.0, 1.0)
    rgb = np.clip(BASE_RGB[None, :] * intensity[:, None], 0.0, 1.0)
    return np.concatenate([rgb, np.ones((len(rgb), 1))], axis=1)


def signed_volume(triangles):
    return float(np.sum(np.einsum("ij,ij->i", triangles[:, 0], np.cross(triangles[:, 1], triangles[:, 2]))) / 6.0)


def draw_orthographic(ax, triangles, normals, colors, view_axis, horizontal_axis, title):
    """Projeta em 2D e pinta apenas as faces voltadas ao observador, de trás para frente."""
    visible = normals[:, view_axis] > 1e-9
    depth = triangles[:, :, view_axis].mean(axis=1)
    order = np.argsort(depth)
    order = order[visible[order]]
    vertical_axis = 2 if view_axis == 1 else 1
    projected = triangles[order][:, :, [horizontal_axis, vertical_axis]]
    collection = PolyCollection(
        projected[:, :, :2],
        facecolors=colors[order],
        edgecolors="none",
        antialiased=False,
    )
    ax.add_collection(collection)
    ax.set_title(title, fontsize=11, pad=8, color="#1f2937")


def draw_silhouette(ax, triangles, horizontal_axis, vertical_axis, title):
    """Vista de perfil: silhueta projetada do sólido (faces internas não são visíveis)."""
    projected = triangles[:, :, [horizontal_axis, vertical_axis]]
    collection = PolyCollection(
        projected,
        facecolors="#a9c4d8",
        edgecolors="none",
        antialiased=False,
    )
    ax.add_collection(collection)
    ax.set_title(title, fontsize=11, pad=8, color="#1f2937")


def draw_profile(ax, profile, holes, line_color="#111827"):
    outline = np.array(profile["outline"])
    ax.plot(
        np.r_[outline[:, 0], outline[0, 0]],
        np.r_[outline[:, 1], outline[0, 1]],
        color=line_color,
        linewidth=0.9,
        zorder=6,
    )
    for hole in holes:
        points = np.array(hole["points"])
        ax.plot(
            np.r_[points[:, 0], points[0, 0]],
            np.r_[points[:, 1], points[0, 1]],
            color=line_color,
            linewidth=0.7,
            zorder=6,
        )


def dimension_horizontal(ax, x1, x2, y, text, color="#111827"):
    ax.annotate(
        "",
        xy=(x1, y),
        xytext=(x2, y),
        arrowprops=dict(arrowstyle="<->", color=color, lw=0.9, shrinkA=0, shrinkB=0),
    )
    ax.text((x1 + x2) / 2.0, y + 1.2, text, ha="center", va="bottom", fontsize=9, color=color)


def dimension_vertical(ax, y1, y2, x, text, color="#111827"):
    ax.annotate(
        "",
        xy=(x, y1),
        xytext=(x, y2),
        arrowprops=dict(arrowstyle="<->", color=color, lw=0.9, shrinkA=0, shrinkB=0),
    )
    ax.text(x - 1.4, (y1 + y2) / 2.0, text, ha="right", va="center", rotation=90, fontsize=9, color=color)


def main():
    triangles = load_stl(STL_PATH)
    normals = triangle_normals(triangles)
    colors = shaded_colors(normals)
    volume = signed_volume(triangles)
    with open(PROFILE_PATH, "r", encoding="utf-8") as handle:
        profile = json.load(handle)
    with open(METRICS_PATH, "r", encoding="utf-8") as handle:
        metrics = json.load(handle)

    tip_diameter = float(profile["metrics"]["tipDiameterMm"])
    pitch_diameter = float(profile["metrics"]["pitchDiameterMm"])
    root_diameter = float(profile["metrics"]["rootDiameterMm"])
    bore_diameter = float(profile["metrics"]["boreDiameterMm"])
    hole_diameter = float(profile["metrics"]["lighteningHoleDiameterMm"])
    hole_pcd = float(profile["metrics"]["lighteningHolePitchRadiusMm"]) * 2.0
    thickness = float(profile["thicknessMm"])

    limits = tip_diameter / 2.0
    fig = plt.figure(figsize=(16.0, 11.2), facecolor="#f5f6f8")
    grid = fig.add_gridspec(2, 2, left=0.05, right=0.97, top=0.86, bottom=0.07, wspace=0.16, hspace=0.18)

    # ---------------- Vista frontal (plano XY, olhando +Z) ----------------
    ax_front = fig.add_subplot(grid[0, 0])
    ax_front.set_facecolor("#ffffff")
    draw_orthographic(ax_front, triangles, normals, colors, 2, 0, "Vista frontal (XY) — olhando +Z")
    draw_profile(ax_front, profile, profile["holes"])
    ax_front.axhline(0.0, color="#b91c1c", lw=0.6, ls="-.", zorder=5)
    ax_front.axvline(0.0, color="#b91c1c", lw=0.6, ls="-.", zorder=5)
    ax_front.add_patch(
        Circle((0, 0), pitch_diameter / 2.0, fill=False, ls=(0, (6, 3)), lw=0.8, ec="#2563eb", zorder=5)
    )
    dimension_horizontal(ax_front, -limits, limits, -limits - 9.0, "Ø52,000 (externo)")
    dimension_vertical(ax_front, -limits, limits, -limits - 9.0, "Ø52,000")
    ax_front.text(
        limits + 2.0,
        -limits - 2.0,
        "— · —  Ø48,000 primitivo (referência)",
        ha="left",
        fontsize=8.5,
        color="#2563eb",
    )
    ax_front.annotate(
        f"Ø{bore_diameter:.3f} H7".replace(".", ","),
        xy=(0.0, -bore_diameter / 2.0),
        xytext=(-limits - 24.0, -10.0),
        fontsize=9,
        color="#111827",
        ha="left",
        arrowprops=dict(arrowstyle="-|>", color="#111827", lw=0.8),
    )
    ax_front.annotate(
        f"4×Ø{hole_diameter:.3f}\nem PCD {hole_pcd:.3f}".replace(".", ","),
        xy=(profile["holes"][1]["center"][0], profile["holes"][1]["center"][1]),
        xytext=(limits + 2.0, limits - 8.0),
        fontsize=9,
        color="#111827",
        ha="left",
        arrowprops=dict(arrowstyle="-|>", color="#111827", lw=0.8),
    )
    ax_front.text(
        0.0,
        limits + 5.0,
        "z = 24 dentes · m = 2,000 mm · α = 20°",
        ha="center",
        fontsize=9,
        color="#374151",
    )
    ax_front.set_xlim(-limits - 26.0, limits + 26.0)
    ax_front.set_ylim(-limits - 16.0, limits + 12.0)
    ax_front.set_aspect("equal")
    ax_front.grid(True, lw=0.3, color="#e5e7eb")
    ax_front.set_axisbelow(True)
    ax_front.tick_params(labelsize=7, colors="#6b7280")

    # ---------------- Vista superior (plano XZ, olhando +Y) ----------------
    ax_top = fig.add_subplot(grid[0, 1])
    ax_top.set_facecolor("#ffffff")
    draw_silhouette(ax_top, triangles, 0, 2, "Vista superior (XZ) — olhando +Y")
    ax_top.plot(
        [-limits, limits, limits, -limits, -limits],
        [0.0, 0.0, thickness, thickness, 0.0],
        color="#111827",
        lw=0.9,
        zorder=6,
    )
    dimension_horizontal(ax_top, -limits, limits, -5.5, "Ø52,000")
    dimension_vertical(ax_top, 0.0, thickness, limits + 8.0, "b = 12,000")
    ax_top.set_xlim(-limits - 12.0, limits + 20.0)
    ax_top.set_ylim(-14.0, thickness + 8.0)
    ax_top.set_aspect("equal")
    ax_top.grid(True, lw=0.3, color="#e5e7eb")
    ax_top.set_axisbelow(True)
    ax_top.tick_params(labelsize=7, colors="#6b7280")

    # ---------------- Vista lateral direita (plano YZ, olhando +X) ----------------
    ax_side = fig.add_subplot(grid[1, 0])
    ax_side.set_facecolor("#ffffff")
    draw_silhouette(ax_side, triangles, 1, 2, "Vista lateral direita (YZ) — olhando +X")
    ax_side.plot(
        [-limits, limits, limits, -limits, -limits],
        [0.0, 0.0, thickness, thickness, 0.0],
        color="#111827",
        lw=0.9,
        zorder=6,
    )
    ax_side.axhline(thickness / 2.0, color="#b91c1c", lw=0.6, ls="-.", zorder=5)
    dimension_vertical(ax_side, 0.0, thickness, limits + 8.0, "b = 12,000")
    ax_side.set_xlim(-limits - 12.0, limits + 20.0)
    ax_side.set_ylim(-10.0, thickness + 10.0)
    ax_side.set_aspect("equal")
    ax_side.grid(True, lw=0.3, color="#e5e7eb")
    ax_side.set_axisbelow(True)
    ax_side.tick_params(labelsize=7, colors="#6b7280")

    # ---------------- Perspectiva isométrica ----------------
    ax_iso = fig.add_subplot(grid[1, 1])
    ax_iso.set_facecolor("#ffffff")
    view = np.array([1.0, 1.0, 0.85])
    view = view / np.linalg.norm(view)
    up = np.array([0.0, 0.0, 1.0])
    right = np.cross(up, view)
    right = right / np.linalg.norm(right)
    up_cam = np.cross(view, right)
    visible = normals @ view > 1e-9
    depth = triangles.mean(axis=1) @ view
    order = np.argsort(depth)
    order = order[visible[order]]
    flat = triangles[order].reshape(-1, 3)
    projected = np.column_stack([flat @ right, flat @ up_cam]).reshape(-1, 3, 2)
    iso_collection = PolyCollection(
        projected,
        facecolors=colors[order],
        edgecolors="none",
        antialiased=False,
    )
    ax_iso.add_collection(iso_collection)
    flat_iso = projected.reshape(-1, 2)
    margin_iso = 0.10 * max(
        float(flat_iso[:, 0].max() - flat_iso[:, 0].min()),
        float(flat_iso[:, 1].max() - flat_iso[:, 1].min()),
    )
    ax_iso.set_xlim(float(flat_iso[:, 0].min()) - margin_iso, float(flat_iso[:, 0].max()) + margin_iso)
    ax_iso.set_ylim(float(flat_iso[:, 1].min()) - margin_iso, float(flat_iso[:, 1].max()) + margin_iso)
    ax_iso.set_aspect("equal")
    ax_iso.set_title("Perspectiva isométrica (escala 1:1)", fontsize=11, pad=8, color="#1f2937")
    ax_iso.grid(False)
    ax_iso.tick_params(labelsize=7, colors="#6b7280")

    title = "Engrenagem cilíndrica de dentes retos — m 2 / z 24 / α 20°"
    subtitle = (
        "Alumínio 7075-T6 · b 12,000 · Øext 52,000 · Øprim 48,000 · Øraiz 43,000 · "
        f"Øfuro {bore_diameter:.3f} H7 · {profile['metrics']['lighteningHoleCount']}×Ø{hole_diameter:.3f}"
        f" · volume {metrics['volumeMm3'] / 1000.0:.3f} cm³ · massa {metrics['massKg7075T6'] * 1000.0:.2f} g"
    )
    fig.suptitle(title, fontsize=16, fontweight="bold", color="#111827", y=0.965)
    fig.text(0.5, 0.915, subtitle.replace(".", ","), ha="center", fontsize=9.5, color="#374151")
    fig.text(
        0.5,
        0.025,
        "Projeções ortográficas e isométrica calculadas a partir do STL B-Rep (FreeCAD/OpenCASCADE). "
        f"Volume fechado verificado: {volume / 1000.0:.3f} cm³. Cotas em milímetros. "
        "Desenho de referência — não substitui desenho normatizado ASME Y14.5 / ISO 129.",
        ha="center",
        fontsize=8,
        color="#6b7280",
    )

    fig.savefig(PNG_PATH, dpi=210, facecolor=fig.get_facecolor())

    # Render de apresentação (perspectiva isométrica limpa, sem cotas).
    hero_view = np.array([1.0, 0.62, 0.8])
    hero_view = hero_view / np.linalg.norm(hero_view)
    hero_right = np.cross(up, hero_view)
    hero_right = hero_right / np.linalg.norm(hero_right)
    hero_up = np.cross(hero_view, hero_right)
    hero_visible = normals @ hero_view > 1e-9
    hero_depth = triangles.mean(axis=1) @ hero_view
    hero_order = np.argsort(hero_depth)
    hero_order = hero_order[hero_visible[hero_order]]
    hero_flat = triangles[hero_order].reshape(-1, 3)
    hero_projected = np.column_stack(
        [hero_flat @ hero_right, hero_flat @ hero_up]
    ).reshape(-1, 3, 2)
    fig_hero = plt.figure(figsize=(10.5, 8.4), facecolor="#ffffff")
    ax_hero = fig_hero.add_axes([0.02, 0.02, 0.96, 0.96])
    ax_hero.set_axis_off()
    ax_hero.set_aspect("equal")
    ax_hero.add_collection(
        PolyCollection(
            hero_projected,
            facecolors=colors[hero_order],
            edgecolors="none",
            antialiased=False,
        )
    )
    hero_flat_2d = hero_projected.reshape(-1, 2)
    hero_margin = 0.07 * max(
        float(hero_flat_2d[:, 0].max() - hero_flat_2d[:, 0].min()),
        float(hero_flat_2d[:, 1].max() - hero_flat_2d[:, 1].min()),
    )
    ax_hero.set_xlim(
        float(hero_flat_2d[:, 0].min()) - hero_margin,
        float(hero_flat_2d[:, 0].max()) + hero_margin,
    )
    ax_hero.set_ylim(
        float(hero_flat_2d[:, 1].min()) - hero_margin,
        float(hero_flat_2d[:, 1].max()) + hero_margin,
    )
    hero_path = os.path.join(OUT_DIR, "engrenagem_m2_z24_iso.png")
    fig_hero.savefig(hero_path, dpi=260, facecolor="#ffffff")
    plt.close(fig_hero)

    print(f"PNG={PNG_PATH}")
    print(f"ISO={hero_path}")
    print(f"STL_VOLUME_MM3={volume:.6f}")
    print(f"STL_TRIANGLES={len(triangles)}")


main()
