#!/usr/bin/env python3
"""Safe Molt/Qwen/OpenAI-compatible runner for Parametrix MCP.

The runner only forwards JSON-RPC to /api/mcp. It never executes a prompt as
shell code. Tool names are allowlisted by PARAMETRIX_ALLOWED_TOOLS, and the
optional LLM mode is used only to propose one MCP tools/call request.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

PARAMETRIX_URL = os.environ.get("PARAMETRIX_URL", "http://127.0.0.1:3000").rstrip("/")
MCP_ENDPOINT = f"{PARAMETRIX_URL}/api/mcp"
MCP_TOKEN = os.environ.get("MCP_TOKEN", "")
DEFAULT_ALLOWED = {
    "cad_get_scoobiii_vuc_proof",
    "cad_evaluate_nurbs_metrics",
    "cad_run_structural_fea",
    "cad_inspect_ipt_step_briefing",
}


def allowed_tools() -> set[str]:
    raw = os.environ.get("PARAMETRIX_ALLOWED_TOOLS", "")
    return {x.strip() for x in raw.split(",") if x.strip()} or DEFAULT_ALLOWED


def post_json(url: str, payload: dict[str, Any], timeout: int = 60) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if MCP_TOKEN and url == MCP_ENDPOINT:
        headers["Authorization"] = f"Bearer {MCP_TOKEN}"
    req = urllib.request.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def mcp_request(method: str, params: dict[str, Any] | None = None, request_id: int = 1) -> dict[str, Any]:
    return post_json(MCP_ENDPOINT, {"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}})


def call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name not in allowed_tools():
        raise ValueError(f"tool não allowlisted: {name}")
    return mcp_request("tools/call", {"name": name, "arguments": arguments}, 2)


def llm_propose(prompt: str, tools: list[dict[str, Any]]) -> dict[str, Any]:
    base = os.environ.get("LLM_BASE_URL") or os.environ.get("QWEN_BASE_URL", "http://127.0.0.1:8080/v1")
    base = base.rstrip("/")
    key = os.environ.get("LLM_API_KEY") or os.environ.get("QWEN_API_KEY", "")
    model = os.environ.get("LLM_MODEL") or os.environ.get("QWEN_MODEL", "qwen2.5-coder-7b-instruct")
    tool_defs = [t for t in tools if t.get("name") in allowed_tools()]
    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Escolha no máximo uma ferramenta Parametrix allowlisted. Nunca proponha shell. Responda usando tool call."},
            {"role": "user", "content": prompt},
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t.get("inputSchema", {"type": "object"}),
                },
            }
            for t in tool_defs
        ],
        "tool_choice": "required",
        "temperature": 0,
    }
    headers = {"Content-Type": "application/json"}
    if key:
        headers["Authorization"] = f"Bearer {key}"
    req = urllib.request.Request(f"{base}/chat/completions", data=json.dumps(body).encode(), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=120) as resp:
        response = json.loads(resp.read().decode())
    message = response.get("choices", [{}])[0].get("message", {})
    tool_calls = message.get("tool_calls", [])
    if len(tool_calls) != 1:
        raise ValueError("LLM não retornou exatamente uma tool call")
    fn = tool_calls[0].get("function", {})
    name = fn.get("name", "")
    args = json.loads(fn.get("arguments", "{}"))
    return call_tool(name, args)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="lista as ferramentas MCP")
    parser.add_argument("--tool", help="chama uma ferramenta allowlisted")
    parser.add_argument("--args-json", default="{}")
    parser.add_argument("--prompt", help="pede ao LLM/Qwen uma única tool call allowlisted")
    args = parser.parse_args()
    if args.list:
        print(json.dumps(mcp_request("tools/list"), ensure_ascii=False))
        return 0
    if args.tool:
        result = call_tool(args.tool, json.loads(args.args_json))
    elif args.prompt:
        catalog = mcp_request("tools/list").get("result", {}).get("tools", [])
        result = llm_propose(args.prompt, catalog)
    else:
        parser.error("use --list, --tool ou --prompt")
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
        print(json.dumps({"error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(2)
