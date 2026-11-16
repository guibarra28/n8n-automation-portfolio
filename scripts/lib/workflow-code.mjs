import { readFileSync } from 'node:fs';

const guardsRuntime = readFileSync(new URL('./guards.mjs', import.meta.url), 'utf8')
  .replace(/^export function /gm, 'function ')
  .replace(/^export const /gm, 'const ');

function banner(lines) {
  return '/**\n' + lines.map((line) => ' * ' + line).join('\n') + '\n */\n';
}

function withGuards(header, glue) {
  return header + '\n' + guardsRuntime + '\n' + glue;
}

export function leadflowNormalizeCode(settings) {
  const header = banner([
    'EDIT AFTER IMPORT',
    'sheetId is the spreadsheet id only (the path segment in the Google Sheets URL).',
    'Do not put API keys, OAuth client secrets, or the webhook secret in this node.',
    'Routing rules, budget tiers, and service aliases live in the Categorize lead node.',
  ]) + 'const SETTINGS = ' + JSON.stringify(settings, null, 2) + ';\n';
  const glue = `
const item = $input.first().json;
const extracted = extractBody(item, SETTINGS.limits.maxBodyChars);
if (extracted.error) {
  return [{
    json: {
      valid: false,
      stage: 'validated',
      errors: [extracted.error],
      settings: SETTINGS,
      rejection: {
        received_at: new Date().toISOString(),
        reasons: sanitizeCell(extracted.error),
        email: '',
      },
    },
  }];
}
const result = validateLead(extracted.body, SETTINGS.limits);
return [{
  json: {
    valid: result.valid,
    stage: 'validated',
    errors: result.errors || [],
    settings: SETTINGS,
    lead: result.lead || null,
    rejection: result.rejection || null,
  },
}];
`;
  return withGuards(header, glue);
}

export function leadflowCategorizeCode(aliases, tiers, rules) {
  const header = banner([
    'EDIT AFTER IMPORT — this is the routing configuration.',
    'First matching rule wins. tiers: null matches every budget tier.',
    'Budget max is exclusive. null max means no upper bound.',
    'Unknown service text becomes "other" via ALIASES.',
    'Do not put secrets in this node.',
  ])
    + 'const ALIASES = ' + JSON.stringify(aliases, null, 2) + ';\n'
    + 'const BUDGET_TIERS = ' + JSON.stringify(tiers, null, 2) + ';\n'
    + 'const RULES = ' + JSON.stringify(rules, null, 2) + ';\n';
  const glue = `
const normalized = $('Normalize and validate').first().json;
const lead = normalized.lead;
const lookup = classifyLookup($input.all().map((entry) => entry.json), lead.email_key);
if (lookup.failed) {
  return [{ json: { failed: true, failure: 'lookup', settings: normalized.settings } }];
}
const amount = lead.budget_amount === '' ? null : Number(lead.budget_amount);
const tier = budgetTier(amount, BUDGET_TIERS);
const serviceNormalized = normalizeService(lead.service_input, ALIASES);
const category = categorize(serviceNormalized, tier, RULES);
const duplicate = lookup.duplicate;
const base = {
  received_at: lead.received_at,
  lead_id: lead.lead_id,
  name: lead.name,
  email: lead.email,
  phone: lead.phone,
  company: lead.company,
  service: lead.service,
};
const leadRow = {
  received_at: base.received_at,
  lead_id: base.lead_id,
  name: base.name,
  email: base.email,
  phone: base.phone,
  company: base.company,
  service: base.service,
  service_normalized: serviceNormalized,
  budget_raw: lead.budget_raw,
  budget_amount: lead.budget_amount,
  budget_tier: tier,
  message: lead.message,
  category: category.id,
  priority: category.priority,
  owner_queue: category.queue,
  source: 'webhook',
  status: 'new',
};
const duplicateRow = {
  received_at: base.received_at,
  lead_id: base.lead_id,
  matched_lead_id: lookup.matchedLeadId,
  name: base.name,
  email: base.email,
  phone: base.phone,
  company: base.company,
  service: base.service,
  budget_raw: lead.budget_raw,
  message: lead.message,
  category: category.id,
  priority: category.priority,
  owner_queue: category.queue,
  note: 'same email already exists',
};
const token = safeToken(category.id);
return [{
  json: {
    failed: false,
    duplicate,
    settings: normalized.settings,
    leadRow,
    duplicateRow,
    sendLeadAck: normalized.settings.sendLeadAck === true,
    notifyTeamEmail: normalized.settings.notifyTeamEmail === true,
    notifySlack: normalized.settings.notifySlack === true,
    ackTo: lead.email_key,
    ackSubject: duplicate ? 'We already have your inquiry' : 'We received your inquiry',
    ackHtml: leadAckHtml(lead.html.name, duplicate),
    teamSubject: (duplicate ? 'Duplicate lead: ' : 'New lead: ') + token,
    teamHtml: teamLeadHtml(lead, category, duplicate),
    slackText: teamSlackText(lead, category, duplicate),
  },
}];
`;
  return withGuards(header, glue);
}

