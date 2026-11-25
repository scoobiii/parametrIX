#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  console.log('Parametrix CLI\n\n  parametrix diagnose [--max-attempts 1000]\n  parametrix mcp-stdio');
  process.exit(0);
}
if (args[0] === 'diagnose') {
  const result = spawnSync(process.execPath, ['scripts/diagnose-environment.mjs', ...args.slice(1)], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
if (args[0] === 'mcp-stdio') {
  const result = spawnSync('python3', ['scripts/hermes/parametrix_mcp_stdio.py'], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
}
console.error(`Comando desconhecido: ${args[0]}`);
process.exit(2);
