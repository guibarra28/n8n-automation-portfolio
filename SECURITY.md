# Security

These workflows receive untrusted lead text and write it to Google Sheets, email, Slack, and an LLM. The controls below are part of the example, and they are the baseline I would keep when adapting the workflows for a client.

## Threat model

A caller who can hit the webhook is untrusted. They can send oversized bodies, broken types, formula text, HTML, extra JSON fields, and instructions aimed at the model or at the person reading the email. A leaked webhook secret lets that caller spend the LLM quota and send mail to arbitrary addresses that pass the email check.

The n8n editor is trusted. Anyone who can edit a workflow can change where data goes. That is why the local compose file binds the editor to localhost and requires an owner account.

Out of scope for this repository: n8n platform bugs, Google or Slack account takeover, and a malicious workflow edit by someone who already has editor access.

## Secrets

The git history is meant to stay free of credentials.

- API keys, OAuth client secrets, webhook secrets, and the n8n encryption key live in n8n credentials or in an untracked `.env`.
- Workflow JSON references credentials by name. Every credential id is the literal `PLACEHOLDER`.
- Sheet ids in the shipped files are `YOUR_SHEET_ID`.
- Webhook URLs in `.env.example` point at `127.0.0.1`.
- `.env.example` is the only env file. `.gitignore` excludes `.env`, key files, credential JSON, and n8n data directories.
- Code nodes do not read `process.env`. The compose file sets `N8N_BLOCK_ENV_ACCESS_IN_NODE=true`.

GitHub Actions runs [gitleaks](https://github.com/gitleaks/gitleaks) on every push and pull request. `npm test` also rejects private-key blocks and common token shapes.

## Webhook authentication

Both webhooks use n8n Header Auth. n8n rejects the request before the workflow runs when the header is missing or wrong. A published webhook whose credential was never selected fails closed with an n8n authorization error.

Create one Header Auth credential per workflow:

| Workflow | Credential name | Header name |
| --- | --- | --- |
| LeadFlow | `LeadFlow Webhook Header Auth` | `X-Webhook-Secret` |
| AI summary | `Lead Summary Webhook Header Auth` | `X-Webhook-Secret` |

Use a different value for each, from `openssl rand -hex 32`. The website's server holds the secret and calls n8n. The browser page does not.

n8n's own rejection text is produced before this workflow. Put a reverse proxy in front of any instance that is reachable beyond localhost so that proxy can return a generic body, cap the request size, and rate-limit.

## Input validation

The Code node keeps only `name`, `email`, `phone`, `company`, `service`, `budget`, and `message`. Nested objects are rejected. Strings are length-capped (message 4000 characters, whole JSON body 16000 characters). The email must be a single plain address with no spaces or newlines. Required fields are name, email, service, and message.

Invalid leads get HTTP 400 and a list of error codes such as `invalid_email` or `missing_name`. The response does not include the submitted message. A rejection row stores the codes and a formula-safe copy of the email attempt. The lead tabs are not updated.

When a Google Sheets or model call fails, the caller gets HTTP 503 and `{ "ok": false, "status": "unavailable" }`. Provider error text stays in the n8n execution log. The Errors tab stores a fixed reason code.

There is a second safety net: the error-logger workflow. It runs when a workflow fails without handling the error. It stores a redacted first line and emails the team. It drops the stack trace, the execution URL, and the request body.

## Formula injection

Every value written to Google Sheets passes through `sanitizeCell`. If a line starts with `=`, `+`, `-`, `@`, or a tab or carriage return, the value is prefixed with `'`. Append nodes set the cell format to RAW, so Google Sheets stores the text instead of evaluating it. Phone numbers that start with `+` get the same prefix. That is deliberate: a CSV export opened in a spreadsheet would otherwise treat them as formulas.

## HTML and Slack

Acknowledgement mail does not quote the lead's message, so the workflow cannot be used to relay that message to an arbitrary inbox. Team mail and the daily digest escape `& < > " '` before inserting lead or model text. Slack text escapes `& < >`, breaks `@channel`, `@here`, and `@everyone`, and never builds a Slack link from lead input. Subjects use fixed sentences or an internal category id.

The address on the acknowledgement is the validated lead email. Protect the webhook secret and rate-limit the route so a leaked secret cannot turn the inbox into a mailer.

## Prompt injection

Lead text is untrusted data.

- Angle brackets are removed, then the fields are placed in one JSON object in the user message.
- The system message tells the model to ignore instructions inside that JSON and to return one object.
- The request uses `response_format: json_object` and a low token cap.
- The parser accepts only `summary`, `intent`, `priority_score`, and `priority_reason`, with an intent enum and an integer score from 1 to 5. Extra keys are dropped.
- Anything else, including a non-2xx response or a pass-through of the request, becomes a fixed fallback: intent `other`, priority `1`, `review_required` true. The raw model text is not stored.
- Model output is written as sheet text and escaped again for email and Slack. It is never evaluated, never used as a URL, and never used as an email recipient.
- The webhook response is `{ "ok": true, "status": "accepted" }`. It does not echo the summary.
- The daily digest does not send the day's leads back to the model. It counts and renders rows that are already in the sheet.

The LLM URL is taken from the configuration block, must be `https`, and must not contain a username or password. The bearer token is the `LLM Bearer Auth` credential.

## Rate limiting and abuse

n8n does not provide a per-webhook quota in these examples. For a reachable instance:

- Terminate TLS and rate-limit at a proxy. A small budget such as 30 requests per minute per IP is enough for a contact form.
- Set the proxy body limit to 32 KB. The workflow's own limit runs after n8n has parsed the JSON.
- Keep the editor on a private network. The sample compose file publishes `127.0.0.1:5678` only and does not publish the task-runner port.
- Rotate the header secret if it is ever copied into a ticket or a browser.
- Watch the Rejections tab. A spike is a signal to rotate the secret and tighten the proxy.
- Prune executions. The compose file keeps them for 7 days because execution data contains the raw lead.
- Leave `notifySlack` false until the Slack app is installed in the channel you name. The default channel name is `leads`.

## Local n8n

`docker-compose.yml` is for a laptop. n8n 1.0 removed HTTP basic auth. On first open, create an owner account with a long password. That account is the login. The task runner is a sidecar on the Docker network. `N8N_RUNNERS_BROKER_LISTEN_ADDRESS=0.0.0.0` lets that sidecar connect. The host firewall never sees port 5679 because the compose file does not publish it.

`N8N_SECURE_COOKIE` is false so the localhost HTTP editor can keep a session. Turn it on when you serve n8n over HTTPS.

## Reporting

Please report a vulnerability through GitHub private vulnerability reporting on this repository when that feature is enabled. A public issue can describe that you found a problem and omit the exploit, the payload, and any customer data.
