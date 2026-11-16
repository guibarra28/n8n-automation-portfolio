# Portfolio error logger

Import this workflow first. Publish it, then in LeadFlow and in the AI summary workflow open the workflow settings and choose **Portfolio error logger** as the error workflow. n8n only runs an error workflow that is published, and only when the parent workflow fails without handling the error.

The Error Trigger receives the workflow name, the last node, the execution id, and the error message. The Code node keeps a single redacted line. Bearer values, Slack tokens, and GitHub tokens are removed from that line. The stack trace, the execution URL, and the request body are dropped. The row is appended to the `Errors` tab and a short email goes to `team@example.com` until you change that address in **Redact error**.

Replace `YOUR_SHEET_ID` in that same node. The header row is `templates/Errors.csv`.

You can execute this workflow manually in the editor. n8n supplies example error data for that run. The example stack is not written to the sheet.
