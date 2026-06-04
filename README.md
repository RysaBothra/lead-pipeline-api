# Lead Pipeline (Python)

Backend for an outbound funnel:

```
Ocean.io      → companies (domains)
   ↓
Kipplo        → decision makers (LinkedIn)
   ↓
EazyReach     → their email
   ↓
Claude agent  → drafts email, shows YOU a draft before sending
   ↓
Brevo         → sends approved email
   ↓
Report        → report.csv + report.json
```

## Structure

```
leadpipeline/
  models.py            shared dataclasses
  http_client.py       JSON REST helper + retries + rate limiting
  agent.py             Claude-powered draft writer + CLI/Auto approver
  report.py            CSV + JSON reporting
  pipeline.py          orchestrator (run() for CLI, prepare()/send_one() for web)
  store.py             in-memory job/draft store for the web flow
  api.py               FastAPI app + embedded browser UI for approvals
  main.py              CLI entrypoint + run config
  clients/
    ocean.py           company/domain discovery
    kipplo.py          decision-maker discovery
    eazyreach.py       email enrichment
    brevo.py           transactional send
```

## Run (CLI — terminal approval)

```bash
cd lead-pipeline-py
python -m venv .venv && source .venv/bin/activate     # optional
pip install -r requirements.txt

export OCEAN_API_KEY=...
export KIPPLO_API_KEY=...
export EAZYREACH_API_KEY=...
export ANTHROPIC_API_KEY=...
export BREVO_API_KEY=...
export FROM_EMAIL=roshan@yourdomain.com
export FROM_NAME="Roshan"
export CAMPAIGN_BRIEF="One line on what you're pitching and why."

python -m leadpipeline.main
```

Each draft prints in the terminal and waits for `y` / `N` / `s`. Swap
`CLIApprover()` for `AutoApprover()` in `main.py` to send unattended.

## Run (Web — browser approval)

Same env vars, then:

```bash
uvicorn leadpipeline.api:app --reload
# open http://127.0.0.1:8000
```

Enter keywords/countries/limit and hit **Start run**. The backend kicks off
Ocean → Kipplo → EazyReach → draft in the background; drafts appear as cards.
For each you can edit subject / body / CC, then **Approve & send** (goes out via
Brevo) or **Reject** (recorded as skipped). Download `report.csv` / `report.json`
from the links at the bottom.

API endpoints (if you want to drive it programmatically):

```
POST   /jobs                                   start a run -> {job_id}
GET    /jobs/{id}                              status + all drafts
PATCH  /jobs/{id}/drafts/{draft_id}            edit subject/body/cc
POST   /jobs/{id}/drafts/{draft_id}/approve    send via Brevo
POST   /jobs/{id}/drafts/{draft_id}/reject     skip
GET    /jobs/{id}/report.csv | report.json     download report
```

> Job/draft state is in-memory (single process). For production, back
> `store.py` with Redis or Postgres so state survives restarts and scales
> across workers.

## Resilience: retries + rate limiting

`http_client.py` adds automatic retries with exponential backoff + full jitter
on transient failures (HTTP 408/429/500/502/503/504 and network errors), and
honors a server `Retry-After` header. Non-retryable errors (e.g. 400/401/404)
fail fast. A token-bucket rate limiter caps calls per second per client; defaults:
Ocean/Kipplo/EazyReach 5/s, Brevo 8/s, Anthropic 2/s. Tune via the `rate_per_sec`
argument on each client, or `max_retries` / `backoff_base` / `backoff_max` on
`HTTPClient`.

## Adapt to real API contracts

Each vendor client (`ocean`, `kipplo`, `eazyreach`, `brevo`) has request/response
shapes with generic field names and a documented base URL. Verify the exact
endpoint paths, auth header style, and JSON field names against each provider's
current API docs and tweak them — the rest of the pipeline is decoupled via
`models.py`.

EazyReach also exposes an MCP server (`api.superflow.run/eazyreach`); this backend
uses a direct REST call instead so the whole funnel runs headless.

## Report columns (CSV)

`from_domain, from_username, from_name, to_mail, to_name, cc_mail, subject, body,
attachments, message_id, status, error, sent_at`

`report.json` has the same data plus full attachment objects.
