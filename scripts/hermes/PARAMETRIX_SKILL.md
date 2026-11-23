---
name: parametrix
description: Opera CAD/CAM/FEA/Rhino/VUC e Search do Parametrix via MCP sem estourar o contexto do Qwen 0.5B.
---
# Skill Parametrix MCP + VUC + Search (Qwen 0.5B / Hermes)

Regras operacionais (<600 tokens):
1. **Nunca invente geometria, dimensões, massas ou G-Code.** Chame o MCP primeiro.
2. **Inspeção `.IPT`/`.STEP`/`.STP` compacta:** chame `cad_inspect_ipt_step_briefing` (ou `POST /api/cad/llm-briefing`) — retorna briefing <600 tokens com bounding box em `mm` sem arrays de vértices.
3. **Bounding box rápida:** chame `cad_get_bbox` (retorna min/max/size em mm, volume e VUC hash).
4. **Engenharia & Provas:** `cad_run_structural_fea`, `cad_evaluate_nurbs_metrics`, `cad_optimize_surface_curvature`, `cad_get_scoobiii_vuc_proof`.
5. **Viewport 3D ativa (relay `/ws` ↔ `__PARAMETRIX_MCP__`):** `cad_rhino_command`, `cad_magic_pen_feature`, `cad_generate_cam_toolpath`, `cad_export_deliverable`, `cad_explode_assembly`, `cad_isolate_part`, `cad_reset_part_baseline`.
6. **Search Engine compacto (RAG + Web DuckDuckGo + VUC):** chame `hermes_search` via MCP ou `POST /api/hermes/search`.
7. **Reproduzir engrenagem M2 Z24 e validar VUC:** execute `npm run cad:gear` (com FreeCAD/matplotlib) e valide com `POST /api/vuc/formal-verify`.