export function leadflowConfirmCode() {
  return withGuards(
    banner(['Treat a pass-through of the categorize item as a failed sheet write.']),
    `
const item = $input.first().json;
const categorized = $('Categorize lead').first().json;
if (sheetWriteFailed(item)) {
  const failure = categorized.duplicate ? 'duplicate-save' : 'save';
  return [{ json: { failed: true, failure, settings: categorized.settings } }];
}
return [{ json: { failed: false } }];
`,
  );
}

export function leadflowFailureCode() {
  return withGuards(
    banner(['Log a fixed reason code. Do not copy provider error text into the sheet or the HTTP response.']),
    `
const item = $input.first().json;
const row = {
  received_at: new Date().toISOString(),
  workflow_name: 'LeadFlow',
  node_name: sanitizeCell(item.failure || 'unknown'),
  message_redacted: 'external_call_failed',
  execution_id: '',
};
return [{ json: { row, settings: item.settings } }];
`,
  );
}

export function leadflowDeliveryCode() {
  return withGuards(
    banner(['A missing provider id means that notification did not confirm. The caller still receives 200 if the lead row was saved.']),
    `
function nodeJson(name) {
  try {
    const data = $(name).first();
    return data && data.json ? data.json : null;
  } catch (error) {
    return null;
  }
}
const categorized = $('Categorize lead').first().json;
const problems = [];
if (categorized.sendLeadAck) {
  const sent = nodeJson('Email the lead');
  if (!sent || !sent.threadId) problems.push('ack');
}
if (categorized.notifyTeamEmail) {
  const sent = nodeJson('Email the team');
  if (!sent || !sent.threadId) problems.push('team-email');
}
if (categorized.notifySlack) {
  const sent = nodeJson('Post to Slack');
  if (!sent || !sent.ts) problems.push('slack');
}
if (problems.length) {
  return [{
    json: {
      failed: true,
      failure: 'delivery:' + problems.join('+'),
      settings: categorized.settings,
    },
  }];
}
return [{ json: { failed: false } }];
`,
  );
}

