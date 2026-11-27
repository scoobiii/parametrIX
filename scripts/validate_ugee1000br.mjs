import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const specPath = path.join(root, 'projects/ugee1000br/ugee1000br.rotor.spec.json');
const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
const missing = Object.entries(spec.requiredInputs).filter(([, value]) => value === null || value === '');
const requiredTools = ['k6', 'freecadcmd', 'lean', 'z3'];
const toolStatus = Object.fromEntries(
  requiredTools.map((tool) => [tool, spawnSync('sh', ['-lc', `command -v ${tool}`], { stdio: 'ignore' }).status === 0])
);
const result = {
  schema: 'parametrix-ugee1000br-validation/0.1',
  projectId: spec.projectId,
  status: missing.length ? 'BLOCKED' : 'READY_FOR_ENGINEERING_REVIEW',
  releaseAllowed: false,
  missingInputs: missing.map(([name]) => name),
  dependencies: {
    note: 'PATH presence is not execution evidence; tool gates must be run by CI/host adapters.',
    requiredTools,
    observedEnvironment: toolStatus
  },
  claims: [
    'This artifact is a requirements gate, not a safety certification.',
    'No PASS is emitted for CAD/CAE/CAM, rotor dynamics, overspeed, or normative conformity.'
  ],
  specSha256: crypto.createHash('sha256').update(fs.readFileSync(specPath)).digest('hex')
};
const out = path.join(root, 'projects/ugee1000br/ugee1000br.validation.json');
fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
process.exitCode = missing.length ? 2 : 0;
