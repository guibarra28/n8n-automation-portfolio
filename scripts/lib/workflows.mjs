import { aiSettings, budgetTiers, categoryRules, errorSettings, leadflowSettings, serviceAliases } from './config.mjs';
import {
  aiConfirmCode,
  aiDeliveryCode,
  aiFailureCode,
  aiParseCode,
  aiValidateCode,
  digestBuildCode,
  digestSettingsCode,
  errorRedactCode,
  leadflowCategorizeCode,
  leadflowConfirmCode,
  leadflowDeliveryCode,
  leadflowFailureCode,
  leadflowNormalizeCode,
} from './workflow-code.mjs';

const CREDENTIAL_ID = 'PLACEHOLDER';

const LEAD_COLUMNS = [
  'received_at', 'lead_id', 'name', 'email', 'phone', 'company', 'service', 'service_normalized',
  'budget_raw', 'budget_amount', 'budget_tier', 'message', 'category', 'priority', 'owner_queue',
  'source', 'status',
];
const DUPLICATE_COLUMNS = [
  'received_at', 'lead_id', 'matched_lead_id', 'name', 'email', 'phone', 'company', 'service',
  'budget_raw', 'message', 'category', 'priority', 'owner_queue', 'note',
];
const REJECTION_COLUMNS = ['received_at', 'reasons', 'email'];
const ERROR_COLUMNS = ['received_at', 'workflow_name', 'node_name', 'message_redacted', 'execution_id'];
const AI_COLUMNS = [
  'received_at', 'lead_id', 'name', 'email', 'phone', 'company', 'service', 'budget', 'message',
  'summary', 'intent', 'priority_score', 'priority_reason', 'review_required', 'parse_status', 'model',
];

function columnSchema(columns) {
  return columns.map((id) => ({
    id,
    displayName: id,
    required: false,
    defaultMatch: false,
    display: true,
    type: 'string',
    canBeUsedToMatch: true,
  }));
}

function definedColumns(columns, expressionFor) {
  const value = {};
  for (const column of columns) value[column] = expressionFor(column);
  return {
    mappingMode: 'defineBelow',
    value,
    matchingColumns: [],
    schema: columnSchema(columns),
    attemptToConvertTypes: false,
    convertFieldsToString: true,
  };
}

function workflowBuilder(idPrefix) {
  const nodes = [];
  const connections = {};
  let seq = 0;
  function nextId() {
    seq += 1;
    return '00000000-0000-4000-' + idPrefix + '-' + String(seq).padStart(12, '0');
  }
  function add(node) {
    nodes.push(node);
    return node.name;
  }
  function link(from, to, outputIndex = 0) {
    if (!connections[from]) connections[from] = { main: [] };
    while (connections[from].main.length <= outputIndex) connections[from].main.push([]);
    connections[from].main[outputIndex].push({ node: to, type: 'main', index: 0 });
  }
  return { nodes, connections, add, link, nextId };
}

function codeNode(builder, name, position, jsCode) {
  return builder.add({
    parameters: { mode: 'runOnceForAllItems', language: 'javaScript', jsCode },
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position,
  });
}

function ifNode(builder, name, position, expression) {
  return builder.add({
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [
          {
            id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40),
            leftValue: expression,
            rightValue: '',
            operator: { type: 'boolean', operation: 'true', singleValue: true },
          },
        ],
        combinator: 'and',
      },
      options: {},
    },
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.if',
    typeVersion: 2.2,
    position,
  });
}

function sticky(builder, name, position, content, width = 360, height = 220) {
  return builder.add({
    parameters: { content, height, width, color: 4 },
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.stickyNote',
    typeVersion: 1,
    position,
  });
}

function webhookNode(builder, name, position, path, credentialName) {
  return builder.add({
    parameters: {
      httpMethod: 'POST',
      path,
      authentication: 'headerAuth',
      responseMode: 'responseNode',
      options: {},
    },
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2.2,
    position,
    webhookId: builder.nextId(),
    credentials: { httpHeaderAuth: { id: CREDENTIAL_ID, name: credentialName } },
  });
}

