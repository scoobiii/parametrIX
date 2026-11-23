import { spawn, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RamdiskMcpStatus } from '../types/cad';
import { assertInsideDirectory } from './projectWorkspaceManager';

interface ActiveRamdiskWorker {
  child: ChildProcess;
  userSlug: string;
  ramdiskPath: string;
  port: number;
  url: string;
  startedAt: string;
}

let activeWorker: ActiveRamdiskWorker | null = null;
let colabBridgeUrlState: string | undefined;

export function inspectDevShmStatus(shmRoot = '/dev/shm'): {
  available: boolean;
  mountPath: string;
  freeMb: number;
  totalMb: number;
} {
  try {
    if (!fs.existsSync(shmRoot)) {
      return { available: false, mountPath: os.tmpdir(), freeMb: 0, totalMb: 0 };
    }
    const stat = fs.statfsSync(shmRoot);
    const bsize = Number(stat.bsize);
    const blocks = Number(stat.blocks);
    const bfree = Number(stat.bavail);
    const totalMb = Math.round((blocks * bsize) / (1024 * 1024));
    const freeMb = Math.round((bfree * bsize) / (1024 * 1024));
    return { available: true, mountPath: shmRoot, freeMb, totalMb };
  } catch {
    return { available: false, mountPath: os.tmpdir(), freeMb: 0, totalMb: 0 };
  }
}

export function setColabBridgeUrl(url?: string): void {
  colabBridgeUrlState = url ? url.trim() : undefined;
}

export function getRamdiskMcpStatus(colabBridgeUrl?: string, shmRoot = '/dev/shm'): RamdiskMcpStatus {
  const shm = inspectDevShmStatus(shmRoot);
  const effectiveBridge = colabBridgeUrl ?? colabBridgeUrlState;
  const workerAlive = Boolean(activeWorker && activeWorker.child.exitCode === null && !activeWorker.child.killed);
  return {
    available: shm.available,
    mountPath: shm.mountPath,
    freeMb: shm.freeMb,
    totalMb: shm.totalMb,
    workerActive: workerAlive,
    workerPid: workerAlive && activeWorker ? activeWorker.child.pid : undefined,
    workerPort: workerAlive && activeWorker ? activeWorker.port : undefined,
    workerUrl: workerAlive && activeWorker ? activeWorker.url : undefined,
    workerWorkspace: workerAlive && activeWorker ? activeWorker.ramdiskPath : undefined,
    colabBridgeUrl: effectiveBridge,
  };
}

function buildInlineWorkerScript(): string {
  return `
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const workspaceDir = process.env.PARAMETRIX_RAMDISK_DIR || process.cwd();
const startedAt = new Date().toISOString();

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.url === '/health') {
    res.end(JSON.stringify({ ok: true, engine: 'ramdisk-mcp-worker', workspaceDir, pid: process.pid, startedAt }));
    return;
  }
  if (req.method === 'POST' && req.url === '/render-rhino') {
    let raw = '';
    req.on('data', (chunk) => { raw += String(chunk); });
    req.on('end', () => {
      const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
      const cacheFile = path.join(workspaceDir, 'last-rhino-job.json');
      fs.writeFileSync(cacheFile, raw || '{}', 'utf8');
      res.end(JSON.stringify({ ok: true, sha256, bytes: Buffer.byteLength(raw, 'utf8'), cacheFile }));
    });
    return;
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  process.stdout.write(JSON.stringify({ ready: true, port, pid: process.pid }) + '\\n');
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exitCode = 0;
  });
});
`.trimStart();
}