export function aiValidateCode(settings) {
  const header = banner([
    'EDIT AFTER IMPORT',
    'llmUrl must be an https URL with no username or password.',
    'The bearer token stays in the LLM Bearer Auth credential, not in this node.',
    'sheetId is YOUR_SHEET_ID until you replace it with the real spreadsheet id.',
  ]) + 'const SETTINGS = ' + JSON.stringify(settings, null, 2) + ';\n';
  const glue = `
const item = $input.first().json;
const urlCheck = assertHttpsUrl(SETTINGS.llmUrl);
if (!urlCheck.ok) {
  return [{
    json: {
      valid: false,
      configError: true,
      failure: 'configuration',
      stage: 'validated',
      errors: ['configuration_error'],
      settings: SETTINGS,
    },
  }];
}
const extracted = extractBody(item, SETTINGS.limits.maxBodyChars);
if (extracted.error) {
  return [{
    json: {
      valid: false,
      configError: false,
      stage: 'validated',
      errors: [extracted.error],
      settings: SETTINGS,
      rejection: {
        received_at: new Date().toISOString(),
        reasons: sanitizeCell(extracted.error),
        email: '',
      },
    },
  }];
}
const result = validateLead(extracted.body, SETTINGS.limits);
if (!result.valid) {
  return [{
    json: {
      valid: false,
      configError: false,
      stage: 'validated',
      errors: result.errors,
      settings: SETTINGS,
      rejection: result.rejection,
    },
  }];
}
const prompt = buildLeadPrompt(result.lead);
return [{
  json: {
    valid: true,
    configError: false,
    stage: 'validated',
    errors: [],
    settings: SETTINGS,
    lead: result.lead,
    llmUrl: urlCheck.url,
    llmBody: llmRequestBody(SETTINGS, prompt),
  },
}];
`;
  return withGuards(header, glue);
}

export function aiParseCode() {
  return withGuards(
    banner([
      'Never execute model output. Keep only schema-valid fields.',
      'Any malformed or non-2xx model response becomes the fixed fallback assessment.',
    ]),
    `
const prepared = $('Validate and build prompt').first().json;
const item = $input.first().json;
const httpShaped = item && typeof item.statusCode === 'number' && !item.llmBody && item.stage !== 'validated';
let parsed;
if (!httpShaped) {
  parsed = { ok: false, parse_status: 'fallback', assessment: fallbackAssessment() };
} else {
  const extracted = extractModelContent(item);
  parsed = extracted.content ? parseModelOutput(extracted.content) : { ok: false, parse_status: 'fallback', assessment: fallbackAssessment() };
}
const assessment = parsed.assessment;
const lead = prepared.lead;
const intent = safeToken(assessment.intent);
const row = {
  received_at: lead.received_at,
  lead_id: lead.lead_id,
  name: lead.name,
  email: lead.email,
  phone: lead.phone,
  company: lead.company,
  service: lead.service,
  budget: lead.budget_raw,
  message: lead.message,
  summary: sanitizeCell(assessment.summary),
  intent: sanitizeCell(assessment.intent),
  priority_score: String(assessment.priority_score),
  priority_reason: sanitizeCell(assessment.priority_reason),
  review_required: assessment.review_required ? 'true' : 'false',
  parse_status: parsed.parse_status,
  model: sanitizeCell(prepared.settings.model),
};
return [{
  json: {
    failed: false,
    settings: prepared.settings,
    row,
    notifyTeamEmail: prepared.settings.notifyTeamEmail === true,
    notifySlack: prepared.settings.notifySlack === true,
    teamSubject: 'Lead summary: ' + intent + ' priority ' + String(assessment.priority_score),
    teamHtml: aiAlertHtml(lead, assessment, parsed.parse_status),
    slackText: aiAlertSlack(lead, assessment, parsed.parse_status),
  },
}];
`,
  );
}

export function aiConfirmCode() {
  return withGuards(
    banner(['A pass-through of the parse item means the sheet append did not return a row.']),
    `
const item = $input.first().json;
const parsed = $('Parse model output').first().json;
if (sheetWriteFailed(item)) {
  return [{ json: { failed: true, failure: 'ai-save', settings: parsed.settings } }];
}
return [{ json: { failed: false } }];
`,
  );
}

export function aiFailureCode() {
  return withGuards(
    banner(['Fixed reason code only. The HTTP response stays generic.']),
    `
const item = $input.first().json;
const row = {
  received_at: new Date().toISOString(),
  workflow_name: 'AI lead summary',
  node_name: sanitizeCell(item.failure || 'unknown'),
  message_redacted: 'external_call_failed',
  execution_id: '',
};
return [{ json: { row, settings: item.settings } }];
`,
  );
}

