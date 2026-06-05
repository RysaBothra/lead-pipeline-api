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

from fastapi import (BackgroundTasks, Depends, FastAPI, Form, Header,
                     HTTPException, Request, Response)
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

# Reuse the already-built, tested pieces.
from mailer_api import SendReport, SendRequest
from mailer_api import send as _mailer_send
from leadpipeline.hasura_store import HasuraStore
from leadpipeline.auth import (clear_session_cookie, create_session_token,
                               create_user, current_user, get_user_by_email,
                               optional_user, set_session_cookie,
                               verify_password)
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
def root(request: Request):
    """Dashboard — requires a logged-in session, else redirect to /login."""
    user = optional_user(request)
    if not user:
        return RedirectResponse("/login", status_code=302)
    return HTMLResponse(_GUI_HTML.replace("{{USER_EMAIL}}", user.get("email", "")))


# --------------------------------------------------------------------------
# Auth pages + routes (own email/password auth, JWT session cookie)
# --------------------------------------------------------------------------
@app.get("/login", include_in_schema=False)
def login_page(request: Request):
    if optional_user(request):
        return RedirectResponse("/", status_code=302)
    return HTMLResponse(_auth_page("login"))


@app.get("/signup", include_in_schema=False)
def signup_page(request: Request):
    if optional_user(request):
        return RedirectResponse("/", status_code=302)
    return HTMLResponse(_auth_page("signup"))


@app.post("/signup", include_in_schema=False)
def signup_submit(email: str = Form(...), password: str = Form(...),
                  name: str = Form("")):
    email = (email or "").strip().lower()
    if not email or "@" not in email:
        return HTMLResponse(_auth_page("signup", "Enter a valid email."), 400)
    if len(password or "") < 8:
        return HTMLResponse(
            _auth_page("signup", "Password must be at least 8 characters."), 400)
    store = HasuraStore()
    try:
        user = create_user(store, email, password, name)
    except ValueError:
        return HTMLResponse(
            _auth_page("signup", "That email is already registered."), 409)
    token = create_session_token(user["id"], user["email"])
    resp = RedirectResponse("/", status_code=302)
    set_session_cookie(resp, token)
    return resp


@app.post("/login", include_in_schema=False)
def login_submit(email: str = Form(...), password: str = Form(...)):
    store = HasuraStore()
    user = get_user_by_email(store, (email or "").strip().lower())
    if (not user or not user.get("is_active")
            or not verify_password(password, user.get("password_hash", ""))):
        return HTMLResponse(_auth_page("login", "Wrong email or password."), 401)
    token = create_session_token(user["id"], user["email"])
    resp = RedirectResponse("/", status_code=302)
    set_session_cookie(resp, token)
    return resp


@app.get("/logout", include_in_schema=False)
@app.post("/logout", include_in_schema=False)
def logout():
    resp = RedirectResponse("/login", status_code=302)
    clear_session_cookie(resp)
    return resp


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


def _run_followups_job(opts: FollowupRequest, only_emails: set) -> None:
    try:
        out = pipeline_hasura.run_followups(
            send=opts.send, min_gap_days=opts.min_gap_days, limit=opts.limit,
            from_username=opts.from_username, from_name=opts.from_name,
            only_emails=only_emails)
        print(f"[followups] done: eligible={out['eligible']} sent={out['sent']}")
    except Exception as e:  # noqa: BLE001
        print(f"[followups] FAILED: {e}")


@app.post("/pipeline/followups")
def pipeline_followups(req: FollowupRequest, bg: BackgroundTasks,
                       user: dict = Depends(current_user)) -> dict:
    """Manually send the next follow-up to THIS user's contacts who are due one.

    NEVER automatic. Each contact gets at most initial + 2 follow-ups, spaced
    >= min_gap_days apart, then stops. With send=false (default) this is a DRY
    RUN that returns exactly who would be emailed without sending anything;
    call again with send=true to actually deliver (runs in the background).
    """
    store = HasuraStore()
    only = _user_recipient_emails(store, user["id"])
    if not req.send:
        # Dry-run preview is fast (Hasura reads only) — run inline and return it.
        return pipeline_hasura.run_followups(
            send=False, min_gap_days=req.min_gap_days, limit=req.limit,
            from_username=req.from_username, from_name=req.from_name,
            only_emails=only)
    bg.add_task(_run_followups_job, req, only)
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
def add_input(req: InputCreate, user: dict = Depends(current_user)) -> dict:
    """Add a target seed domain to ocean_inputs, tagged with the logged-in user.
    The Hasura event trigger then runs the full pipeline for it."""
    store = HasuraStore()
    row = store.insert_one("ocean_inputs", {
        "seed_domain": req.seed_domain.strip(),
        "countries": req.countries,
        "max_results": req.max_results,
        "user_id": user["id"],
    })
    return {"status": "created", "id": row.get("id"),
            "seed_domain": req.seed_domain.strip(),
            "note": "pipeline runs automatically via the Hasura event trigger"}