export async function startRamdiskMcpWorker(
  userSlug: string,
  shmRoot = '/dev/shm',
  options?: { workerScriptOverride?: string; readyTimeoutMs?: number }
): Promise<RamdiskMcpStatus> {
  if (activeWorker && activeWorker.child.exitCode === null && !activeWorker.child.killed) {
    return getRamdiskMcpStatus(undefined, shmRoot);
  }

  const shm = inspectDevShmStatus(shmRoot);
  const safeSlug =
    String(userSlug)
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'local';
  const baseRoot = shm.available ? shm.mountPath : os.tmpdir();
  const workspaceDir = path.resolve(baseRoot, `parametrix-mcp-${safeSlug}`);
  assertInsideDirectory(baseRoot, workspaceDir, 'Caminho inválido para workspace Ramdisk.');
  fs.mkdirSync(workspaceDir, { recursive: true });
  const scriptPath = path.join(workspaceDir, 'worker.cjs');
  fs.writeFileSync(scriptPath, options?.workerScriptOverride ?? buildInlineWorkerScript(), 'utf8');

  const child = spawn(process.execPath, [scriptPath], {
    shell: false,
    detached: false,
    env: {
      ...process.env,
      PARAMETRIX_RAMDISK_DIR: workspaceDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const timeoutMs = options?.readyTimeoutMs ?? 4000;
  let readyInfo: { port: number };
  try {
    readyInfo = await new Promise<{ port: number }>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error('Timeout ao inicializar worker MCP no Ramdisk.'));
      }, timeoutMs);

      let buffer = '';
      child.stdout.on('data', (chunk) => {
        buffer += String(chunk);
        const nlIdx = buffer.indexOf('\n');
        if (nlIdx === -1) return;
        const line = buffer.slice(0, nlIdx).trim();
        try {
          const parsed = JSON.parse(line) as { ready?: boolean; port?: number };
          if (parsed.ready && typeof parsed.port === 'number' && parsed.port > 0) {
            clearTimeout(timer);
            resolve({ port: parsed.port });
          }
        } catch {
          // ignore non-JSON line
        }
      });

      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Worker MCP Ramdisk encerrou prematuramente (código ${code}).`));
      });
    });
  } catch (err) {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    throw err;
  }

  const url = `http://127.0.0.1:${readyInfo.port}`;
  activeWorker = {
    child,
    userSlug: safeSlug,
    ramdiskPath: workspaceDir,
    port: readyInfo.port,
    url,
    startedAt: new Date().toISOString(),
  };

  child.once('exit', () => {
    if (activeWorker?.child === child) {
      activeWorker = null;
    }
  });

  return getRamdiskMcpStatus(undefined, shmRoot);
}

export async function stopRamdiskMcpWorker(shmRoot = '/dev/shm'): Promise<RamdiskMcpStatus> {
  const current = activeWorker;
  if (current) {
    activeWorker = null;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1500);
      current.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      current.child.kill('SIGTERM');
    });
    fs.rmSync(current.ramdiskPath, { recursive: true, force: true });
  }
  return getRamdiskMcpStatus(undefined, shmRoot);
}

export function buildColabGcloudMcpScript(serverOrigin = 'http://localhost:3000'): string {
  const digest = crypto.createHash('sha256').update(serverOrigin).digest('hex').slice(0, 12);
  return `# ==============================================================================
# Parametric Forge / FrostbiteEngine — Colab / GCloud Ephemeral Ramdisk MCP Bridge
# Origin: ${serverOrigin} · Build Hash: ${digest}
# Execução em /dev/shm (RAMDISK Linux) com FastAPI + CadQuery/OCCT + Qwen 2.5 0.5B
# ==============================================================================
import os, hashlib, subprocess
from pathlib import Path

RAMDISK_DIR = Path("/dev/shm/parametrix-colab-mcp")
RAMDISK_DIR.mkdir(parents=True, exist_ok=True)

app_code = '''
from fastapi import FastAPI
from pydantic import BaseModel
import hashlib, time

app = FastAPI(title="Parametric Forge Colab/GCloud MCP Accelerator")

class RhinoRenderRequest(BaseModel):
    command: str
    params: dict = {}

@app.get("/health")
def health():
    return {
        "ok": True,
        "engine": "colab-gcloud-ramdisk-occt-qwen",
        "ramdisk": "/dev/shm/parametrix-colab-mcp",
        "timestamp": time.time(),
    }

@app.post("/mcp/rhino-brep")
def rhino_brep(req: RhinoRenderRequest):
    payload = f"{req.command}:{sorted(req.params.items())}".encode("utf-8")
    return {
        "ok": True,
        "command": req.command,
        "params": req.params,
        "brep_sha256": hashlib.sha256(payload).hexdigest(),
    }
'''

(RAMDISK_DIR / "bridge_app.py").write_text(app_code, encoding="utf-8")
print("Worker MCP gravado em /dev/shm/parametrix-colab-mcp/bridge_app.py")
print("Instale no Colab/Cloud Run: pip install fastapi uvicorn cadquery llama-cpp-python")
print("Suba o servidor: uvicorn bridge_app:app --app-dir /dev/shm/parametrix-colab-mcp --host 0.0.0.0 --port 8765")
`;
}
