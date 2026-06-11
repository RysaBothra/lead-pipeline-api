r"""Public API server for the lead pipeline.

One FastAPI app, protected by an API key, exposing:

  GET  /health                 - liveness check (no auth)
  POST /send                   - send one email via Brevo (the mailer)
  POST /pipeline/run           - kick off Ocean->Prospeo->EazyReach->Brevo in the
                                 background for pending ocean_inputs rows
  POST /pipeline/followups     - manually send the next follow-up to due
                                 contacts (dry-run by default; never automatic)
  GET  /pipeline/status        - counts per stage table from Hasura

Auth: every endpoint except /health requires
    Authorization: Bearer <API_TOKEN>
where API_TOKEN is an env var you set on the server.

Run locally:
    uvicorn server:app --port 8000
Run in Docker / prod: see Dockerfile (gunicorn + uvicorn workers).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Reuse the already-built, tested pieces.
from mailer_api import SendReport, SendRequest
from mailer_api import send as _mailer_send
from leadpipeline.hasura_store import HasuraStore, physical_table
import pipeline_hasura

# Public API docs (Swagger/ReDoc/openapi.json) are OFF by default so the API
# surface isn't advertised publicly. Set ENABLE_DOCS=1 to turn them back on.
_DOCS_ON = os.getenv("ENABLE_DOCS", "").strip() == "1"
app = FastAPI(
    title="Lead Pipeline API",
    docs_url="/docs" if _DOCS_ON else None,
    redoc_url="/redoc" if _DOCS_ON else None,
    openapi_url="/openapi.json" if _DOCS_ON else None,
)

# Serve brand assets (logo mark, etc.) from ./static at /static.
_STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.isdir(_STATIC_DIR):
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")

# CORS: the dashboard is served from Netlify (leadsiq.app/app) and calls this API
# cross-origin. Auth is a bearer token in a header (no cookies), so credentials
# aren't needed. Override the allowed origins with CORS_ORIGINS (comma-separated).
_CORS_ORIGINS = [o.strip() for o in os.getenv(
    "CORS_ORIGINS",
    "https://leadsiq.app,https://www.leadsiq.app,http://localhost:3000",
).split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_TOKEN = (os.getenv("API_TOKEN") or "").strip()


# --------------------------------------------------------------------------
# Auth: Authorization: Bearer <API_TOKEN>
# --------------------------------------------------------------------------
def require_token(authorization: Optional[str] = Header(default=None)) -> None:
    if not API_TOKEN:
        # Fail closed: refuse to serve protected routes if no token is configured.
        raise HTTPException(503, "server missing API_TOKEN configuration")
    expected = f"Bearer {API_TOKEN}"
    if authorization != expected:
        raise HTTPException(401, "missing or invalid Authorization bearer token")


# --------------------------------------------------------------------------
# Schemas
# --------------------------------------------------------------------------
class PipelineRunRequest(BaseModel):
    send: bool = False           # actually deliver via Brevo (default: resolve only)
    limit: int = 0               # max ocean_inputs rows to process (0 = all pending)
    per_company: int = 3         # decision-makers per company
    from_username: str = "joy"   # which verified Brevo sender local-part to use
    from_name: str = "Joy"
    input_id: Optional[str] = None  # process just this one ocean_inputs row


class InputCreate(BaseModel):
    # One or more seed domains for a single Ocean lookalike search (1-10).
    # seed_domains is preferred; seed_domain stays for backward compatibility.
    seed_domain: Optional[str] = None
    seed_domains: Optional[List[str]] = None
    countries: List[str] = ["IN"]
    max_results: int = 10
    # Optional per-run email (a picked template or a custom draft). When unset
    # the pipeline falls back to the hardcoded default campaign copy.
    email_subject: Optional[str] = None
    email_body: Optional[str] = None


class FollowupRequest(BaseModel):
    send: bool = False           # False = dry-run preview (sends nothing)
    min_gap_days: int = 4        # min days since a contact's last send
    limit: int = 0               # cap recipients (0 = all eligible)
    from_username: str = "joy"   # which verified Brevo sender local-part to use
    from_name: str = "Joy"


class TemplateCreate(BaseModel):
    name: str
    subject: str
    body: str


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


class ProspeoKeysAdd(BaseModel):
    api_keys: List[str]          # one or more keys (bulk paste supported)
    label: Optional[str] = None


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
def _landing_html() -> str:
    """Public marketing landing page (landing.html, sits next to this file)."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "landing.html")
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return "<h1>LeadsIQ</h1><p><a href='/app'>Open the app</a></p>"