@app.get("/pipeline/sends")
def pipeline_sends(user: dict = Depends(current_user)) -> list:
    """Recent delivered emails for THIS user (the sent log is shared, so filter
    to addresses belonging to the user's contacts)."""
    store = HasuraStore()
    mine = _user_recipient_emails(store, user["id"])
    if not mine:
        return []
    rows = store.fetch(
        "subspace_sent_email_log",
        "from_domain brevo_from to_mails subject message_id sent_at",
        order_by="{sent_at: desc}", limit=200)
    out = []
    for r in rows:
        if any(t in mine for t in (r.get("to_mails") or [])):
            out.append(r)
        if len(out) >= 25:
            break
    return out


def _id_in(ids: list) -> str:
    """GraphQL _in snippet for a list of uuid strings."""
    return "[" + ", ".join('"%s"' % i for i in ids) + "]"


def _user_recipient_emails(store: HasuraStore, user_id: str) -> set:
    """Every recipient email belonging to a user's contacts, by walking their
    inputs -> companies -> decision_makers -> email_contacts. Used to scope the
    shared sent-log and follow-ups to one tenant."""
    inputs = store.fetch("ocean_inputs", "id",
                         where='{user_id: {_eq: "%s"}}' % user_id)
    iids = [i["id"] for i in inputs]
    if not iids:
        return set()
    comps = store.fetch("ocean_companies", "id",
                        where='{input_id: {_in: %s}}' % _id_in(iids))
    cids = [c["id"] for c in comps]
    if not cids:
        return set()
    dms = store.fetch("decision_makers", "id",
                      where='{company_id: {_in: %s}}' % _id_in(cids))
    dids = [d["id"] for d in dms]
    if not dids:
        return set()
    ecs = store.fetch("email_contacts", "email",
                      where='{decision_maker_id: {_in: %s}}' % _id_in(dids))
    return {e["email"] for e in ecs if e.get("email")}


