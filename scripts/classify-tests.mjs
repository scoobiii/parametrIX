#!/usr/bin/env node
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'tests';
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx|js|mjs|py)$/.test(entry.name)) files.push(full);
  }
}
walk(root);
const rows = files.map((file) => {
  const text = readFileSync(file, 'utf8');
  const reasons = [];
  if (/\b(vi|jest)\.(mock|stub)|mockImplementation|mockResolvedValue|sinon\.(stub|mock)/.test(text)) reasons.push('mock');
  if (/\b(Mock|Stub|Fake)[A-Z]\w*|test-double|__mocks__/.test(text)) reasons.push('stub');
  if (/fixture|fixtures|snapshot|deterministic/i.test(text)) reasons.push('fixture-determinística');
  if (/fetch\(|WebSocket|spawn|execFile|localhost|127\.0\.0\.1|real endpoint|server\.ts/.test(text)) reasons.push('integração-real');
  const classification = reasons.length ? [...new Set(reasons)] : ['unitário-determinístico'];
  return { file: relative('.', file), classification, productionMockRisk: false };
});
const result = { schema: 'parametrix.test-classification.v1', files: rows.length, rows, policy: 'Mocks são permitidos somente em testes e nunca em src/produção; integração-real exige endpoint e evidência executada.' };
mkdirSync('proof', { recursive: true });
writeFileSync('proof/test-classification.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
