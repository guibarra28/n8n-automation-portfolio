import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { workflows } from './lib/workflows.mjs';

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error('FAIL ' + message);
  }
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const entry of node) walk(entry, visit);
    return;
  }
  visit(node);
  for (const value of Object.values(node)) walk(value, visit);
}

for (const entry of workflows) {
  const workflow = entry.build();
  const names = new Set(workflow.nodes.map((node) => node.name));
  assert(names.size === workflow.nodes.length, entry.file + ' has duplicate node names');
  assert(workflow.active === false, entry.file + ' must import unpublished');
  assert(workflow.settings.availableInMCP === false, entry.file + ' must not be exposed as an MCP tool');
  assert(workflow.settings.executionOrder === 'v1', entry.file + ' execution order');

  for (const [from, outputs] of Object.entries(workflow.connections)) {
    assert(names.has(from), entry.file + ' connection from unknown node ' + from);
    for (const group of outputs.main || []) {
      for (const link of group) {
        assert(names.has(link.node), entry.file + ' connection to unknown node ' + link.node);
      }
    }
  }

  const webhooks = workflow.nodes.filter((node) => node.type === 'n8n-nodes-base.webhook');
  for (const webhook of webhooks) {
    assert(webhook.parameters.authentication === 'headerAuth', webhook.name + ' must use header auth');
    assert(webhook.parameters.responseMode === 'responseNode', webhook.name + ' must use a respond node');
    assert(webhook.credentials?.httpHeaderAuth?.id === 'PLACEHOLDER', webhook.name + ' credential id');
  }
  if (webhooks.length) {
    assert(workflow.nodes.some((node) => node.type === 'n8n-nodes-base.respondToWebhook'), entry.file + ' missing respond node');
  }

  for (const node of workflow.nodes) {
    if (node.credentials) {
      for (const credential of Object.values(node.credentials)) {
        assert(credential.id === 'PLACEHOLDER', node.name + ' credential id must be PLACEHOLDER');
        assert(!/^[0-9]+$/.test(credential.id), node.name + ' credential id must not be a real numeric id');
      }
    }
    if (node.type === 'n8n-nodes-base.googleSheets' && node.parameters.operation === 'append') {
      assert(node.parameters.options?.cellFormat === 'RAW', node.name + ' must write RAW cells');
    }
    const code = node.parameters?.jsCode || '';
    assert(!code.includes('process.env'), node.name + ' must not read environment variables');
    assert(!code.includes('require('), node.name + ' must not call require');
  }

  let serialized = '';
  walk(workflow, (node) => {
    if (node.authentication === 'none') {
      assert(false, entry.file + ' contains authentication none');
    }
  });
  serialized = JSON.stringify(workflow);
  assert(!serialized.includes('sk' + '-'), entry.file + ' contains a provider token prefix');
  assert(!serialized.includes('xox' + 'b-'), entry.file + ' contains a chat token');
  assert(!serialized.includes('AK' + 'IA'), entry.file + ' contains a cloud key prefix');
  assert(!/ya29\./.test(serialized), entry.file + ' contains a google access token');
  assert(!serialized.includes('BEGIN PRIVATE'), entry.file + ' contains a private key');
  assert(serialized.includes('YOUR_SHEET_ID') || entry.file.includes('error-logger') === false || serialized.includes('YOUR_SHEET_ID'), entry.file + ' sheet placeholder');
  assert(serialized.includes('YOUR_SHEET_ID'), entry.file + ' must keep YOUR_SHEET_ID');
}

const onDiskChecks = [
  ['workflows/leadflow/leadflow.workflow.json', 'function sanitizeCell'],
  ['workflows/ai-lead-summary/ai-lead-summary.workflow.json', 'function parseModelOutput'],
  ['workflows/error-logger/error-logger.workflow.json', 'function redactError'],
];
for (const [file, marker] of onDiskChecks) {
  const text = readFileSync(file, 'utf8');
  JSON.parse(text);
  assert(text.includes(marker), file + ' is missing ' + marker);
  assert(text.includes('"active": false'), file + ' active flag drifted');
}

function walkFiles(dir, found = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue;
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walkFiles(path, found);
    else found.push(path);
  }
  return found;
}

const forbidden = [
  { name: 'private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'aws access key', re: new RegExp('\\bAKIA[0-9A-Z]{16}\\b') },
  { name: 'slack token', re: new RegExp('\\bxox[baprs]-') },
  { name: 'github token', re: new RegExp('\\bgh[pousr]_[A-Za-z0-9]{20,}') },
  { name: 'openai-style key', re: new RegExp('\\bsk-[A-Za-z0-9]{16,}') },
  { name: 'google api key', re: new RegExp('\\bAIza[0-9A-Za-z\\-_]{20,}') },
];

for (const file of walkFiles('.')) {
  if (file.endsWith('.png') || file.endsWith('.jpg') || file.endsWith('.webp')) continue;
  const text = readFileSync(file, 'utf8');
  if (file.endsWith('.json')) {
    try {
      JSON.parse(text);
    } catch (error) {
      assert(false, file + ' is not valid JSON');
    }
  }
  for (const rule of forbidden) {
    if (rule.re.test(text)) assert(false, file + ' matched ' + rule.name);
  }
}

const compose = readFileSync('docker-compose.yml', 'utf8');
assert(compose.includes('127.0.0.1:5678:5678'), 'compose must bind n8n to localhost');
assert(!/0\.0\.0\.0:5678/.test(compose), 'compose must not publish n8n on all interfaces');
assert(!/"5679:5679"/.test(compose) && !/'5679:5679'/.test(compose) && !/\n\s*- ["']?5679:5679/.test(compose), 'compose must not publish the task broker');
assert(!compose.includes('N8N_BASIC_AUTH'), 'basic auth was removed from n8n; do not pretend it is enabled');
assert(!compose.includes('N8N_USER_MANAGEMENT_DISABLED'), 'user management must stay on');
assert(compose.includes('N8N_BLOCK_ENV_ACCESS_IN_NODE'), 'code nodes must not read env');

if (failed > 0) {
  console.error(failed + ' workflow assertion(s) failed');
  process.exit(1);
}
console.log('workflow tests passed');
