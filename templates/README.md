# Sheet templates

Create one Google spreadsheet and add a tab for each file below. Paste the header row into row 1. Leave the rest of the tab empty. The header names and order need to match the file, because the Google Sheets nodes map columns by those names.

| File | Tab name |
| --- | --- |
| `Leads.csv` | `Leads` |
| `Duplicates.csv` | `Duplicates` |
| `Rejections.csv` | `Rejections` |
| `Errors.csv` | `Errors` |
| `AI_Leads.csv` | `AI Leads` |
| `AI_Rejections.csv` | `AI Rejections` |

`AI_Leads.csv` uses an underscore in the filename. The tab name has a space: `AI Leads`.

Copy the spreadsheet id from the URL (`https://docs.google.com/spreadsheets/d/<id>/edit`) and replace `YOUR_SHEET_ID` in the Code nodes listed in each workflow README. Share the spreadsheet with the Google account connected to n8n, with edit access.

Values that start with `=`, `+`, `-`, or `@` are stored with a leading single quote, and the nodes write cells as raw text. A phone number that starts with `+` is stored that way on purpose.
