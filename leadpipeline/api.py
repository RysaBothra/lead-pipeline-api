"""FastAPI wrapper: browser-based approval for the lead pipeline.

Run:
    pip install -r requirements.txt
    export OCEAN_API_KEY=... KIPPLO_API_KEY=... EAZYREACH_API_KEY=... \
           ANTHROPIC_API_KEY=... BREVO_API_KEY=... \
           FROM_EMAIL=you@domain.com FROM_NAME="You" CAMPAIGN_BRIEF="..."
    uvicorn leadpipeline.api:app --reload

Then open http://127.0.0.1:8000

Flow:
    POST /jobs        -> kick off a run (Ocean->Kipplo->EazyReach->draft) in the
                         background; returns a job_id.
    GET  /jobs/{id}   -> poll status + all drafts.
    PATCH /jobs/{id}/drafts/{draft_id}  -> edit subject/body/cc before sending.
    POST /jobs/{id}/drafts/{draft_id}/approve -> send via Brevo.
    POST /jobs/{id}/drafts/{draft_id}/reject  -> skip (records as skipped).
    GET  /jobs/{id}/report.csv | report.json  -> download the report.
"""
from __future__ import annotations

import io
import os
from dataclasses import asdict
from datetime import datetime
from typing import List, Optional

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from .agent import Agent, DraftConfig
from .clients.brevo import BrevoClient
from .clients.eazyreach import EazyReachClient
from .clients.kipplo import KipploClient
from .clients.ocean import OceanClient, SearchFilter
from .models import Attachment, SendResult
from .pipeline import Params, Pipeline
from .report import Report
from .store import JobStore

app = FastAPI(title="Lead Pipeline")
store = JobStore()


def _env(key: str) -> str:
    v = os.getenv(key)
    if not v:
        raise RuntimeError(f"missing required env var: {key}")
    return v


def _build_pipeline() -> Pipeline:
    cfg = DraftConfig(
        from_email=_env("FROM_EMAIL"),
        from_name=_env("FROM_NAME"),
        campaign_brief=_env("CAMPAIGN_BRIEF"),
    )
    return Pipeline(
        ocean=OceanClient(_env("OCEAN_API_KEY")),
        kipplo=KipploClient(_env("KIPPLO_API_KEY")),
        eazyreach=EazyReachClient(_env("EAZYREACH_API_KEY")),
        agent=Agent(_env("ANTHROPIC_API_KEY"), cfg),
        approver=None,  # web flow uses prepare()/send_one() instead
        brevo=BrevoClient(_env("BREVO_API_KEY")),
        report=Report(),
    )


# ---------- request/response schemas ----------

class StartJob(BaseModel):
    industries: List[str] = []
    countries: List[str] = []
    keywords: List[str] = []
    size_min: int = 0
    size_max: int = 0
    company_limit: int = 10
    decision_titles: List[str] = ["Founder", "CEO", "Director"]
    per_company_limit: int = 3