function respondNode(builder, name, position, statusCode, bodyExpression) {
  return builder.add({
    parameters: {
      respondWith: 'json',
      responseBody: bodyExpression,
      options: {
        responseCode: statusCode,
        responseHeaders: {
          entries: [
            { name: 'Cache-Control', value: 'no-store' },
            { name: 'X-Content-Type-Options', value: 'nosniff' },
          ],
        },
      },
    },
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.4,
    position,
  });
}

function sheetsAppend(builder, name, position, sheetIdExpr, tabExpr, columns, valueExpr) {
  return builder.add({
    parameters: {
      authentication: 'oAuth2',
      resource: 'sheet',
      operation: 'append',
      documentId: { __rl: true, mode: 'id', value: sheetIdExpr },
      sheetName: { __rl: true, mode: 'name', value: tabExpr },
      columns: definedColumns(columns, valueExpr),
      options: { cellFormat: 'RAW', useAppend: true },
    },
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position,
    onError: 'continueRegularOutput',
    credentials: { googleSheetsOAuth2Api: { id: CREDENTIAL_ID, name: 'Google Sheets account' } },
  });
}

function sheetsRead(builder, name, position, parameters, extra = {}) {
  return builder.add({
    parameters,
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.googleSheets',
    typeVersion: 4.7,
    position,
    alwaysOutputData: true,
    onError: 'continueRegularOutput',
    credentials: { googleSheetsOAuth2Api: { id: CREDENTIAL_ID, name: 'Google Sheets account' } },
    ...extra,
  });
}

function gmailNode(builder, name, position, toExpr, subjectExpr, htmlExpr) {
  return builder.add({
    parameters: {
      authentication: 'oAuth2',
      resource: 'message',
      operation: 'send',
      sendTo: toExpr,
      subject: subjectExpr,
      emailType: 'html',
      message: htmlExpr,
      options: { appendAttribution: false },
    },
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.gmail',
    typeVersion: 2.2,
    position,
    onError: 'continueRegularOutput',
    credentials: { gmailOAuth2: { id: CREDENTIAL_ID, name: 'Gmail account' } },
  });
}

function slackNode(builder, name, position, channelExpr, textExpr) {
  return builder.add({
    parameters: {
      authentication: 'accessToken',
      resource: 'message',
      operation: 'post',
      select: 'channel',
      channelId: { __rl: true, mode: 'name', value: channelExpr },
      messageType: 'text',
      text: textExpr,
    },
    id: builder.nextId(),
    name,
    type: 'n8n-nodes-base.slack',
    typeVersion: 2.3,
    position,
    onError: 'continueRegularOutput',
    credentials: { slackApi: { id: CREDENTIAL_ID, name: 'Slack account' } },
  });
}

function finish(name, builder, settings) {
  return {
    name,
    nodes: builder.nodes,
    pinData: {},
    connections: builder.connections,
    active: false,
    settings,
    meta: { templateCredsSetupCompleted: false },
    tags: [],
  };
}

const field = (root, column) => `={{ ${root}.${column} }}`;

