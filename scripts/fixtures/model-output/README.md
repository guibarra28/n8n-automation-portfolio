# Model-output fixtures

These files are not webhook payloads. `scripts/test-guards.mjs` feeds them to the same parser the AI workflow uses.

`valid.json` and `fenced.txt` must parse. Every other file must fall back to the fixed assessment: intent `other`, priority `1`, and no use of the model text.
