import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import type { FormalVucCertificate } from '../types/cad';
import { canonicalSerialize } from '../kernel/vucHash';

export function sha256Hex(raw: string | Buffer): string {
  return crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
}

export function getSafeGitCommit(fallback = 'local-working-tree', cwd?: string): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 1500,
    })
      .toString('utf8')
      .trim();
  } catch {
    return fallback;
  }
}

export interface CreateFormalVucOptions {
  domain: string;
  status: 'PASS' | 'FAIL';
  inputPayload: unknown;
  outputPayload: unknown;
  durationMs: number;
  runner?: string;
  commitSha?: string;
  processVersion?: string;
  timestampIso?: string;
}

export function createFormalVucCertificate(opts: CreateFormalVucOptions): FormalVucCertificate {
  const timestamp = opts.timestampIso ?? new Date().toISOString();
  const commit = opts.commitSha ?? getSafeGitCommit();
  const runner =
    opts.runner ??
    (process.env.GITHUB_ACTIONS === 'true' ? 'github-actions-ubuntu' : 'local-sandbox');
  const nodeVersion = opts.processVersion ?? process.version;

  const hash_input = sha256Hex(
    Buffer.isBuffer(opts.inputPayload) ? opts.inputPayload : canonicalSerialize(opts.inputPayload)
  );
  const hash_output = sha256Hex(
    Buffer.isBuffer(opts.outputPayload) ? opts.outputPayload : canonicalSerialize(opts.outputPayload)
  );
  const hash_processo = sha256Hex(
    canonicalSerialize({
      domain: opts.domain,
      nodeVersion,
      commit,
      timestamp,
    })
  );

  const signingMessage = Buffer.from(`${hash_input}:${hash_output}:${hash_processo}`, 'utf8');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const signatureBuf = crypto.sign(null, signingMessage, privateKey);
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  return {
    vuc_id: `VUC-ED25519-${hash_processo.slice(0, 16)}`,
    domain: opts.domain,
    status: opts.status,
    hash_input,
    hash_output,
    hash_processo,
    commit,
    runner,
    node_version: nodeVersion,
    duracao_ms: Math.max(0, Math.round(opts.durationMs)),
    timestamp,
    assinatura_ed25519: signatureBuf.toString('base64url'),
    public_key_pem: publicKeyPem,
  };
}

export function verifyFormalVucCertificate(
  cert: FormalVucCertificate,
  rawInput?: unknown,
  rawOutput?: unknown
): { valid: boolean; reason: string } {
  if (rawInput !== undefined) {
    const expectedIn = sha256Hex(
      Buffer.isBuffer(rawInput) ? rawInput : canonicalSerialize(rawInput)
    );
    if (expectedIn !== cert.hash_input) {
      return { valid: false, reason: 'hash_input diverge do artefato de entrada.' };
    }
  }

  if (rawOutput !== undefined) {
    const expectedOut = sha256Hex(
      Buffer.isBuffer(rawOutput) ? rawOutput : canonicalSerialize(rawOutput)
    );
    if (expectedOut !== cert.hash_output) {
      return { valid: false, reason: 'hash_output diverge do artefato de saída.' };
    }
  }

  try {
    const signingMessage = Buffer.from(
      `${cert.hash_input}:${cert.hash_output}:${cert.hash_processo}`,
      'utf8'
    );
    const sigBuf = Buffer.from(cert.assinatura_ed25519, 'base64url');
    const ok = crypto.verify(null, signingMessage, cert.public_key_pem, sigBuf);
    return ok
      ? { valid: true, reason: 'Assinatura Ed25519 e hashes SHA-256 verificados.' }
      : { valid: false, reason: 'Assinatura Ed25519 inválida para os hashes informados.' };
  } catch {
    return { valid: false, reason: 'Chave pública ou assinatura Ed25519 malformada.' };
  }
}
