import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { workflows } from './lib/workflows.mjs';

for (const entry of workflows) {
  mkdirSync(dirname(entry.file), { recursive: true });
  writeFileSync(entry.file, JSON.stringify(entry.build(), null, 2) + '\n');
  console.log('wrote ' + entry.file);
}
