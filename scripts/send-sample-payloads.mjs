#!/usr/bin/env node
/**
 * Send the sample JSON payloads to a webhook.
 *
 *   WEBHOOK_URL=http://127.0.0.1:5678/webhook-test/leadflow \
 *   WEBHOOK_SECRET=replace-with-the-header-value \
 *   node scripts/send-sample-payloads.mjs
 *
 *   AI_WEBHOOK_URL=http://127.0.0.1:5678/webhook-test/lead-summary \
 *   WEBHOOK_SECRET=... \
 *   node scripts/send-sample-payloads.mjs --dir scripts/payloads/ai-summary
 *
 * WEBHOOK_HEADER_NAME defaults to X-Webhook-Secret.
 * AI_WEBHOOK_SECRET overrides WEBHOOK_SECRET for the AI payloads.
 * Redirects are not followed, so the secret is not replayed to another host.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

const dir = arg('--dir', 'scripts/payloads/leadflow');
const usingAi = dir.includes('ai-summary');
const urlValue = usingAi ? (process.env.AI_WEBHOOK_URL || process.env.WEBHOOK_URL) : process.env.WEBHOOK_URL;
const secret = usingAi ? (process.env.AI_WEBHOOK_SECRET || process.env.WEBHOOK_SECRET) : process.env.WEBHOOK_SECRET;
const headerName = process.env.WEBHOOK_HEADER_NAME || 'X-Webhook-Secret';

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!urlValue) fail('Set WEBHOOK_URL (or AI_WEBHOOK_URL for the AI payloads).');
if (!secret) fail('Set WEBHOOK_SECRET to the header value stored in the n8n Header Auth credential.');
if (secret === 'replace-with-the-header-value' || secret.startsWith('replace-with-')) {
  fail('WEBHOOK_SECRET is still the example placeholder.');
}

let target;
try {
  target = new URL(urlValue);
} catch (error) {
  fail('WEBHOOK_URL is not a URL.');
}
if (target.protocol !== 'http:' && target.protocol !== 'https:') fail('WEBHOOK_URL must be http or https.');
if (target.username || target.password) fail('WEBHOOK_URL must not contain a username or password.');
if (target.hostname !== '127.0.0.1' && target.hostname !== 'localhost') {
  console.error('Warning: WEBHOOK_URL is not localhost. Send only if this instance is yours.');
}

const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
const present = new Set(readdirSync(dir).filter((name) => name.endsWith('.json') && name !== 'manifest.json'));
for (const entry of manifest) {
  if (!present.has(entry.file)) fail('Manifest lists a missing file: ' + entry.file);
}

let mismatches = 0;
for (const entry of manifest) {
  const payload = readFileSync(join(dir, entry.file));
  let response;
  try {
    response = await fetch(target, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/json',
        [headerName]: secret,
      },
      body: payload,
    });
  } catch (error) {
    console.error(entry.file + ' network error: ' + (error && error.message ? error.message : 'request failed'));
    mismatches += 1;
    continue;
  }
  const text = await response.text();
  const preview = text.replace(/\s+/g, ' ').slice(0, 300);
  const ok = entry.expect.includes(response.status);
  if (!ok) mismatches += 1;
  console.log((ok ? 'ok  ' : 'DIFF') + ' ' + response.status + ' ' + entry.file + ' ' + preview);
  if (response.status >= 300 && response.status < 400) {
    console.error(entry.file + ' redirected. The script did not follow it.');
  }
}

if (mismatches > 0) {
  console.error(mismatches + ' payload(s) did not match the expected HTTP status.');
  process.exit(1);
}
console.log('All payloads returned an expected HTTP status.');