export function leadflowWorkflow() {
  const builder = workflowBuilder('8001');
  const sheetId = "={{ $('Normalize and validate').first().json.settings.sheetId }}";
  const tabs = (name) => `={{ $('Normalize and validate').first().json.settings.tabs.${name} }}`;

  sticky(builder, 'Read me', [-360, 40], [
    '## LeadFlow',
    'Header Auth is required. Create credential "LeadFlow Webhook Header Auth" (header X-Webhook-Secret) before publishing.',
    'Replace YOUR_SHEET_ID in Normalize and validate.',
    'Edit routing rules in Categorize lead.',
    'notifySlack is false until a Slack credential and channel are ready.',
    'Import and publish "Portfolio error logger", then select it as this workflow\'s error workflow.',
    'Caller responses are fixed JSON. Internal errors are not returned.',
  ].join('\n'), 420, 280);

  const webhook = webhookNode(builder, 'Receive lead', [0, 360], 'leadflow', 'LeadFlow Webhook Header Auth');
  const normalize = codeNode(builder, 'Normalize and validate', [260, 360], leadflowNormalizeCode(leadflowSettings));
  const valid = ifNode(builder, 'Lead is valid?', [520, 360], '={{ $json.valid }}');
  const rejected = respondNode(
    builder,
    'Respond rejected',
    [800, 520],
    400,
    "={{ JSON.stringify({ ok: false, status: 'rejected', errors: $('Normalize and validate').first().json.errors || ['invalid_lead'] }) }}",
  );
  const logRejection = sheetsAppend(
    builder,
    'Log rejection',
    [800, 720],
    sheetId,
    tabs('rejections'),
    REJECTION_COLUMNS,
    (column) => field("$('Normalize and validate').first().json.rejection", column),
  );
  const lookup = sheetsRead(builder, 'Find existing lead', [800, 280], {
    authentication: 'oAuth2',
    resource: 'sheet',
    operation: 'read',
    documentId: { __rl: true, mode: 'id', value: sheetId },
    sheetName: { __rl: true, mode: 'name', value: tabs('leads') },
    filtersUI: { values: [{ lookupColumn: 'email', lookupValue: "={{ $('Normalize and validate').first().json.lead.email_key }}" }] },
    combineFilters: 'AND',
    options: { returnFirstMatch: true },
  });
  const categorize = codeNode(builder, 'Categorize lead', [1080, 280], leadflowCategorizeCode(serviceAliases, budgetTiers, categoryRules));
  const lookupFailed = ifNode(builder, 'Lookup failed?', [1360, 280], '={{ $json.failed }}');
  const duplicate = ifNode(builder, 'Is duplicate?', [1640, 160], '={{ $json.duplicate }}');
  const save = sheetsAppend(
    builder,
    'Save lead',
    [1920, 80],
    sheetId,
    tabs('leads'),
    LEAD_COLUMNS,
    (column) => field("$('Categorize lead').first().json.leadRow", column),
  );
  const flag = sheetsAppend(
    builder,
    'Flag duplicate',
    [1920, 300],
    sheetId,
    tabs('duplicates'),
    DUPLICATE_COLUMNS,
    (column) => field("$('Categorize lead').first().json.duplicateRow", column),
  );
  const confirm = codeNode(builder, 'Confirm write', [2200, 180], leadflowConfirmCode());
  const writeFailed = ifNode(builder, 'Write failed?', [2460, 180], '={{ $json.failed }}');
  const describe = codeNode(builder, 'Describe failure', [1680, 760], leadflowFailureCode());
  const logFailure = sheetsAppend(
    builder,
    'Log failure',
    [1960, 760],
    '={{ $json.settings.sheetId }}',
    '={{ $json.settings.tabs.errors }}',
    ERROR_COLUMNS,
    (column) => field('$json.row', column),
  );
  const unavailable = respondNode(
    builder,
    'Respond unavailable',
    [1680, 520],
    503,
    '={{ JSON.stringify({ ok: false, status: \'unavailable\' }) }}',
  );
  const ack = ifNode(builder, 'Send acknowledgement?', [2740, 80], "={{ $('Categorize lead').first().json.sendLeadAck }}");
  const emailLead = gmailNode(
    builder,
    'Email the lead',
    [3020, 0],
    "={{ $('Categorize lead').first().json.ackTo }}",
    "={{ $('Categorize lead').first().json.ackSubject }}",
    "={{ $('Categorize lead').first().json.ackHtml }}",
  );
  const team = ifNode(builder, 'Notify team by email?', [3300, 80], "={{ $('Categorize lead').first().json.notifyTeamEmail }}");
  const emailTeam = gmailNode(
    builder,
    'Email the team',
    [3580, 0],
    "={{ $('Categorize lead').first().json.settings.teamEmail }}",
    "={{ $('Categorize lead').first().json.teamSubject }}",
    "={{ $('Categorize lead').first().json.teamHtml }}",
  );
  const slackIf = ifNode(builder, 'Notify team in Slack?', [3860, 80], "={{ $('Categorize lead').first().json.notifySlack }}");
  const slack = slackNode(
    builder,
    'Post to Slack',
    [4140, 0],
    "={{ $('Categorize lead').first().json.settings.slackChannel }}",
    "={{ $('Categorize lead').first().json.slackText }}",
  );
  const delivery = codeNode(builder, 'Check delivery', [4420, 80], leadflowDeliveryCode());
  const deliveryFailed = ifNode(builder, 'Delivery failed?', [4680, 80], '={{ $json.failed }}');
  const accepted = respondNode(
    builder,
    'Respond result',
    [4960, 40],
    200,
    "={{ JSON.stringify($('Categorize lead').first().json.duplicate ? { ok: true, status: 'duplicate' } : { ok: true, status: 'accepted' }) }}",
  );

  builder.link(webhook, normalize);
  builder.link(normalize, valid);
  builder.link(valid, lookup, 0);
  builder.link(valid, rejected, 1);
  builder.link(valid, logRejection, 1);
  builder.link(lookup, categorize);
  builder.link(categorize, lookupFailed);
  builder.link(lookupFailed, describe, 0);
  builder.link(lookupFailed, unavailable, 0);
  builder.link(lookupFailed, duplicate, 1);
  builder.link(duplicate, flag, 0);
  builder.link(duplicate, save, 1);
  builder.link(save, confirm);
  builder.link(flag, confirm);
  builder.link(confirm, writeFailed);
  builder.link(writeFailed, describe, 0);
  builder.link(writeFailed, unavailable, 0);
  builder.link(writeFailed, ack, 1);
  builder.link(describe, logFailure);
  builder.link(ack, emailLead, 0);
  builder.link(ack, team, 1);
  builder.link(emailLead, team);
  builder.link(team, emailTeam, 0);
  builder.link(team, slackIf, 1);
  builder.link(emailTeam, slackIf);
  builder.link(slackIf, slack, 0);
  builder.link(slackIf, delivery, 1);
  builder.link(slack, delivery);
  builder.link(delivery, deliveryFailed);
  builder.link(deliveryFailed, describe, 0);
  builder.link(deliveryFailed, accepted, 0);
  builder.link(deliveryFailed, accepted, 1);

  return finish('LeadFlow — website lead capture and routing', builder, {
    executionOrder: 'v1',
    callerPolicy: 'workflowsFromSameOwner',
    availableInMCP: false,
    executionTimeout: 60,
  });
}