export function aiDeliveryCode() {
  return withGuards(
    banner(['Notification failures are logged and do not change the caller response.']),
    `
function nodeJson(name) {
  try {
    const data = $(name).first();
    return data && data.json ? data.json : null;
  } catch (error) {
    return null;
  }
}
const parsed = $('Parse model output').first().json;
const problems = [];
if (parsed.notifyTeamEmail) {
  const sent = nodeJson('Email the team');
  if (!sent || !sent.threadId) problems.push('team-email');
}
if (parsed.notifySlack) {
  const sent = nodeJson('Post to Slack');
  if (!sent || !sent.ts) problems.push('slack');
}
if (problems.length) {
  return [{ json: { failed: true, failure: 'delivery:' + problems.join('+'), settings: parsed.settings } }];
}
return [{ json: { failed: false } }];
`,
  );
}

export function digestSettingsCode(settings) {
  const digestSettings = {
    sheetId: settings.sheetId,
    timeZone: settings.timeZone,
    teamEmail: settings.teamEmail,
    digestMaxRows: settings.digestMaxRows,
    tabs: { aiLeads: settings.tabs.aiLeads },
  };
  const header = banner([
    'EDIT AFTER IMPORT if you change the sheet, timezone, or team inbox.',
    'Keep this block aligned with Validate and build prompt.',
    'The digest does not call the model.',
  ]) + 'const SETTINGS = ' + JSON.stringify(digestSettings, null, 2) + ';\n';
  return header + `
return [{ json: { kind: 'digest-settings', settings: SETTINGS } }];
`;
}

export function digestBuildCode() {
  return withGuards(
    banner(['If the read node echoes the settings item, the sheet read did not succeed.']),
    `
const settings = $('Select digest window').first().json.settings;
const items = $input.all().map((entry) => entry.json);
const sawSettings = items.some((row) => row && row.kind === 'digest-settings');
const sawLead = items.some((row) => row && row.received_at);
if (sawSettings && !sawLead) {
  return [{ json: { failed: true, settings } }];
}
const digest = buildDigest({
  rows: items,
  timeZone: settings.timeZone,
  now: new Date(),
  maxRows: settings.digestMaxRows,
});
return [{ json: { failed: false, settings, subject: digest.subject, html: digest.html } }];
`,
  );
}

export function errorRedactCode(settings) {
  const header = banner([
    'EDIT AFTER IMPORT',
    'Stores a redacted first line only. Drops the stack and the execution URL.',
  ]) + 'const SETTINGS = ' + JSON.stringify(settings, null, 2) + ';\n';
  const glue = `
const item = $input.first().json;
const execution = item.execution || {};
const workflow = item.workflow || {};
const message = execution.error && execution.error.message;
const workflowName = String(workflow.name || 'unknown');
const nodeName = String(execution.lastNodeExecuted || 'unknown');
const detail = redactError(message);
const row = {
  received_at: new Date().toISOString(),
  workflow_name: sanitizeCell(workflowName),
  node_name: sanitizeCell(nodeName),
  message_redacted: detail,
  execution_id: sanitizeCell(execution.id || ''),
};
const html = '<p>A workflow execution failed.</p>'
  + '<p>Workflow: ' + escapeHtml(workflowName) + '</p>'
  + '<p>Node: ' + escapeHtml(nodeName) + '</p>'
  + '<p>Execution: ' + escapeHtml(String(execution.id || '')) + '</p>'
  + '<p>Detail: ' + escapeHtml(detail) + '</p>'
  + '<p>The signed-in owner can open the execution log for the full error. This email does not include the request body.</p>';
return [{
  json: {
    row,
    html,
    subject: 'Workflow error (redacted)',
    settings: SETTINGS,
  },
}];
`;
  return withGuards(header, glue);
}
