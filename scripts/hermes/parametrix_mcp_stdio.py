#!/usr/bin/env python3
"""Bridge STDIO MCP (JSON-RPC 2.0) -> Parametrix HTTP /api/mcp (zero external deps)."""
import json
import os
import sys
import urllib.error
import urllib.request

PARAMETRIX_URL = os.environ.get("PARAMETRIX_URL", "http://127.0.0.1:3000").rstrip("/")
MCP_ENDPOINT = f"{PARAMETRIX_URL}/api/mcp"


def main() -> None:
    for raw in sys.stdin:
        line = raw.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as exc:
            sys.stdout.write(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": None,
                        "error": {"code": -32700, "message": f"Invalid JSON: {exc}"},
                    }
                )
                + "\n"
            )
            sys.stdout.flush()
            continue

        method = str(req.get("method", ""))
        if req.get("id") is None and method.startswith("notifications/"):
            continue

        body = json.dumps(req).encode("utf-8")
        http_req = urllib.request.Request(
            MCP_ENDPOINT,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(http_req, timeout=25) as resp:
                sys.stdout.write(resp.read().decode("utf-8").strip() + "\n")
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            sys.stdout.write(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": req.get("id"),
                        "error": {"code": -32000, "message": f"HTTP {exc.code}: {err_body}"},
                    }
                )
                + "\n"
            )
        except Exception as exc:
            sys.stdout.write(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": req.get("id"),
                        "error": {"code": -32000, "message": str(exc)},
                    }
                )
                + "\n"
            )
        sys.stdout.flush()


if __name__ == "__main__":
    main()