export function aiWorkflow() {
  const builder = workflowBuilder('8002');
  const sheetId = "={{ $('Validate and build prompt').first().json.settings.sheetId }}";
  const aiTab = "={{ $('Validate and build prompt').first().json.settings.tabs.aiLeads }}";
  const rejectTab = "={{ $('Validate and build prompt').first().json.settings.tabs.aiRejections }}";

  sticky(builder, 'Read me', [-360, 40], [
    '## AI lead summary and daily digest',
    'Two triggers: the webhook and the weekday 18:00 schedule. They do not share items.',
    'Header Auth credential: "Lead Summary Webhook Header Auth".',
    'LLM credential: "LLM Bearer Auth" (Bearer token). The token is not in this workflow.',
    'Replace YOUR_SHEET_ID in Validate and build prompt and in Select digest window.',
    'The digest does not send lead text back to the model.',
    'Select "Portfolio error logger" as the error workflow before publishing.',
  ].join('\n'), 440, 300);

  const webhook = webhookNode(builder, 'Receive lead for summary', [0, 420], 'lead-summary', 'Lead Summary Webhook Header Auth');
  const validate = codeNode(builder, 'Validate and build prompt', [280, 420], aiValidateCode(aiSettings));
  const configError = ifNode(builder, 'Configuration error?', [560, 420], '={{ $json.configError }}');
  const valid = ifNode(builder, 'Lead is valid?', [840, 520], '={{ $json.valid }}');
  const rejected = respondNode(
    builder,
    'Respond rejected',
    [1120, 680],
    400,
    "={{ JSON.stringify({ ok: false, status: 'rejected', errors: $('Validate and build prompt').first().json.errors || ['invalid_lead'] }) }}",
  );
  const logRejection = sheetsAppend(
    builder,
    'Log rejection',
    [1120, 880],
    sheetId,
    rejectTab,
    REJECTION_COLUMNS,
    (column) => field("$('Validate and build prompt').first().json.rejection", column),
  );
  const llm = builder.add({
    parameters: {
      method: 'POST',
      url: "={{ $('Validate and build prompt').first().json.llmUrl }}",
      authentication: 'genericCredentialType',
      genericAuthType: 'httpBearerAuth',
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: "={{ JSON.stringify($('Validate and build prompt').first().json.llmBody) }}",
      options: {
        timeout: 20000,
        redirect: { redirect: { followRedirects: false } },
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
      },
    },
    id: builder.nextId(),
    name: 'Classify with LLM',
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [1120, 420],
    onError: 'continueRegularOutput',
    credentials: { httpBearerAuth: { id: CREDENTIAL_ID, name: 'LLM Bearer Auth' } },
  });
  const parse = codeNode(builder, 'Parse model output', [1400, 420], aiParseCode());
  const save = sheetsAppend(
    builder,
    'Save AI lead',
    [1680, 420],
    sheetId,
    aiTab,
    AI_COLUMNS,
    (column) => field("$('Parse model output').first().json.row", column),
  );
  const confirm = codeNode(builder, 'Confirm write', [1960, 420], aiConfirmCode());
  const writeFailed = ifNode(builder, 'Write failed?', [2220, 420], '={{ $json.failed }}');
  const describe = codeNode(builder, 'Describe failure', [1960, 860], aiFailureCode());
  const logFailure = sheetsAppend(
    builder,
    'Log failure',
    [2240, 860],
    '={{ $json.settings.sheetId }}',
    '={{ $json.settings.tabs.errors }}',
    ERROR_COLUMNS,
    (column) => field('$json.row', column),
  );
  const unavailable = respondNode(
    builder,
    'Respond unavailable',
    [1680, 680],
    503,
    '={{ JSON.stringify({ ok: false, status: \'unavailable\' }) }}',
  );
  const team = ifNode(builder, 'Notify team by email?', [2500, 320], "={{ $('Parse model output').first().json.notifyTeamEmail }}");
  const emailTeam = gmailNode(
    builder,
    'Email the team',
    [2780, 220],
    "={{ $('Parse model output').first().json.settings.teamEmail }}",
    "={{ $('Parse model output').first().json.teamSubject }}",
    "={{ $('Parse model output').first().json.teamHtml }}",
  );
  const slackIf = ifNode(builder, 'Notify team in Slack?', [3060, 320], "={{ $('Parse model output').first().json.notifySlack }}");
  const slack = slackNode(
    builder,
    'Post to Slack',
    [3340, 220],
    "={{ $('Parse model output').first().json.settings.slackChannel }}",
    "={{ $('Parse model output').first().json.slackText }}",
  );
  const delivery = codeNode(builder, 'Check delivery', [3620, 320], aiDeliveryCode());
  const deliveryFailed = ifNode(builder, 'Delivery failed?', [3880, 320], '={{ $json.failed }}');
  const accepted = respondNode(
    builder,
    'Respond accepted',
    [4160, 240],
    200,
    '={{ JSON.stringify({ ok: true, status: \'accepted\' }) }}',
  );

  const schedule = builder.add({
    parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 18 * * 1-5' }] } },
    id: builder.nextId(),
    name: 'Weekday digest',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [0, 1100],
  });
  const digestSettings = codeNode(builder, 'Select digest window', [280, 1100], digestSettingsCode(aiSettings));
  const digestRead = sheetsRead(builder, 'Read AI leads', [560, 1100], {
    authentication: 'oAuth2',
    resource: 'sheet',
    operation: 'read',
    documentId: { __rl: true, mode: 'id', value: "={{ $('Select digest window').first().json.settings.sheetId }}" },
    sheetName: { __rl: true, mode: 'name', value: "={{ $('Select digest window').first().json.settings.tabs.aiLeads }}" },
    options: {},
  });
  const digestBuild = codeNode(builder, 'Build digest', [840, 1100], digestBuildCode());
  const digestFailed = ifNode(builder, 'Digest failed?', [1120, 1100], '={{ $json.failed }}');
  const digestEmail = gmailNode(
    builder,
    'Email digest',
    [1400, 1000],
    '={{ $json.settings.teamEmail }}',
    '={{ $json.subject }}',
    '={{ $json.html }}',
  );
  const digestErrorEmail = gmailNode(
    builder,
    'Email digest failure',
    [1400, 1240],
    "={{ $('Select digest window').first().json.settings.teamEmail }}",
    'Daily lead digest failed',
    '<p>The daily lead digest could not read the sheet. Check the execution log in n8n. This message does not include the underlying error.</p>',
  );

  builder.link(webhook, validate);
  builder.link(validate, configError);
  builder.link(configError, describe, 0);
  builder.link(configError, unavailable, 0);
  builder.link(configError, valid, 1);
  builder.link(valid, llm, 0);
  builder.link(valid, rejected, 1);
  builder.link(valid, logRejection, 1);
  builder.link(llm, parse);
  builder.link(parse, save);
  builder.link(save, confirm);
  builder.link(confirm, writeFailed);
  builder.link(writeFailed, describe, 0);
  builder.link(writeFailed, unavailable, 0);
  builder.link(writeFailed, team, 1);
  builder.link(describe, logFailure);
  builder.link(team, emailTeam, 0);
  builder.link(team, slackIf, 1);
  builder.link(emailTeam, slackIf);
  builder.link(slackIf, slack, 0);
  builder.link(slackIf, delivery, 1);
  builder.link(slack, delivery);
  builder.link(delivery, deliveryFailed);
  builder.link(deliveryFailed, describe, 0);
  builder.link(deliveryFailed, accepted, 0);
  builder.link(deliveryFailed, accepted, 1);

  builder.link(schedule, digestSettings);
  builder.link(digestSettings, digestRead);
  builder.link(digestRead, digestBuild);
  builder.link(digestBuild, digestFailed);
  builder.link(digestFailed, digestErrorEmail, 0);
  builder.link(digestFailed, digestEmail, 1);

  return finish('AI lead summary and daily digest', builder, {
    executionOrder: 'v1',
    callerPolicy: 'workflowsFromSameOwner',
    availableInMCP: false,
    executionTimeout: 120,
  });
}

