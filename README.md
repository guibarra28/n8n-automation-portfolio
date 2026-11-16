# n8n automation portfolio

Example workflows for a freelance automation developer based in Brazil, written for the kind of lead-handling jobs that show up on Upwork. They are reference implementations you can import into [n8n](https://n8n.io/) 2.x. They are not a client list, and this repository does not publish metrics or testimonials.

Two problems come up over and over:

- A website form drops leads into a shared inbox. Nobody checks the email address, the same person submits twice, and a high-budget enquiry looks the same as a one-line note.
- Someone pastes those leads into a chat model to get a summary. The model also reads whatever the visitor typed, including instructions aimed at the model, and the raw answer gets mailed around.

LeadFlow takes the first problem. The AI workflow takes the second, and adds a weekday digest that does not send the leads back to the model.

## What is in the repo

| Path | Purpose |
| --- | --- |
| `workflows/leadflow/leadflow.workflow.json` | Lead capture, validation, dedupe, routing, email, Slack |
| `workflows/ai-lead-summary/ai-lead-summary.workflow.json` | LLM summary plus a weekday digest |
| `workflows/error-logger/error-logger.workflow.json` | Redacted failure log for both workflows |
| `templates/` | Header rows for the Google Sheets tabs |
| `scripts/send-sample-payloads.mjs` | Posts the sample JSON to a webhook |
| `scripts/test-guards.mjs` | Checks validation, routing, formula escaping, and model parsing |
| `SECURITY.md` | Threat model and the controls in the workflows |
| `docker-compose.yml` | Local n8n on `127.0.0.1`, with an owner login |

## Stack

n8n 2.x, Google Sheets, Gmail, Slack, and any chat API that speaks the OpenAI chat-completions format. The sample sender is Node.js 20+ with no packages to install. Category rules and the LLM URL are plain values in a Code node, so a client can change them without rewriting the flow.

## Import

1. In n8n, import `workflows/error-logger/error-logger.workflow.json`. Replace `YOUR_SHEET_ID`, map the Google Sheets and Gmail credentials, and publish the workflow.
2. Import `workflows/leadflow/leadflow.workflow.json` and `workflows/ai-lead-summary/ai-lead-summary.workflow.json`. They arrive unpublished.
3. On each node that asks for a credential, create or select the named credential. The file's credential id is `PLACEHOLDER`, so n8n will not attach a real credential by itself. Names and header setup are in the workflow READMEs.
4. Create the spreadsheet tabs from `templates/` and replace `YOUR_SHEET_ID` in the Code nodes those READMEs name.
5. In each parent workflow's settings, choose **Portfolio error logger** as the error workflow.
6. Publish only after Header Auth is saved on the webhook. The secret stays on the website's server. The page in the browser does not see it.

Details, the routing table, and the sample requests:

- [LeadFlow](workflows/leadflow/README.md)
- [AI lead summary and daily digest](workflows/ai-lead-summary/README.md)
- [Error logger](workflows/error-logger/README.md)
- [Security](SECURITY.md)

## Try it locally

```bash
cp .env.example .env
# Put two different values from `openssl rand -hex 32` in the n8n keys.
docker compose up -d
```

Open `http://127.0.0.1:5678` and create the owner account. n8n no longer supports HTTP basic auth. That owner account is the login. The port is bound to localhost, and the task-runner port is not published. The compose images are pinned to tag `2.47.7` for this demo; pin them by digest for any other use. `SECURITY.md` explains the choices.

Then import the workflows, listen on the webhook, and send the samples:

```bash
export WEBHOOK_URL=http://127.0.0.1:5678/webhook-test/leadflow
export WEBHOOK_SECRET='the header value from the n8n credential'
node scripts/send-sample-payloads.mjs
```

`npm test` checks that the workflow JSON matches the source, that the guards behave, and that the compose file still binds localhost.

## Screenshots

`docs/screenshots/` explains how to add captures later. None are included here, so the repo does not show a cropped credential or a real inbox.

## License

[MIT](LICENSE)

## Português

Estes fluxos são um portfólio de automação para clientes que pedem captura de leads e resumo com IA. O LeadFlow recebe o formulário, valida e-mail e campos obrigatórios, marca duplicata em outra aba, classifica por serviço e faixa de orçamento, grava no Google Sheets e avisa o time. O segundo fluxo pede um JSON curto a um modelo, confere o resultado e manda um resumo diário em dia útil. A documentação completa está em inglês. Segredos ficam só nas credenciais do n8n, nunca neste repositório.
