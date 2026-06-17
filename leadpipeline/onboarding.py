"""Onboarding wizard backend (InboundIQ-style flow).

One leadsiq_onboarding row holds a whole wizard session. The flow:

  1. start(website, user_id)            -> creates a 'draft' row, returns its id
  2. run_analysis(onboarding_id)        -> fetch+LLM, fills sections, status
                                           goes draft -> analyzing -> analyzed
                                           (run this in a FastAPI BackgroundTask)
  3. update_sections(id, {...})         -> autosave any edited section column
  4. launch(id)                         -> validate + mark 'ready' (persist only;
                                           does NOT send. Outbound is separate.)

Progress (0..100) is written as the analysis advances so the UI's
"AI is analyzing your website…" bar has something real to poll.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from leadpipeline.hasura_store import HasuraStore
from leadpipeline import website_analyzer

# Columns the wizard is allowed to PATCH (every editable section).
EDITABLE_FIELDS = {
    "website", "services", "differentiators", "personas", "geographies",
    "ideal_companies", "exclusions", "offers", "voice_profile",
}

# Everything the API returns for a session (kept in one place so reads are
# consistent across endpoints).
_ROW_FIELDS = (
    "id user_id website status analysis_progress analysis_error "
    "services differentiators personas geographies ideal_companies "
    "exclusions offers voice_profile raw_analysis launched_at "
    "created_at updated_at"
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _store() -> HasuraStore:
    return HasuraStore()


def start(website: str, user_id: Optional[str] = None) -> Dict[str, Any]:
    """Create a fresh draft session for a website. Returns the new row."""
    website = (website or "").strip()
    if not website:
        raise ValueError("website is required")
    obj: Dict[str, Any] = {"website": website, "status": "draft"}
    if user_id:
        obj["user_id"] = user_id
    return _store().insert_one("onboarding", obj, returning=_ROW_FIELDS)


def get(onboarding_id: str) -> Optional[Dict[str, Any]]:
    rows = _store().fetch("onboarding", _ROW_FIELDS,
                          where='{id: {_eq: "%s"}}' % onboarding_id, limit=1)
    return rows[0] if rows else None


def list_sessions(user_id: Optional[str] = None,
                  limit: int = 25) -> List[Dict[str, Any]]:
    where = '{user_id: {_eq: "%s"}}' % user_id if user_id else None
    return _store().fetch("onboarding",
                          "id website status analysis_progress updated_at created_at",
                          where=where, order_by="{created_at: desc}", limit=limit)


def update_sections(onboarding_id: str, changes: Dict[str, Any]) -> Dict[str, Any]:
    """Autosave one or more editable sections. Unknown keys are ignored."""
    clean = {k: v for k, v in changes.items() if k in EDITABLE_FIELDS}
    if not clean:
        raise ValueError("no editable fields in payload")
    clean["updated_at"] = _now()
    return _store().update_by_pk("onboarding", onboarding_id, clean,
                                 returning=_ROW_FIELDS)


def run_analysis(onboarding_id: str) -> None:
    """Fetch + LLM-analyze the session's website and fill in every section.

    Safe to call from a BackgroundTask: it owns its own error handling and
    writes status/progress/error straight to the row. Never raises.
    """
    store = _store()
    row = get(onboarding_id)
    if not row:
        return
    website = row.get("website") or ""

    def _progress(pct: int, **extra: Any) -> None:
        store.update_by_pk("onboarding", onboarding_id,
                           {"analysis_progress": pct, "updated_at": _now(), **extra})

    try:
        _progress(15, status="analyzing", analysis_error=None)
        result = website_analyzer.analyze(website)  # fetch + LLM (the slow part)
        _progress(80)
        store.update_by_pk("onboarding", onboarding_id, {
            "services": result["services"],
            "differentiators": result["differentiators"],
            "personas": result["personas"],
            "geographies": result["geographies"],
            "ideal_companies": result["ideal_companies"],
            "offers": result["offers"],
            "voice_profile": result["voice_profile"],
            "raw_analysis": result["raw"],
            "status": "analyzed",
            "analysis_progress": 100,
            "analysis_error": None,
            "updated_at": _now(),
        })
    except website_analyzer.AnalyzerError as e:
        store.update_by_pk("onboarding", onboarding_id, {
            "status": "error", "analysis_error": str(e)[:500],
            "updated_at": _now()})
    except Exception as e:  # noqa: BLE001 - never let a bg task crash silently
        store.update_by_pk("onboarding", onboarding_id, {
            "status": "error",
            "analysis_error": ("unexpected: " + str(e))[:500],
            "updated_at": _now()})


def launch(onboarding_id: str) -> Dict[str, Any]:
    """Validate the session and mark it ready. Persist-only: this does NOT start
    any outbound sending — turning the profile into a real campaign is a separate
    step. Returns {status, onboarding_id, summary}."""
    row = get(onboarding_id)
    if not row:
        raise ValueError("onboarding session not found")

    missing = []
    if not (row.get("services") or []):
        missing.append("services")
    if not (row.get("personas") or []):
        missing.append("personas")
    if missing:
        raise ValueError("cannot launch — missing: " + ", ".join(missing))

    _store().update_by_pk("onboarding", onboarding_id, {
        "status": "launched", "launched_at": _now(), "updated_at": _now()})

    personas = row.get("personas") or []
    offers = row.get("offers") or []
    return {
        "status": "launched",
        "onboarding_id": onboarding_id,
        "summary": {
            "website": row.get("website"),
            "services": len(row.get("services") or []),
            "differentiators": len(row.get("differentiators") or []),
            "personas": len(personas),
            "selected_offers": [o["text"] for o in offers if o.get("selected")],
        },
        "note": "Profile saved and marked ready. Outbound sending is a separate step.",
    }