@app.get("/", include_in_schema=False)
def landing() -> HTMLResponse:
    """Public landing page. The 'Get started' buttons link to /app."""
    return HTMLResponse(_landing_html())


@app.get("/app", include_in_schema=False)
def dashboard() -> HTMLResponse:
    """The product dashboard (was at / before the landing page existed)."""
    return HTMLResponse(_GUI_HTML)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/send", response_model=SendReport)
def send(req: SendRequest, _: None = Depends(require_token)) -> SendReport:
    """Send one email through Brevo (multi-account, Hasura-logged)."""
    return _mailer_send(req)


def _run_pipeline_job(opts: PipelineRunRequest) -> None:
    try:
        totals = pipeline_hasura.run_pipeline(
            do_send=opts.send, limit=opts.limit, per_company=opts.per_company,
            from_username=opts.from_username, from_name=opts.from_name,
            input_id=opts.input_id)
        print(f"[pipeline] done: {totals}")
    except Exception as e:  # noqa: BLE001
        print(f"[pipeline] FAILED: {e}")


@app.post("/pipeline/run", status_code=202)
def pipeline_run(req: PipelineRunRequest, bg: BackgroundTasks,
                 _: None = Depends(require_token)) -> dict:
    """Launch the funnel in the background. Returns immediately; watch progress
    via GET /pipeline/status or query Hasura. Results are written to Hasura."""
    bg.add_task(_run_pipeline_job, req)
    mode = "REAL SEND" if req.send else "resolve + store only"
    return {"status": "started", "mode": mode,
            "limit": req.limit or "all pending"}


def _run_followups_job(opts: FollowupRequest) -> None:
    try:
        out = pipeline_hasura.run_followups(
            send=opts.send, min_gap_days=opts.min_gap_days, limit=opts.limit,
            from_username=opts.from_username, from_name=opts.from_name)
        print(f"[followups] done: eligible={out['eligible']} sent={out['sent']}")
    except Exception as e:  # noqa: BLE001
        print(f"[followups] FAILED: {e}")


@app.post("/pipeline/followups")
def pipeline_followups(req: FollowupRequest, bg: BackgroundTasks,
                       _: None = Depends(require_token)) -> dict:
    """Manually send the next follow-up to contacts who are due one.

    NEVER automatic. Each contact gets at most initial + 2 follow-ups, spaced
    >= min_gap_days apart, then stops. With send=false (default) this is a DRY
    RUN that returns exactly who would be emailed without sending anything;
    call again with send=true to actually deliver (runs in the background).
    """
    if not req.send:
        # Dry-run preview is fast (Hasura reads only) — run inline and return it.
        return pipeline_hasura.run_followups(
            send=False, min_gap_days=req.min_gap_days, limit=req.limit,
            from_username=req.from_username, from_name=req.from_name)
    bg.add_task(_run_followups_job, req)
    return {"status": "started", "mode": "REAL SEND",
            "min_gap_days": req.min_gap_days,
            "note": "watch logs or GET /pipeline/sends for results"}


@app.post("/hooks/ocean-input", status_code=202)
def ocean_input_hook(payload: dict, bg: BackgroundTasks,
                     _: None = Depends(require_token)) -> dict:
    """Hasura event trigger target: fires when a row is inserted into
    ocean_inputs, then runs the FULL pipeline for that row WITH sending.

    So the only manual step is inserting an ocean_inputs row — everything
    after (Ocean -> Prospeo -> EazyReach -> Brevo) happens automatically.
    Returns 202 immediately so Hasura doesn't time out; work runs in the
    background.
    """
    new = ((payload.get("event") or {}).get("data") or {}).get("new") or {}
    input_id = new.get("id")
    if not input_id:
        raise HTTPException(400, "no ocean_inputs row id in event payload")
    bg.add_task(_run_pipeline_job,
                PipelineRunRequest(send=True, input_id=input_id))
    return {"status": "started", "input_id": input_id,
            "seed_domain": new.get("seed_domain")}


