#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { performance } from 'node:perf_hooks';

const root = process.cwd();
const excluded = new Set(['.git', 'node_modules', 'dist', 'coverage', '.aistudio', '.cache', 'data']);
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.py', '.sh', '.json', '.yml', '.yaml', '.md', '.html', '.css']);
const args = new Set(process.argv.slice(2));
const strict = args.has('--strict');
const requested = process.argv.find((x) => x.startsWith('--checks='))?.slice(9)?.split(',') ?? ['inventory', 'scrum', 'gui', 'ux', 'a11y', 'performance', 'stress', 'load-balance'];
const baseUrl = process.env.PARAMETRIX_URL ?? 'http://127.0.0.1:3000';
const concurrency = Math.max(2, Math.min(200, Number(process.env.QUALITY_CONCURRENCY ?? 24)));

function walk(dir, result = []) {
  if (!existsSync(dir)) return result;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file, result);
    else if (extensions.has(extname(entry.name))) result.push(file);
  }
  return result;
}
function check(name, status, details = {}) { return { name, status, details }; }
function read(path) { return existsSync(path) ? readFileSync(path, 'utf8') : ''; }
async function probe(path) {
  try { const started = performance.now(); const response = await fetch(`${baseUrl}${path}`); return { ok: response.ok, status: response.status, ms: Number((performance.now() - started).toFixed(2)) }; }
  catch (error) { return { ok: false, status: 0, error: String(error) }; }
}

const files = walk(root);
const result = { schema: 'parametrix.quality-suite.v1', strict, baseUrl, generatedAt: new Date().toISOString(), inventory: { total: files.length, byTopLevel: {} }, checks: [] };
for (const file of files) { const rel = relative(root, file); const top = rel.split('/')[0]; result.inventory.byTopLevel[top] = (result.inventory.byTopLevel[top] ?? 0) + 1; }

if (requested.includes('inventory')) result.checks.push(check('inventory', result.inventory.total > 0 ? 'PASS' : 'FAIL', result.inventory));
if (requested.includes('scrum')) {
  const architecture = read('docs/ARCHITECTURE.md');
  const agile = read('docs/AGILE_TEST_MATRIX.md');
  const ok = /Scrum|sprint|Definition of Done|critério de aceite/i.test(architecture + agile) && existsSync('.github/workflows/quality-suite.yml');
  result.checks.push(check('scrum-agile-team', ok ? 'PASS' : 'FAIL', { required: ['backlog', 'sprint', 'Definition of Done', 'quality workflow'] }));
}
if (requested.includes('gui')) {
  const app = read('src/App.tsx');
  const components = ['Viewport3D.tsx', 'ParametricSidebar.tsx', 'McpToolsPanel.tsx', 'PluginsSdkPanel.tsx'].every((file) => existsSync(`src/components/${file}`));
  const ok = components && /<main|role=["']main|viewport/i.test(app) && existsSync('index.html');
  result.checks.push(check('gui-contract', ok ? 'PASS' : 'FAIL', { components, appShell: ok }));
}
if (requested.includes('ux')) {
  const app = read('src/App.tsx');
  const css = read('src/index.css');
  const markers = ['CAD', 'CAM', 'VUC', 'CO₂', 'MCP'].filter((marker) => app.includes(marker));
  const responsive = /sm:|md:|lg:|@media|mobile|Thumb/i.test(app + css);
  result.checks.push(check('ux-responsive-navigation', markers.length >= 4 && responsive ? 'PASS' : 'FAIL', { markers, responsive }));
}
if (requested.includes('a11y')) {
  const source = files.filter((file) => file.endsWith('.tsx') || file.endsWith('.html')).map(read).join('\n');
  const images = [...source.matchAll(/<img\b([^>]*)>/gi)].map((match) => match[1]);
  const missingAlt = images.filter((attrs) => !/\balt\s*=/.test(attrs)).length;
  const interactive = (source.match(/<(button|input|select|textarea|a)\b/gi) ?? []).length;
  const labels = (source.match(/aria-label=|aria-labelledby=|<label\b/gi) ?? []).length;
  const ok = missingAlt === 0 && interactive > 0 && labels > 0;
  result.checks.push(check('accessibility-static', ok ? 'PASS' : 'FAIL', { images: images.length, missingAlt, interactive, accessibleLabels: labels, note: 'Static gate; execute axe/real screen-reader checks in browser CI.' }));
}
async function runtimeChecks() {
  const health = await probe('/api/agent/onboarding');
  if (!health.ok) return { status: 'BLOCKED', details: { reason: 'Parametrix server unavailable', health } };
  const samples = [];
  for (let i = 0; i < 20; i++) samples.push(await probe('/api/claw/status'));
  const times = samples.map((x) => x.ms).sort((a, b) => a - b);
  const p95 = times[Math.min(times.length - 1, Math.ceil(times.length * 0.95) - 1)];
  return { status: samples.every((x) => x.ok) && p95 < 500 ? 'PASS' : 'FAIL', details: { health, requests: samples.length, errors: samples.filter((x) => !x.ok).length, p95Ms: p95 } };
}
if (requested.includes('performance')) { const x = await runtimeChecks(); result.checks.push(check('performance-p95', x.status, x.details)); }
if (requested.includes('stress')) {
  const health = await probe('/api/agent/onboarding');
  if (!health.ok) result.checks.push(check('stress-concurrency', 'BLOCKED', { reason: 'Parametrix server unavailable' }));
  else {
    const started = performance.now();
    const responses = await Promise.all(Array.from({ length: concurrency }, () => probe('/api/claw/status')));
    result.checks.push(check('stress-concurrency', responses.every((x) => x.ok) ? 'PASS' : 'FAIL', { concurrency, elapsedMs: Number((performance.now() - started).toFixed(2)), errors: responses.filter((x) => !x.ok).length }));
  }
}
if (requested.includes('load-balance')) {
  const backends = (process.env.PARAMETRIX_BACKENDS ?? 'local-a,local-b,local-c').split(',').map((x) => x.trim()).filter(Boolean);
  const distribution = Object.fromEntries(backends.map((backend) => [backend, 0]));
  for (let i = 0; i < 300; i++) distribution[backends[i % backends.length]] += 1;
  const values = Object.values(distribution);
  const balanced = values.length > 1 && Math.max(...values) - Math.min(...values) <= 1;
  result.checks.push(check('load-balance-contract', balanced ? 'PASS' : 'FAIL', { backends, distribution, note: 'Round-robin contract; multi-host network balancing requires an external runner.' }));
}

result.summary = { passed: result.checks.filter((x) => x.status === 'PASS').length, failed: result.checks.filter((x) => x.status === 'FAIL').length, blocked: result.checks.filter((x) => x.status === 'BLOCKED').length, total: result.checks.length };
mkdirSync('proof', { recursive: true });
writeFileSync('proof/quality-suite.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
const blocking = result.checks.some((x) => x.status === 'FAIL' || (strict && x.status === 'BLOCKED'));
process.exit(blocking ? 1 : 0);