@app.get("/pipeline/status")
def pipeline_status(user: dict = Depends(current_user)) -> dict:
    """Stage counts scoped to the logged-in user's MOST RECENT run (not lifetime
    totals). Walks their latest input -> companies -> people -> emails by id."""
    store = HasuraStore()
    cfg = {
        "DECISION_TITLES": os.getenv("DECISION_TITLES", "(unset)"),
        "PER_COMPANY_LIMIT": os.getenv("PER_COMPANY_LIMIT", "(unset)"),
    }
    out = {"ocean_inputs_pending": 0, "ocean_companies": 0,
           "decision_makers": 0, "email_contacts": 0,
           "emails_found": 0, "emails_sent": 0, "scope": None, "config": cfg}

    latest = store.fetch("ocean_inputs", "id seed_domain status created_at",
                         where='{user_id: {_eq: "%s"}}' % user["id"],
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


def _esc(s: str) -> str:
    return ((s or "").replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;"))


_AUTH_TMPL = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>__TITLE__ · Lead Pipeline</title>
<style>
  :root { --bg:#0f1117; --card:#1a1d27; --line:#2a2e3a; --txt:#e6e8ee;
          --muted:#9aa0ad; --accent:#5B3DF5; --bad:#ff6b61; }
  * { box-sizing:border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center;
         justify-content:center; font:15px/1.5 system-ui,Segoe UI,sans-serif;
         background:var(--bg); color:var(--txt); }
  .box { background:var(--card); border:1px solid var(--line); border-radius:14px;
         padding:30px 28px; width:340px; }
  h1 { font-size:19px; margin:0 0 4px; }
  p.sub { color:var(--muted); font-size:13px; margin:0 0 18px; }
  label { font-size:12px; color:var(--muted); display:block; margin:12px 0 4px; }
  input { width:100%; background:#11141d; color:var(--txt); border:1px solid var(--line);
          border-radius:8px; padding:10px 12px; font:inherit; }
  button { width:100%; margin-top:18px; background:var(--accent); color:#fff; border:0;
           border-radius:8px; padding:11px; font:inherit; font-weight:600; cursor:pointer; }
  .alt { text-align:center; font-size:13px; color:var(--muted); margin-top:16px; }
  a { color:#9b8cf7; }
  .err { background:rgba(255,107,97,.12); border:1px solid var(--bad); color:var(--bad);
         font-size:13px; border-radius:8px; padding:8px 10px; margin-bottom:6px; }
</style></head><body>
  <form class="box" method="post" action="__ACTION__">
    <h1>__TITLE__</h1>
    <p class="sub">Lead Pipeline</p>
    __ERR__
    __NAME__
    <label>Email</label>
    <input name="email" type="email" required placeholder="you@company.com"/>
    <label>Password</label>
    <input name="password" type="password" required __MINLEN__ placeholder="••••••••"/>
    <button type="submit">__CTA__</button>
    <div class="alt">__ALT__</div>
  </form>
</body></html>"""


def _auth_page(mode: str, error: str = "") -> str:
    is_login = mode == "login"
    html = _AUTH_TMPL
    html = html.replace("__TITLE__", "Log in" if is_login else "Create account")
    html = html.replace("__ACTION__", "/login" if is_login else "/signup")
    html = html.replace("__CTA__", "Log in" if is_login else "Sign up")
    html = html.replace(
        "__ALT__",
        'No account? <a href="/signup">Sign up</a>' if is_login
        else 'Have an account? <a href="/login">Log in</a>')
    html = html.replace(
        "__NAME__", "" if is_login else
        '<label>Name</label><input name="name" placeholder="Your name"/>')
    html = html.replace("__MINLEN__", "" if is_login else 'minlength="8"')
    html = html.replace(
        "__ERR__", f'<div class="err">{_esc(error)}</div>' if error else "")
    return html


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
  <span style="margin-left:auto;font-size:13px;color:var(--muted)">{{USER_EMAIL}}</span>
  <a href="/logout" style="font-size:13px">Log out</a>
</header>
<main>

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
    <div id="scopelbl" style="font-size:12px;color:var(--muted);margin:0 0 10px">—</div>
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
function msg(id, text, ok){
  const el = document.getElementById(id);
  if(!el) return;
  el.textContent = text; el.className = 'msg ' + (ok ? 'ok' : 'bad');
}
async function api(path, opts){
  opts = opts || {};
  opts.headers = Object.assign({'Content-Type':'application/json'}, opts.headers||{});
  const r = await fetch(path, opts);  // session cookie is sent automatically
  if(r.status === 401){ window.location = '/login'; throw new Error('not logged in'); }
  if(!r.ok){ throw new Error('HTTP '+r.status+' '+(await r.text())); }
  return r.json();
}
async function refreshStatus(){
  try {
    const s = await api('/pipeline/status');
    const order = [['ocean_inputs_pending','Pending'],['ocean_companies','Companies'],
                   ['decision_makers','People'],['emails_found','Found'],
                   ['emails_sent','Sent']];
    document.getElementById('stats').innerHTML = order.map(([k,lab]) =>
      `<div class="stat"><b>${s[k] ?? '–'}</b><span>${lab}</span></div>`).join('');
    const sc = s.scope;
    document.getElementById('scopelbl').textContent = sc
      ? `Showing latest run: ${sc.seed_domain} · ${sc.status}`
      : 'No runs yet';
  } catch(e){ msg('addmsg', e.message, false); }
}
async function refreshSends(){
  try {
    const rows = await api('/pipeline/sends');
    const body = document.getElementById('sends');
    if(!rows.length){ body.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">No sends yet</td></tr>'; return; }
    body.innerHTML = rows.map(r => {
      const to = Array.isArray(r.to_mails) ? r.to_mails.join(', ') : (r.to_mails||'');
      const dt = (r.sent_at||'').replace('T',' ').slice(0,16);
      return `<tr><td>${dt}</td><td><code>${r.from_domain||''}</code></td><td>${esc(to)}</td><td>${esc(r.subject||'')}</td></tr>`;
    }).join('');
  } catch(e){ msg('addmsg', e.message, false); }
}
async function addTarget(){
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

refreshStatus(); refreshSends();
setInterval(refreshStatus, 8000);
</script>
</body>
</html>"""