@app.post("/inputs", status_code=201)
def add_input(req: InputCreate, _: None = Depends(require_token)) -> dict:
    """Add a run to ocean_inputs (one or more seed domains feeding a single
    Ocean lookalike search). The Hasura event trigger then runs the full
    pipeline. Optionally carries a chosen email (template or custom draft)."""
    raw = req.seed_domains or ([req.seed_domain] if req.seed_domain else [])
    domains = [d.strip() for d in raw if d and d.strip()][:10]  # Ocean caps at 10
    if not domains:
        raise HTTPException(400, "at least one seed domain is required")
    store = HasuraStore()
    obj = {
        "seed_domain": domains[0],        # primary (display + back-compat)
        "seed_domains": domains,          # full list -> Ocean lookalikeDomains
        "countries": req.countries,
        "max_results": req.max_results,
    }
    if req.email_subject:
        obj["email_subject"] = req.email_subject
    if req.email_body:
        obj["email_body"] = req.email_body
    row = store.insert_one("ocean_inputs", obj)
    return {"status": "created", "id": row.get("id"),
            "seed_domains": domains,
            "note": "pipeline runs automatically via the Hasura event trigger"}


# --------------------------------------------------------------------------
# Email templates library (CRUD)
# --------------------------------------------------------------------------
@app.get("/templates")
def list_templates(_: None = Depends(require_token)) -> list:
    store = HasuraStore()
    return store.fetch("templates", "id name subject body updated_at",
                       order_by="{created_at: asc}")


@app.post("/templates", status_code=201)
def create_template(req: TemplateCreate, _: None = Depends(require_token)) -> dict:
    store = HasuraStore()
    return store.insert_one("templates", {
        "name": req.name.strip(), "subject": req.subject, "body": req.body,
    }, returning="id name subject body")


@app.put("/templates/{tid}")
def update_template(tid: str, req: TemplateUpdate,
                    _: None = Depends(require_token)) -> dict:
    store = HasuraStore()
    changes = {k: v for k, v in {"name": req.name, "subject": req.subject,
                                 "body": req.body}.items() if v is not None}
    if not changes:
        raise HTTPException(400, "nothing to update")
    changes["updated_at"] = datetime.now(timezone.utc).isoformat()
    return store.update_by_pk("templates", tid, changes,
                              returning="id name subject body")


@app.delete("/templates/{tid}")
def delete_template(tid: str, _: None = Depends(require_token)) -> dict:
    store = HasuraStore()
    t = physical_table("templates")
    store.execute("mutation($id:uuid!){ delete_%s_by_pk(id:$id){ id } }" % t,
                  {"id": tid})
    return {"status": "deleted", "id": tid}


# --------------------------------------------------------------------------
# Prospeo API key pool (rotation) — mirrors brevo_keys
# --------------------------------------------------------------------------
def _mask_key(k: str) -> str:
    k = k or ""
    return ("…" + k[-4:]) if len(k) > 4 else "…"


@app.get("/prospeo-keys")
def list_prospeo_keys(_: None = Depends(require_token)) -> list:
    """List Prospeo keys (masked — the full key is never sent to the browser)."""
    store = HasuraStore()
    rows = store.fetch("prospeo_keys", "id label is_active api_key created_at",
                       order_by="{created_at: asc}")
    for r in rows:
        r["api_key"] = _mask_key(r.get("api_key") or "")
    return rows


