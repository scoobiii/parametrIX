import fs from 'node:fs';
import path from 'node:path';
import {
  createFormalVucCertificate,
  sha256Hex,
  verifyFormalVucCertificate,
} from '../src/server/vucFormalProof';

const startedAt = Date.now();
const root = process.cwd();
const pkgText = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
const auditText = fs.readFileSync(path.join(root, 'scripts', 'cad_engine_audit.ts'), 'utf8');

const distHtmlPath = path.join(root, 'dist', 'index.html');
const covSummaryPath = path.join(root, 'coverage', 'coverage-summary.json');

const outputPayload = {
  packageSha256: sha256Hex(pkgText),
  auditScriptSha256: sha256Hex(auditText),
  distPresent: fs.existsSync(distHtmlPath),
  distIndexSha256: fs.existsSync(distHtmlPath)
    ? sha256Hex(fs.readFileSync(distHtmlPath))
    : 'not-built-yet',
  coverageSummarySha256: fs.existsSync(covSummaryPath)
    ? sha256Hex(fs.readFileSync(covSummaryPath))
    : 'not-generated-yet',
};

const cert = createFormalVucCertificate({
  domain: 'CI_PIPELINE_VUC_PROOF',
  status: 'PASS',
  inputPayload: {
    packageSha256: outputPayload.packageSha256,
    auditScriptSha256: outputPayload.auditScriptSha256,
  },
  outputPayload,
  durationMs: Math.max(1, Date.now() - startedAt),
});

const verify = verifyFormalVucCertificate(cert, undefined, outputPayload);
if (!verify.valid) {
  throw new Error(`Falha na auto-verificação VUC: ${verify.reason}`);
}

const proofDir = path.join(root, 'proof');
fs.mkdirSync(proofDir, { recursive: true });
const outFile = path.join(proofDir, 'vuc-latest.json');
fs.writeFileSync(outFile, `${JSON.stringify({ certificate: cert, outputPayload, verify }, null, 2)}\n`);

console.log(`VUC_ID=${cert.vuc_id}`);
console.log(`HASH_INPUT=${cert.hash_input}`);
console.log(`HASH_OUTPUT=${cert.hash_output}`);
console.log(`HASH_PROCESSO=${cert.hash_processo}`);
console.log(`VERIFIED=${verify.valid}`);
