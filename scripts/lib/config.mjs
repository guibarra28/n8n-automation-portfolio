/**
 * Shipped defaults for the example workflows.
 * Edit this file and run `node scripts/build-workflows.mjs`, or edit the
 * matching block at the top of the Code node after importing into n8n.
 * Never put API keys, OAuth secrets, or webhook secrets in here.
 */

export const limits = {
  maxBodyChars: 16000,
  name: 120,
  email: 254,
  phone: 32,
  company: 160,
  service: 80,
  budget: 40,
  message: 4000,
};

/** Lower-cased service text -> canonical service. Unknown values become "other". */
export const serviceAliases = {
  website: 'website',
  web: 'website',
  site: 'website',
  'landing page': 'website',
  automation: 'automation',
  n8n: 'automation',
  zapier: 'automation',
  make: 'automation',
  workflow: 'automation',
  consulting: 'consulting',
  consult: 'consulting',
  consultancy: 'consulting',
};

/**
 * Budget tiers. `max` is exclusive. `null` max means no upper bound.
 * 0–499 starter, 500–1999 growth, 2000–9999 scale, 10000+ enterprise.
 */
export const budgetTiers = [
  { id: 'starter', min: 0, max: 500 },
  { id: 'growth', min: 500, max: 2000 },
  { id: 'scale', min: 2000, max: 10000 },
  { id: 'enterprise', min: 10000, max: null },
];

/**
 * First matching rule wins. `tiers: null` matches every budget tier.
 * `queue` is an internal label for the team, not something the caller chooses.
 */
export const categoryRules = [
  { id: 'web_enterprise', service: 'website', tiers: ['enterprise'], priority: 'high', queue: 'sales-senior' },
  { id: 'web_project', service: 'website', tiers: ['growth', 'scale'], priority: 'normal', queue: 'sales' },
  { id: 'web_starter', service: 'website', tiers: ['starter'], priority: 'low', queue: 'sales' },
  { id: 'web_discovery', service: 'website', tiers: ['unscored'], priority: 'normal', queue: 'sales' },
  { id: 'automation_enterprise', service: 'automation', tiers: ['enterprise'], priority: 'high', queue: 'automation' },
  { id: 'automation', service: 'automation', tiers: ['starter', 'growth', 'scale'], priority: 'normal', queue: 'automation' },
  { id: 'automation_discovery', service: 'automation', tiers: ['unscored'], priority: 'normal', queue: 'automation' },
  { id: 'consulting', service: 'consulting', tiers: null, priority: 'normal', queue: 'consulting' },
  { id: 'general', service: 'other', tiers: null, priority: 'low', queue: 'inbox' },
];

export const leadflowSettings = {
  sheetId: 'YOUR_SHEET_ID',
  timeZone: 'America/Sao_Paulo',
  teamEmail: 'team@example.com',
  slackChannel: 'leads',
  sendLeadAck: true,
  notifyTeamEmail: true,
  notifySlack: false,
  tabs: {
    leads: 'Leads',
    duplicates: 'Duplicates',
    rejections: 'Rejections',
    errors: 'Errors',
  },
  limits,
};

export const aiSettings = {
  sheetId: 'YOUR_SHEET_ID',
  timeZone: 'America/Sao_Paulo',
  teamEmail: 'team@example.com',
  slackChannel: 'leads',
  notifyTeamEmail: true,
  notifySlack: false,
  llmUrl: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o-mini',
  temperature: 0,
  maxTokens: 300,
  digestMaxRows: 50,
  tabs: {
    aiLeads: 'AI Leads',
    aiRejections: 'AI Rejections',
    errors: 'Errors',
  },
  limits,
};

export const errorSettings = {
  sheetId: 'YOUR_SHEET_ID',
  teamEmail: 'team@example.com',
  errorsTab: 'Errors',
};

export const intents = ['new_project', 'support', 'pricing', 'partnership', 'spam', 'other'];