@app.post("/prospeo-keys", status_code=201)
def add_prospeo_keys(req: ProspeoKeysAdd, _: None = Depends(require_token)) -> dict:
    """Add one or more keys to the rotation pool. Skips duplicates."""
    keys = [k.strip() for k in (req.api_keys or []) if k and k.strip()]
    if not keys:
        raise HTTPException(400, "no keys provided")
    store = HasuraStore()
    label = (req.label or "").strip() or None
    added, dupes = 0, 0
    for k in keys:
        try:
            store.insert_one("prospeo_keys", {"api_key": k, "label": label})
            added += 1
        except RuntimeError as e:
            if "Uniqueness" in str(e) or "duplicate" in str(e):
                dupes += 1
            else:
                raise
    return {"status": "added", "added": added, "duplicates": dupes}


@app.patch("/prospeo-keys/{kid}")
def toggle_prospeo_key(kid: str, _: None = Depends(require_token)) -> dict:
    """Pause/activate a key (toggles is_active)."""
    store = HasuraStore()
    pk = physical_table("prospeo_keys")
    cur = store.execute(
        "query($id:uuid!){ %s_by_pk(id:$id){ is_active } }" % pk,
        {"id": kid}).get(f"{pk}_by_pk")
    if not cur:
        raise HTTPException(404, "key not found")
    new = not cur["is_active"]
    store.update_by_pk("prospeo_keys", kid, {"is_active": new})
    return {"id": kid, "is_active": new}


@app.delete("/prospeo-keys/{kid}")
def delete_prospeo_key(kid: str, _: None = Depends(require_token)) -> dict:
    store = HasuraStore()
    pk = physical_table("prospeo_keys")
    store.execute(
        "mutation($id:uuid!){ delete_%s_by_pk(id:$id){ id } }" % pk,
        {"id": kid})
    return {"status": "deleted", "id": kid}


@app.get("/pipeline/sends")
def pipeline_sends(_: None = Depends(require_token)) -> list:
    """Recent delivered emails from the send log (leadsiq_emailsends)."""
    store = HasuraStore()
    rows = store.fetch(
        "email_sends", "from_mail to_mail subject message_id sent_at",
        order_by="{sent_at: desc}", limit=25)
    # Map to the shape the dashboard table expects.
    out = []
    for r in rows:
        fm = r.get("from_mail") or ""
        out.append({
            "from_domain": fm.split("@", 1)[1] if "@" in fm else fm,
            "to_mails": [r.get("to_mail")] if r.get("to_mail") else [],
            "subject": r.get("subject"),
            "message_id": r.get("message_id"),
            "sent_at": r.get("sent_at"),
        })
    return out


def _id_in(ids: list) -> str:
    """GraphQL _in snippet for a list of uuid strings."""
    return "[" + ", ".join('"%s"' % i for i in ids) + "]"


def _lifetime_totals(store: HasuraStore) -> dict:
    """All-time (cumulative) counts across every run — never reset per run."""
    ti, tc = physical_table("ocean_inputs"), physical_table("ocean_companies")
    td, te = physical_table("decision_makers"), physical_table("email_contacts")
    q = """query {
      runs: %s_aggregate { aggregate { count } }
      companies: %s_aggregate { aggregate { count } }
      people: %s_aggregate { aggregate { count } }
      found: %s_aggregate(where:{email:{_is_null:false}}) { aggregate { count } }
      sent: %s_aggregate(where:{status:{_eq:"sent"}}) { aggregate { count } }
    }""" % (ti, tc, td, te, te)
    try:
        d = store.execute(q)
        g = lambda k: (d.get(k) or {}).get("aggregate", {}).get("count", 0)
        return {"runs": g("runs"), "companies": g("companies"),
                "people": g("people"), "emails_found": g("found"),
                "emails_sent": g("sent")}
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)[:200]}


