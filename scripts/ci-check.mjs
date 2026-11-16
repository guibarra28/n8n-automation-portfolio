import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { workflows } from './lib/workflows.mjs';

function run(script) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

let drifted = false;
for (const entry of workflows) {
  const built = JSON.stringify(entry.build(), null, 2) + '\n';
  const onDisk = readFileSync(entry.file, 'utf8');
  if (built !== onDisk) {
    console.error(entry.file + ' does not match scripts/lib. Run: node scripts/build-workflows.mjs');
    drifted = true;
  }
}
if (drifted) process.exit(1);

run('scripts/test-guards.mjs');
run('scripts/test-workflows.mjs');
console.log('ci checks passed');
