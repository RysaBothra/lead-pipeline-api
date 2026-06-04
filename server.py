r"""Public API server for the lead pipeline.

One FastAPI app, protected by an API key, exposing:

  GET  /health                 - liveness check (no auth)
  POST /send                   - send one email via Brevo (the mailer)
  POST /pipeline/run           - kick off Ocean->Prospeo->EazyReach->Brevo in the
                                 background for pending ocean_inputs rows
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
from typing import Optional

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException
from fastapi.responses import RedirectResponse
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


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------
@app.get("/", include_in_schema=False)
def root():
    """Open the bare URL -> send people to the interactive docs."""
    return RedirectResponse(url="/docs")


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
            from_username=opts.from_username, from_name=opts.from_name)
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