@app.get("/pipeline/status")
def pipeline_status(_: None = Depends(require_token)) -> dict:
    """Counts for the MOST RECENT run (per-run) AND cumulative all-time totals
    (lifetime), so the dashboard shows both."""
    store = HasuraStore()
    cfg = {
        "DECISION_TITLES": os.getenv("DECISION_TITLES", "(unset)"),
        "PER_COMPANY_LIMIT": os.getenv("PER_COMPANY_LIMIT", "(unset)"),
    }
    out = {"ocean_inputs_pending": 0, "ocean_companies": 0,
           "decision_makers": 0, "email_contacts": 0,
           "emails_found": 0, "emails_sent": 0, "scope": None,
           "lifetime": _lifetime_totals(store), "config": cfg}

    latest = store.fetch("ocean_inputs", "id seed_domain status created_at",
                         order_by="{created_at: desc}", limit=1)
    if not latest:
        return out
    inp = latest[0]
    out["scope"] = {"seed_domain": inp.get("seed_domain"),
                    "status": inp.get("status"),
                    "created_at": inp.get("created_at")}
    out["ocean_inputs_pending"] = 0 if inp.get("status") == "done" else 1

    comps = store.fetch("ocean_companies", "id",
                        where='{input_id: {_eq: "%s"}}' % inp["id"])
    out["ocean_companies"] = len(comps)
    cids = [c["id"] for c in comps]
    if not cids:
        return out

    dms = store.fetch("decision_makers", "id",
                      where='{company_id: {_in: %s}}' % _id_in(cids))
    out["decision_makers"] = len(dms)
    dids = [d["id"] for d in dms]
    if not dids:
        return out

    ecs = store.fetch("email_contacts", "email status",
                      where='{decision_maker_id: {_in: %s}}' % _id_in(dids))
    out["email_contacts"] = len(ecs)
    out["emails_found"] = sum(1 for e in ecs if e.get("email"))
    out["emails_sent"] = sum(1 for e in ecs if e.get("status") == "sent")
    return out


