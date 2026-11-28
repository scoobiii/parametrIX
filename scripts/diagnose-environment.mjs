#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const maxIndex = argv.indexOf('--max-attempts');
const requested = maxIndex >= 0 ? Number(argv[maxIndex + 1]) : 1000;
const maxAttempts = Number.isFinite(requested) ? Math.max(1, Math.min(1000, requested)) : 1000;
const ci = argv.includes('--ci');
const checks = [
  ['node', ['--version'], 'runtime'],
  ['npm', ['--version'], 'package-manager'],
  ['python3', ['--version'], 'bridge'],
  ['git', ['--version'], 'source-control'],
  ['qwen', ['--version'], 'optional-llm'],
  ['bend', ['--version'], 'optional-hvm'],
  ['freecadcmd', ['--version'], 'optional-cad'],
  ['k6', ['version'], 'optional-load-test'],
];
const observations = [];
let attempts = 0;
for (const [command, args, role] of checks) {
  if (attempts >= maxAttempts) break;
  attempts += 1;
  try {
    const output = execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 }).trim();
    observations.push({ command, role, available: true, output: output.slice(0, 200) });
  } catch (error) {
    observations.push({ command, role, available: false, reason: error?.code === 'ENOENT' ? 'not-installed' : 'unavailable-or-failed' });
  }
}
const required = observations.filter((item) => ['runtime', 'package-manager', 'bridge', 'source-control'].includes(item.role));
const result = {
  schema: 'parametrix.environment.v1',
  maxAttempts,
  attempts,
  mode: ci ? 'ci' : 'diagnostic',
  platform: { os: process.platform, arch: process.arch, node: process.version },
  backends: observations.filter((item) => item.available && item.role.startsWith('optional-')).map((item) => item.command),
  checks: observations,
  status: required.every((item) => item.available) ? 'PASS' : 'BLOCKED',
  policy: 'No blind installation or silent fallback. Optional binaries are reported and enabled only after real capability checks.',
};
mkdirSync('proof', { recursive: true });
writeFileSync('proof/environment-diagnostic.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
process.exit(result.status === 'PASS' ? 0 : ci ? 1 : 0);
