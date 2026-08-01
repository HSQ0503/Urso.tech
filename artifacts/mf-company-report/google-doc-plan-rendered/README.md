# Report-to-Google-Doc DOCX Upload Plan

Source: `/Users/han/Desktop/Urso.tech/artifacts/mf-company-report/report.html`

Local DOCX: `/Users/han/Desktop/Urso.tech/artifacts/mf-company-report/google-doc-plan-rendered/report.docx`

Inventory:
- headings: 26
- native tables/cards: 5
- portable metric cards: 0
- portable chart-data tables: 1
- chart images: 0
- source two-column blocks: 0
- rendered two-column blocks: 0
- inline style spans: 54
- lists: 10
- preflight: passed (0 errors,
  0 warnings)

Expected connector sequence:

1. Inspect `preflight_checks.json`. Do not upload until preflight passes.
2. Upload `/Users/han/Desktop/Urso.tech/artifacts/mf-company-report/google-doc-plan-rendered/report.docx` with `mcp__codex_apps__google_drive._upload_file`.
3. Treat the Drive-hosted DOCX as the deliverable; it does not need native
   Google Docs MIME conversion.
4. Fetch/open the uploaded file and compare it against `manifest.json` and the
   source HTML report.

This helper intentionally writes only DOCX-upload artifacts. It does not write
Google Docs batch-update request files such as `seed_requests.json`,
`table_requests.json`, `content_replacement_requests_template.json`,
`chart_image_requests_template.json`, `remote_write_plan.json`, or
`all_requests*.json`.