_GUI_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Lead Pipeline</title>
<style>
  :root { --bg:#0f1117; --card:#1a1d27; --line:#2a2e3a; --txt:#e6e8ee;
          --muted:#9aa0ad; --accent:#5B3DF5; --ok:#39d98a; --bad:#ff6b61; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.5 system-ui,Segoe UI,sans-serif; background:var(--bg); color:var(--txt); }
  header { padding:18px 24px; border-bottom:1px solid var(--line); display:flex; gap:14px; align-items:center; }
  h1 { font-size:17px; margin:0; }
  main { padding:22px; max-width:920px; margin:0 auto; display:grid; gap:16px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px 18px; }
  .card h2 { font-size:14px; margin:0 0 12px; color:var(--muted); text-transform:uppercase; letter-spacing:.5px; }
  label { font-size:12px; color:var(--muted); display:block; margin:8px 0 3px; }
  input, select, textarea { background:#11141d; color:var(--txt); border:1px solid var(--line); border-radius:8px; padding:9px 11px; font:inherit; width:100%; }
  textarea { resize:vertical; line-height:1.5; }
  .tplrow { display:flex; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); font-size:14px; }
  .tplrow .nm { font-weight:600; }
  .tplrow .sub { color:var(--muted); font-size:12px; }
  .tplrow .acts { margin-left:auto; display:flex; gap:6px; }
  .tplrow .acts button { padding:5px 11px; font-size:12px; }
  button { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:9px 16px; font:inherit; font-weight:600; cursor:pointer; }
  button.ghost { background:transparent; border:1px solid var(--line); color:var(--txt); }
  button:disabled { opacity:.5; cursor:default; }
  .row { display:flex; gap:10px; flex-wrap:wrap; align-items:end; }
  .row > div { flex:1; min-width:120px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:10px; }
  .stat { background:#11141d; border:1px solid var(--line); border-radius:10px; padding:12px; text-align:center; }
  .stat b { font-size:22px; display:block; }
  .stat span { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.4px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  th,td { text-align:left; padding:7px 8px; border-bottom:1px solid var(--line); }
  th { color:var(--muted); font-weight:600; }
  .msg { font-size:13px; margin-top:8px; min-height:18px; }
  .ok { color:var(--ok); } .bad { color:var(--bad); }
  a { color:#9b8cf7; }
  code { background:#11141d; padding:1px 5px; border-radius:5px; }
</style>
</head>
<body>
<header>
  <img src="/static/mark.png" style="height:26px;width:auto"/>
  <h1>LeadsIQ</h1>
</header>
<main>

  <div class="card">
    <h2>Access token</h2>
    <div class="row">
      <div style="flex:3"><input id="token" type="password" placeholder="paste your API token"/></div>
      <button onclick="saveToken()">Save</button>
    </div>
    <div class="msg" id="tokmsg"></div>
  </div>

  <div class="card">
    <h2>Add target &amp; run</h2>
    <label>Company domains (seeds) — add 1–10; more seeds give Ocean a sharper match</label>
    <div id="domains">
      <input class="domain-in" placeholder="e.g. razorpay.com"/>
    </div>
    <button class="ghost" type="button" onclick="addDomainField()" style="margin-top:8px;padding:6px 12px;font-size:13px">+ Add another domain</button>
    <div class="row" style="margin-top:12px">
      <div><label>Country</label><input id="country" value="IN"/></div>
      <div><label>Max results</label><input id="max" type="number" value="10"/></div>
    </div>
    <label>Email to send</label>
    <div class="row">
      <div style="flex:1">
        <select id="emailmode" onchange="onEmailMode()">
          <option value="template">Pick a template</option>
          <option value="custom">Write a custom draft</option>
        </select>
      </div>
      <div style="flex:2" id="tplpickwrap"><select id="tplpick"></select></div>
    </div>
    <div id="customfields" style="display:none">
      <label>Subject</label>
      <input id="csubject" placeholder="Subject line"/>
      <label>Body</label>
      <textarea id="cbody" rows="6" placeholder="Hi {{contact.FIRSTNAME}}, ... (use {{contact.FIRSTNAME}} and {{contact.COMPANY}} for personalization)"></textarea>
    </div>
    <button id="addbtn" onclick="addTarget()" style="margin-top:14px">Add &amp; Run</button>
    <div class="msg" id="addmsg"></div>
    <p style="font-size:12px;color:var(--muted);margin:10px 0 0">
      Adding a domain runs the whole pipeline automatically and <b>sends real emails</b> to the contacts it finds.
    </p>
  </div>

  <div class="card">
    <h2>Email templates <button class="ghost" style="float:right;padding:4px 10px" onclick="newTemplate()">+ New template</button></h2>
    <div id="tpllist"><span class="muted" style="color:var(--muted);font-size:13px">—</span></div>
    <div id="tpleditor" style="display:none;margin-top:14px;border-top:1px solid var(--line);padding-top:14px">
      <input type="hidden" id="tplid"/>
      <label>Name</label><input id="tplname" placeholder="e.g. SaaS founders — short pitch"/>
      <label>Subject</label><input id="tplsubject" placeholder="Subject line"/>
      <label>Body</label>
      <textarea id="tplbody" rows="9" placeholder="Hi {{contact.FIRSTNAME}}, ..."></textarea>
      <div style="margin-top:12px;display:flex;gap:8px">
        <button onclick="saveTemplate()">Save template</button>
        <button class="ghost" onclick="cancelTemplate()">Cancel</button>
      </div>
      <div class="msg" id="tplmsg"></div>
    </div>
  </div>

  <div class="card">
    <h2>Analytics <button class="ghost" style="float:right;padding:4px 10px" onclick="refreshStatus()">Refresh</button></h2>
    <div style="font-size:12px;color:var(--muted);margin:0 0 8px;font-weight:600">All-time (cumulative)</div>
    <div class="grid" id="lifetime"></div>
    <div id="scopelbl" style="font-size:12px;color:var(--muted);margin:18px 0 8px;font-weight:600">Latest run</div>
    <div class="grid" id="stats"></div>
  </div>

  <div class="card">
    <h2>Recent sends <button class="ghost" style="float:right;padding:4px 10px" onclick="refreshSends()">Refresh</button></h2>
    <table>
      <thead><tr><th>Sent</th><th>From domain</th><th>To</th><th>Subject</th></tr></thead>
      <tbody id="sends"><tr><td colspan="4" style="color:var(--muted)">—</td></tr></tbody>
    </table>
  </div>

</main>
<script>
let TOKEN = localStorage.getItem('lp_token') || '';
document.getElementById('token').value = TOKEN;

function saveToken(){
  TOKEN = document.getElementById('token').value.trim();
  localStorage.setItem('lp_token', TOKEN);
  msg('tokmsg', TOKEN ? 'Saved.' : 'Cleared.', true);
  refreshStatus(); refreshSends(); loadTemplates();
}
function msg(id, text, ok){
  const el = document.getElementById(id);
  el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'bad');
}
async function api(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({'Content-Type':'application/json','Authorization':'Bearer '+TOKEN}, opts.headers||{});
  const r = await fetch(path, opts);
  if(!r.ok){ throw new Error('HTTP '+r.status+' '+(await r.text())); }
  return r.json();
}
async function refreshStatus(){
  if(!TOKEN) return;
  try {
    const s = await api('/pipeline/status');
    // All-time (cumulative) — never resets.
    const lt = s.lifetime || {};
    const ltOrder = [['runs','Runs'],['companies','Companies'],['people','People'],
                     ['emails_found','Found'],['emails_sent','Sent']];
    document.getElementById('lifetime').innerHTML = ltOrder.map(([k,lab]) =>
      `<div class="stat"><b>${lt[k] ?? '–'}</b><span>${lab}</span></div>`).join('');
    // Latest run.
    const order = [['ocean_inputs_pending','Pending'],['ocean_companies','Companies'],
                   ['decision_makers','People'],['emails_found','Found'],
                   ['emails_sent','Sent']];
    document.getElementById('stats').innerHTML = order.map(([k,lab]) =>
      `<div class="stat"><b>${s[k] ?? '–'}</b><span>${lab}</span></div>`).join('');
    const sc = s.scope;
    document.getElementById('scopelbl').textContent = sc
      ? `Latest run: ${sc.seed_domain} · ${sc.status}`
      : 'Latest run — none yet';
  } catch(e){ msg('tokmsg', e.message, false); }
}
async function refreshSends(){
  if(!TOKEN) return;
  try {
    const rows = await api('/pipeline/sends');
    const body = document.getElementById('sends');
    if(!rows.length){ body.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No sends yet</td></tr>'; return; }
    body.innerHTML = rows.map(r => {
      const to = Array.isArray(r.to_mails) ? r.to_mails.join(', ') : (r.to_mails||'');
      const dt = (r.sent_at||'').replace('T',' ').slice(0,16);
      return `<tr><td>${dt}</td><td><code>${r.from_domain||''}</code></td><td>${esc(to)}</td><td>${esc(r.subject||'')}</td></tr>`;
    }).join('');
  } catch(e){ msg('tokmsg', e.message, false); }
}
function addDomainField(){
  const wrap = document.getElementById('domains');
  if(wrap.querySelectorAll('.domain-in').length >= 10){ msg('addmsg','Up to 10 seed domains.', false); return; }
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:8px';
  row.innerHTML = '<input class="domain-in" placeholder="another-domain.com"/>'
    + '<button class="ghost" type="button" title="remove" onclick="this.parentNode.remove()" style="padding:5px 13px">&times;</button>';
  wrap.appendChild(row);
}
function getDomains(){
  return Array.from(document.querySelectorAll('.domain-in'))
    .map(i=>i.value.trim()).filter(Boolean);
}
function resetDomains(){
  document.getElementById('domains').innerHTML = '<input class="domain-in" placeholder="e.g. razorpay.com"/>';
}
async function addTarget(){
  if(!TOKEN){ msg('addmsg','Save your token first.', false); return; }
  const domains = getDomains();
  if(!domains.length){ msg('addmsg','Enter at least one domain.', false); return; }
  // Resolve the email: a picked template or a custom draft.
  let email_subject=null, email_body=null;
  const mode = document.getElementById('emailmode').value;
  if(mode==='custom'){
    email_subject = document.getElementById('csubject').value.trim();
    email_body = document.getElementById('cbody').value.trim();
    if(!email_subject || !email_body){ msg('addmsg','Enter a subject and body for the custom draft.', false); return; }
  } else {
    const tid = document.getElementById('tplpick').value;
    const t = TEMPLATES.find(x=>x.id===tid);
    if(!t){ msg('addmsg','Pick a template, or create one in Email templates below.', false); return; }
    email_subject = t.subject; email_body = t.body;
  }
  const btn = document.getElementById('addbtn'); btn.disabled = true;
  try {
    const body = JSON.stringify({
      seed_domains: domains,
      countries: [document.getElementById('country').value.trim() || 'IN'],
      max_results: parseInt(document.getElementById('max').value||'10',10),
      email_subject, email_body
    });
    const res = await api('/inputs', {method:'POST', body});
    msg('addmsg', 'Added '+(res.seed_domains||[]).join(', ')+' — pipeline running. Watch status & sends below.', true);
    resetDomains();
    setTimeout(refreshStatus, 1500);
  } catch(e){ msg('addmsg', e.message, false); }
  finally { btn.disabled = false; }
}

/* ---- Email templates ---- */
let TEMPLATES = [];
function onEmailMode(){
  const m = document.getElementById('emailmode').value;
  document.getElementById('tplpickwrap').style.display = m==='template' ? '' : 'none';
  document.getElementById('customfields').style.display = m==='custom' ? '' : 'none';
}
async function loadTemplates(){
  if(!TOKEN) return;
  try {
    TEMPLATES = await api('/templates');
    const pick = document.getElementById('tplpick');
    pick.innerHTML = TEMPLATES.length
      ? TEMPLATES.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')
      : '<option value="">No templates — create one below</option>';
    const list = document.getElementById('tpllist');
    list.innerHTML = TEMPLATES.length ? TEMPLATES.map(t=>
      `<div class="tplrow"><div><div class="nm">${esc(t.name)}</div><div class="sub">${esc(t.subject)}</div></div>
       <div class="acts"><button class="ghost" onclick="editTemplate('${t.id}')">Edit</button>
       <button class="ghost" onclick="deleteTemplate('${t.id}')">Delete</button></div></div>`).join('')
      : '<span style="color:var(--muted);font-size:13px">No templates yet — click "+ New template".</span>';
  } catch(e){ msg('tplmsg', e.message, false); }
}
function newTemplate(){
  ['tplid','tplname','tplsubject','tplbody'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('tpleditor').style.display='';
  msg('tplmsg','',true);
}
function editTemplate(id){
  const t = TEMPLATES.find(x=>x.id===id); if(!t) return;
  document.getElementById('tplid').value=t.id;
  document.getElementById('tplname').value=t.name;
  document.getElementById('tplsubject').value=t.subject;
  document.getElementById('tplbody').value=t.body;
  document.getElementById('tpleditor').style.display='';
}
function cancelTemplate(){ document.getElementById('tpleditor').style.display='none'; }
async function saveTemplate(){
  const id = document.getElementById('tplid').value;
  const name = document.getElementById('tplname').value.trim();
  const subject = document.getElementById('tplsubject').value.trim();
  const bodyv = document.getElementById('tplbody').value;
  if(!name || !subject || !bodyv.trim()){ msg('tplmsg','Name, subject and body are required.', false); return; }
  try {
    if(id){ await api('/templates/'+id, {method:'PUT', body: JSON.stringify({name, subject, body: bodyv})}); }
    else  { await api('/templates', {method:'POST', body: JSON.stringify({name, subject, body: bodyv})}); }
    document.getElementById('tpleditor').style.display='none';
    loadTemplates();
  } catch(e){ msg('tplmsg', e.message, false); }
}
async function deleteTemplate(id){
  if(!confirm('Delete this template?')) return;
  try { await api('/templates/'+id, {method:'DELETE'}); loadTemplates(); }
  catch(e){ msg('tplmsg', e.message, false); }
}
function esc(s){ return (s||'').replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

if(TOKEN){ refreshStatus(); refreshSends(); loadTemplates(); }
setInterval(()=>{ if(TOKEN) refreshStatus(); }, 8000);
</script>
</body>
</html>"""
