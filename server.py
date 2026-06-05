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
from typing import List, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

# Reuse the already-built, tested pieces.
from mailer_api import SendReport, SendRequest
from mailer_api import send as _mailer_send
from leadpipeline.hasura_store import HasuraStore
import pipeline_hasura

app = FastAPI(title="Lead Pipeline API")

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
    seed_domain: str
    countries: List[str] = ["IN"]
    max_results: int = 10


class FollowupRequest(BaseModel):
    send: bool = False           # False = dry-run preview (sends nothing)
    min_gap_days: int = 4        # min days since a contact's last send
    limit: int = 0               # cap recipients (0 = all eligible)
    from_username: str = "joy"   # which verified Brevo sender local-part to use
    from_name: str = "Joy"


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def root() -> HTMLResponse:
    """Simple web dashboard for the pipeline."""
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
    """Add a target seed domain to ocean_inputs. The Hasura event trigger then
    runs the full pipeline (Ocean -> Prospeo -> EazyReach -> Brevo) for it."""
    store = HasuraStore()
    row = store.insert_one("ocean_inputs", {
        "seed_domain": req.seed_domain.strip(),
        "countries": req.countries,
        "max_results": req.max_results,
    })
    return {"status": "created", "id": row.get("id"),
            "seed_domain": req.seed_domain.strip(),
            "note": "pipeline runs automatically via the Hasura event trigger"}


@app.get("/pipeline/sends")
def pipeline_sends(_: None = Depends(require_token)) -> list:
    """Recent delivered emails from subspace_sent_email_log (incl. sending domain)."""
    store = HasuraStore()
    return store.fetch(
        "subspace_sent_email_log",
        "from_domain brevo_from to_mails subject message_id sent_at",
        order_by="{sent_at: desc}", limit=25)


@app.get("/pipeline/status")
def pipeline_status(_: None = Depends(require_token)) -> dict:
    """Aggregate counts per stage table from Hasura."""
    store = HasuraStore()
    out = {}
    for table in ("ocean_inputs", "ocean_companies", "decision_makers",
                  "email_contacts"):
        try:
            data = store.execute(
                f"query {{ {table}_aggregate {{ aggregate {{ count }} }} }}")
            out[table] = data[f"{table}_aggregate"]["aggregate"]["count"]
        except Exception as e:  # noqa: BLE001
            out[table] = f"error: {e}"
    # pending inputs left to process
    try:
        pend = store.fetch("ocean_inputs", "id",
                           where='{status: {_eq: "pending"}}')
        out["ocean_inputs_pending"] = len(pend)
    except Exception:  # noqa: BLE001
        pass
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
  input { background:#11141d; color:var(--txt); border:1px solid var(--line); border-radius:8px; padding:9px 11px; font:inherit; width:100%; }
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
  <h1>Lead Pipeline</h1>
  <span style="color:var(--muted);font-size:13px">Ocean → Prospeo → EazyReach → Brevo</span>
  <a href="/docs" style="margin-left:auto;font-size:13px">API docs</a>
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
    <div class="row">
      <div style="flex:3"><label>Company domain (seed)</label><input id="domain" placeholder="e.g. razorpay.com"/></div>
      <div><label>Country</label><input id="country" value="IN"/></div>
      <div><label>Max results</label><input id="max" type="number" value="10"/></div>
      <button id="addbtn" onclick="addTarget()">Add &amp; Run</button>
    </div>
    <div class="msg" id="addmsg"></div>
    <p style="font-size:12px;color:var(--muted);margin:10px 0 0">
      Adding a domain runs the whole pipeline automatically and <b>sends real emails</b> to the contacts it finds.
    </p>
  </div>

  <div class="card">
    <h2>Pipeline status <button class="ghost" style="float:right;padding:4px 10px" onclick="refreshStatus()">Refresh</button></h2>
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
  refreshStatus(); refreshSends();
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
    const order = [['ocean_inputs_pending','Pending'],['ocean_companies','Companies'],
                   ['decision_makers','People'],['email_contacts','Emails']];
    document.getElementById('stats').innerHTML = order.map(([k,lab]) =>
      `<div class="stat"><b>${s[k] ?? '–'}</b><span>${lab}</span></div>`).join('');
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
async function addTarget(){
  if(!TOKEN){ msg('addmsg','Save your token first.', false); return; }
  const domain = document.getElementById('domain').value.trim();
  if(!domain){ msg('addmsg','Enter a domain.', false); return; }
  const btn = document.getElementById('addbtn'); btn.disabled = true;
  try {
    const body = JSON.stringify({
      seed_domain: domain,
      countries: [document.getElementById('country').value.trim() || 'IN'],
      max_results: parseInt(document.getElementById('max').value||'10',10)
    });
    const res = await api('/inputs', {method:'POST', body});
    msg('addmsg', 'Added '+res.seed_domain+' — pipeline running. Watch status & sends below.', true);
    document.getElementById('domain').value='';
    setTimeout(refreshStatus, 1500);
  } catch(e){ msg('addmsg', e.message, false); }
  finally { btn.disabled = false; }
}
function esc(s){ return (s||'').replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

if(TOKEN){ refreshStatus(); refreshSends(); }
setInterval(()=>{ if(TOKEN) refreshStatus(); }, 8000);
</script>
</body>
</html>"""