export function errorWorkflow() {
  const builder = workflowBuilder('8003');
  sticky(builder, 'Read me', [-360, 200], [
    '## Portfolio error logger',
    'Publish this workflow, then choose it as the error workflow on LeadFlow and on the AI summary workflow.',
    'Replace YOUR_SHEET_ID. The Errors tab header is in templates/Errors.csv.',
    'The sheet and the email get a redacted first line only: no stack, no request body, no execution URL.',
  ].join('\n'), 420, 240);

  const trigger = builder.add({
    parameters: {},
    id: builder.nextId(),
    name: 'Error Trigger',
    type: 'n8n-nodes-base.errorTrigger',
    typeVersion: 1,
    position: [0, 360],
  });
  const redact = codeNode(builder, 'Redact error', [280, 360], errorRedactCode(errorSettings));
  const log = sheetsAppend(
    builder,
    'Log error',
    [560, 360],
    '={{ $json.settings.sheetId }}',
    '={{ $json.settings.errorsTab }}',
    ERROR_COLUMNS,
    (column) => field('$json.row', column),
  );
  const email = gmailNode(
    builder,
    'Email the owner',
    [840, 360],
    "={{ $('Redact error').first().json.settings.teamEmail }}",
    "={{ $('Redact error').first().json.subject }}",
    "={{ $('Redact error').first().json.html }}",
  );

  builder.link(trigger, redact);
  builder.link(redact, log);
  builder.link(log, email);

  return finish('Portfolio error logger', builder, {
    executionOrder: 'v1',
    callerPolicy: 'workflowsFromSameOwner',
    availableInMCP: false,
    executionTimeout: 60,
  });
}

export const workflows = [
  { file: 'workflows/leadflow/leadflow.workflow.json', build: leadflowWorkflow },
  { file: 'workflows/ai-lead-summary/ai-lead-summary.workflow.json', build: aiWorkflow },
  { file: 'workflows/error-logger/error-logger.workflow.json', build: errorWorkflow },
];