class EditDraft(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    cc: Optional[List[str]] = None


# ---------- background prepare task ----------

def _prepare_job(job_id: str, start: StartJob) -> None:
    try:
        pipeline = _build_pipeline()
    except RuntimeError as e:
        store.set_job_status(job_id, f"error: {e}")
        return

    params = Params(
        company_filter=SearchFilter(
            industries=start.industries,
            countries=start.countries,
            keywords=start.keywords,
            size_min=start.size_min,
            size_max=start.size_max,
            limit=start.company_limit,
        ),
        decision_titles=start.decision_titles,
        per_company_limit=start.per_company_limit,
    )

    # stash the pipeline on the job so approve/send reuses the same report
    _PIPELINES[job_id] = pipeline

    try:
        pipeline.prepare(params, lambda d: store.add_draft(job_id, d))
        store.set_job_status(job_id, "ready")
    except Exception as e:  # noqa: BLE001
        store.set_job_status(job_id, f"error: {e}")


# keep a pipeline per job so the report accumulates across sends
_PIPELINES: dict = {}


# ---------- routes ----------

@app.post("/jobs")
def start_job(start: StartJob, bg: BackgroundTasks):
    job = store.create()
    bg.add_task(_prepare_job, job.id, start)
    return {"job_id": job.id, "status": job.status}


def _draft_dict(item) -> dict:
    d = item.draft
    return {
        "id": d.id,
        "status": item.status,
        "from_domain": d.from_domain,
        "from_email": d.from_email,
        "from_name": d.from_name,
        "to_email": d.to_email,
        "to_name": d.to_name,
        "cc": d.cc,
        "subject": d.subject,
        "body": d.body,
        "attachments": [a.name for a in d.attachments],
        "message_id": item.result.message_id if item.result else "",
        "error": item.result.error if item.result else "",
    }


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    job = store.get(job_id)
    if not job:
        raise HTTPException(404, "job not found")
    return {
        "job_id": job.id,
        "status": job.status,
        "created_at": job.created_at.isoformat(),
        "drafts": [_draft_dict(i) for i in job.items.values()],
    }


@app.patch("/jobs/{job_id}/drafts/{draft_id}")
def edit_draft(job_id: str, draft_id: str, edit: EditDraft):
    job = store.get(job_id)
    if not job or draft_id not in job.items:
        raise HTTPException(404, "draft not found")
    item = job.items[draft_id]
    if item.status in ("sent",):
        raise HTTPException(409, "draft already sent")
    d = item.draft
    if edit.subject is not None:
        d.subject = edit.subject
    if edit.body is not None:
        d.body = edit.body
    if edit.cc is not None:
        d.cc = edit.cc
    store.update_draft(job_id, draft_id, draft=d)
    return _draft_dict(item)


@app.post("/jobs/{job_id}/drafts/{draft_id}/approve")
def approve_draft(job_id: str, draft_id: str):
    job = store.get(job_id)
    if not job or draft_id not in job.items:
        raise HTTPException(404, "draft not found")
    item = job.items[draft_id]
    if item.status == "sent":
        raise HTTPException(409, "already sent")
    pipeline = _PIPELINES.get(job_id)
    if not pipeline:
        raise HTTPException(409, "job pipeline not available")
    result = pipeline.send_one(item.draft)
    status = "sent" if result.status == "sent" else "failed"
    store.update_draft(job_id, draft_id, status=status, result=result)
    return _draft_dict(item)


@app.post("/jobs/{job_id}/drafts/{draft_id}/reject")
def reject_draft(job_id: str, draft_id: str):
    job = store.get(job_id)
    if not job or draft_id not in job.items:
        raise HTTPException(404, "draft not found")
    item = job.items[draft_id]
    res = SendResult(
        from_domain=item.draft.from_domain,
        from_username=item.draft.from_email.split("@", 1)[0],
        from_name=item.draft.from_name,
        to_email=item.draft.to_email,
        to_name=item.draft.to_name,
        cc_mail=item.draft.cc,
        subject=item.draft.subject,
        body=item.draft.body,
        attachments=item.draft.attachments,
        status="skipped",
        error="rejected",
        sent_at=datetime.now(),
    )
    pipeline = _PIPELINES.get(job_id)
    if pipeline:
        pipeline.report.add(res)
    store.update_draft(job_id, draft_id, status="rejected", result=res)
    return _draft_dict(item)


@app.get("/jobs/{job_id}/report.csv")
def report_csv(job_id: str):
    pipeline = _PIPELINES.get(job_id)
    if not pipeline:
        raise HTTPException(404, "job not found")
    path = f"/tmp/report_{job_id}.csv"
    pipeline.report.write_csv(path)
    return StreamingResponse(
        open(path, "rb"), media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=report_{job_id}.csv"},
    )


@app.get("/jobs/{job_id}/report.json")
def report_json(job_id: str):
    pipeline = _PIPELINES.get(job_id)
    if not pipeline:
        raise HTTPException(404, "job not found")
    results = []
    for r in pipeline.report.results:
        d = asdict(r)
        d["sent_at"] = r.sent_at.isoformat() if r.sent_at else None
        results.append(d)
    return JSONResponse(results)


@app.get("/", response_class=HTMLResponse)
def index():
    return _INDEX_HTML


_INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Lead Pipeline — Approvals</title>
<style>
  :root { --bg:#0f1117; --card:#1a1d27; --line:#2a2e3a; --txt:#e6e8ee;
          --muted:#9aa0ad; --accent:#630077; --accent2:#8a2be2;
          --ok:#1f8b4c; --bad:#b3261e; --skip:#6b7280; }
  * { box-sizing:border-box; }
  body { margin:0; font:15px/1.5 system-ui,sans-serif; background:var(--bg); color:var(--txt); }
  header { padding:20px 24px; border-bottom:1px solid var(--line); display:flex;
           align-items:center; gap:16px; }
  h1 { font-size:18px; margin:0; }
  main { padding:24px; max-width:920px; margin:0 auto; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  input, textarea { background:var(--card); color:var(--txt); border:1px solid var(--line);
                    border-radius:8px; padding:8px 10px; font:inherit; }
  textarea { width:100%; min-height:140px; resize:vertical; }
  button { background:var(--accent); color:#fff; border:0; border-radius:8px;
           padding:9px 14px; font:inherit; cursor:pointer; }
  button.ghost { background:transparent; border:1px solid var(--line); color:var(--txt); }
  button.bad { background:var(--bad); }
  button:disabled { opacity:.5; cursor:default; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px;
          padding:16px; margin:14px 0; }
  .meta { color:var(--muted); font-size:13px; }
  .pill { font-size:12px; padding:2px 8px; border-radius:999px; border:1px solid var(--line); }
  .pill.pending{color:#d6b300} .pill.sent{color:#39d98a;border-color:#1f8b4c}
  .pill.rejected{color:#aaa} .pill.failed{color:#ff6b61;border-color:#b3261e}
  .field { margin:8px 0; }
  label { font-size:12px; color:var(--muted); display:block; margin-bottom:3px; }
  .actions { margin-top:10px; display:flex; gap:8px; }
  a { color:var(--accent2); }
  .status { color:var(--muted); margin:8px 0 0; }
</style>
</head>
<body>
<header>
  <h1>Lead Pipeline — Draft Approvals</h1>
</header>
<main>
  <div class="card">
    <div class="row">
      <input id="keywords" placeholder="keywords (comma sep) e.g. dental" style="flex:1"/>
      <input id="countries" placeholder="countries e.g. IN" style="width:120px"/>
      <input id="limit" type="number" value="5" title="company limit" style="width:90px"/>
      <button id="start">Start run</button>
    </div>
    <p class="status" id="jobstatus"></p>
  </div>
  <div id="drafts"></div>
  <div id="reportlinks"></div>
</main>
<script>
let JOB = null, poll = null;

document.getElementById('start').onclick = async () => {
  const body = {
    keywords: split(val('keywords')),
    countries: split(val('countries')),
    company_limit: parseInt(val('limit')||'5', 10),
  };
  const r = await fetch('/jobs', {method:'POST', headers:{'Content-Type':'application/json'},
                                  body: JSON.stringify(body)});
  const j = await r.json();
  JOB = j.job_id;
  status('Job ' + JOB + ' — ' + j.status);
  if (poll) clearInterval(poll);
  poll = setInterval(refresh, 1500);
  refresh();
};

function val(id){ return document.getElementById(id).value.trim(); }
function split(s){ return s ? s.split(',').map(x=>x.trim()).filter(Boolean) : []; }
function status(t){ document.getElementById('jobstatus').textContent = t; }

async function refresh(){
  if(!JOB) return;
  const r = await fetch('/jobs/'+JOB);
  const j = await r.json();
  status('Job '+JOB+' — '+j.status+' — '+j.drafts.length+' draft(s)');
  if(j.status==='ready' || j.status==='done' || j.status.startsWith('error')){
    if(poll){ clearInterval(poll); poll=null; }
  }
  render(j.drafts);
  const links = document.getElementById('reportlinks');
  links.innerHTML = j.drafts.length
    ? '<p>Report: <a href="/jobs/'+JOB+'/report.csv">CSV</a> · '
      + '<a href="/jobs/'+JOB+'/report.json">JSON</a></p>' : '';
}

function render(drafts){
  const box = document.getElementById('drafts');
  box.innerHTML = '';
  for(const d of drafts){
    const sent = d.status==='sent';
    const done = sent || d.status==='rejected';
    const el = document.createElement('div');
    el.className='card';
    el.innerHTML = `
      <div class="row" style="justify-content:space-between">
        <div><strong>${esc(d.to_name)}</strong>
          <span class="meta">&lt;${esc(d.to_email)}&gt; · ${esc(d.from_domain)}</span></div>
        <span class="pill ${d.status}">${d.status}</span>
      </div>
      <div class="meta">From: ${esc(d.from_name)} &lt;${esc(d.from_email)}&gt;</div>
      <div class="field"><label>CC (comma sep)</label>
        <input data-k="cc" value="${esc(d.cc.join(', '))}" ${done?'disabled':''} style="width:100%"/></div>
      <div class="field"><label>Subject</label>
        <input data-k="subject" value="${esc(d.subject)}" ${done?'disabled':''} style="width:100%"/></div>
      <div class="field"><label>Body (HTML)</label>
        <textarea data-k="body" ${done?'disabled':''}>${esc(d.body)}</textarea></div>
      ${d.message_id?`<div class="meta">message id: ${esc(d.message_id)}</div>`:''}
      ${d.error?`<div class="meta" style="color:#ff6b61">error: ${esc(d.error)}</div>`:''}
      <div class="actions">
        <button data-act="approve" ${done?'disabled':''}>Approve &amp; send</button>
        <button class="ghost" data-act="save" ${done?'disabled':''}>Save edits</button>
        <button class="bad" data-act="reject" ${done?'disabled':''}>Reject</button>
      </div>`;
    const get = k => el.querySelector(`[data-k="${k}"]`).value;
    el.querySelector('[data-act="save"]').onclick = () => save(d.id, {
      subject:get('subject'), body:get('body'),
      cc:split(get('cc'))
    });
    el.querySelector('[data-act="approve"]').onclick = async () => {
      await save(d.id, {subject:get('subject'), body:get('body'), cc:split(get('cc'))});
      await act(d.id, 'approve');
    };
    el.querySelector('[data-act="reject"]').onclick = () => act(d.id, 'reject');
    box.appendChild(el);
  }
}

async function save(id, patch){
  await fetch('/jobs/'+JOB+'/drafts/'+encodeURIComponent(id), {
    method:'PATCH', headers:{'Content-Type':'application/json'},
    body: JSON.stringify(patch)});
}
async function act(id, a){
  await fetch('/jobs/'+JOB+'/drafts/'+encodeURIComponent(id)+'/'+a, {method:'POST'});
  refresh();
}
function esc(s){ return (s||'').replace(/[&<>"]/g, c =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
</script>
</body>
</html>"""
