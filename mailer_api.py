r"""Multi-account Brevo mailer endpoint (curl-able).

Picks the Brevo account with the MOST remaining send credits from a keys
database and sends one email through it. For follow-up / top-up mails, pass
`from_mail` and it reuses the exact account that owns that sender address, so
the follow-up goes out from the same address as the primary.

Run:
    uvicorn mailer_api:app --reload --port 8001

Send (curl):
    curl -s -X POST http://127.0.0.1:8001/send ^
      -H "Content-Type: application/json" ^
      -d "{\"from_username\":\"joy\",\"from_name\":\"Joy\",\"to_email\":\"x@y.com\",
           \"text_body\":\"<h1>Hi</h1>\",\"subject\":\"Hello\",\"content_type\":\"html\"}"

Response (the "report", also appended to mailer_report.csv):
    {"message_id": "<...@smtp-relay.mailin.fr>", "from_mail": "joy@vocallabs.store",
     "subject": "Hello", "to_mail": "x@y.com"}

Follow-up / top-up: send again with from_mail set to the original from_mail AND
in_reply_to set to the original message_id — the follow-up goes from the same
address and threads under the original.

Keys database (source order):
    1. Hasura GraphQL — set these env vars to enable:
         HASURA_GRAPHQL_URL       e.g. https://your-app.hasura.app/v1/graphql
         HASURA_ADMIN_SECRET      (if your endpoint uses an admin secret)
         HASURA_KEYS_TABLE        table holding the keys      (default: brevo_keys)
         HASURA_KEYS_APIKEY_FIELD column with the API key      (default: api_key)
         HASURA_KEYS_LABEL_FIELD  column with a label/name     (default: label)
    2. brevo_keys.json (or $BREVO_KEYS_FILE)  {"keys":[{"label","api_key"}, ...]}
    3. $BREVO_API_KEYS (comma separated)  /  $BREVO_API_KEY
"""
from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from leadpipeline.clients.brevo import BrevoClient

app = FastAPI(title="Brevo Multi-Account Mailer")

KEYS_FILE = os.getenv("BREVO_KEYS_FILE", "brevo_keys.json")
# Every successful send is appended here as one row.
REPORT_CSV = os.getenv("MAILER_REPORT_CSV", "mailer_report.csv")

# --- Hasura (GraphQL) keys database config ---------------------------------
# Set HASURA_GRAPHQL_URL to enable. Table/column names are configurable so this
# matches whatever your schema calls them (defaults shown).
HASURA_URL = (os.getenv("HASURA_GRAPHQL_URL") or "").strip()
HASURA_SECRET = (os.getenv("HASURA_ADMIN_SECRET") or "").strip()
HASURA_TABLE = (os.getenv("HASURA_KEYS_TABLE") or "brevo_keys").strip()
HASURA_APIKEY_FIELD = (os.getenv("HASURA_KEYS_APIKEY_FIELD") or "api_key").strip()
HASURA_LABEL_FIELD = (os.getenv("HASURA_KEYS_LABEL_FIELD") or "label").strip()
# Table that each send's report row is inserted into.
HASURA_SENDS_TABLE = (os.getenv("HASURA_SENDS_TABLE") or "email_sends").strip()

# content_type values that mean "send as plain text" (everything else -> HTML)
_TEXT_TYPES = {"text", "plain", "txt", "text/plain", "textcontent"}


def _load_keys_from_hasura() -> List[Dict]:
    """Fetch [{label, api_key}, ...] from the Hasura GraphQL keys database.

    Reads table HASURA_KEYS_TABLE selecting HASURA_LABEL_FIELD +
    HASURA_KEYS_APIKEY_FIELD. Auth via x-hasura-admin-secret if set.
    Returns [] when Hasura isn't configured so the file/env fallbacks apply.
    """
    if not HASURA_URL:
        return []
    query = (f"query BrevoKeys {{ {HASURA_TABLE} "
             f"{{ {HASURA_LABEL_FIELD} {HASURA_APIKEY_FIELD} }} }}")
    headers = {"Content-Type": "application/json"}
    if HASURA_SECRET:
        headers["x-hasura-admin-secret"] = HASURA_SECRET
    r = requests.post(HASURA_URL, json={"query": query},
                      headers=headers, timeout=30)
    r.raise_for_status()
    payload = r.json()
    if payload.get("errors"):
        raise RuntimeError(f"Hasura query failed: {payload['errors']}")
    rows = (payload.get("data") or {}).get(HASURA_TABLE) or []
    out = []
    for row in rows:
        ak = (row.get(HASURA_APIKEY_FIELD) or "").strip()
        if ak:
            out.append({"label": row.get(HASURA_LABEL_FIELD) or ak[:12],
                        "api_key": ak})
    return out


def load_keys() -> List[Dict]:
    """Return [{label, api_key}, ...] from the keys database.

    Source order: Hasura (if HASURA_GRAPHQL_URL set) -> brevo_keys.json
    (or $BREVO_KEYS_FILE) -> $BREVO_API_KEYS (comma sep) -> $BREVO_API_KEY.
    """
    hasura = _load_keys_from_hasura()
    if hasura:
        return hasura
    p = Path(KEYS_FILE)
    if p.exists():
        data = json.loads(p.read_text(encoding="utf-8"))
        rows = data.get("keys") if isinstance(data, dict) else data
        out = []
        for k in rows or []:
            ak = (k.get("api_key") or "").strip()
            if ak:
                out.append({"label": k.get("label") or ak[:12], "api_key": ak})
        if out:
            return out
    env_multi = os.getenv("BREVO_API_KEYS")
    if env_multi:
        return [{"label": f"key{i}", "api_key": k.strip()}
                for i, k in enumerate(env_multi.split(",")) if k.strip()]
    single = (os.getenv("BREVO_API_KEY") or "").strip()
    if single:
        return [{"label": "default", "api_key": single}]
    return []


def _account_view(api_key: str) -> Tuple[Optional[int], List[Dict]]:
    """(remaining_credits, active_senders) for one key, or (None, []) on error."""
    c = BrevoClient(api_key)
    try:
        return c.send_credits(), c.list_senders(only_active=True)
    except Exception:  # noqa: BLE001 — a dead/invalid key just gets skipped
        return None, []


class SendRequest(BaseModel):
    from_username: str          # local-part of the desired sender (e.g. "joy")
    from_name: str              # display name on the email
    to_email: str
    text_body: str              # the email body (HTML or plain per content_type)
    subject: str
    content_type: str = "html"  # "html" or "text"
    from_mail: Optional[str] = None   # set for follow-ups: reuse this exact sender
    in_reply_to: Optional[str] = None  # original message_id -> follow-up threads under it


class SendReport(BaseModel):
    message_id: str          # Brevo's unique id for this individual email
    from_mail: str
    subject: str
    to_mail: str


def _append_report(sent_at: str, report: SendReport) -> None:
    """Append one send to the CSV report, writing the header on first use."""
    p = Path(REPORT_CSV)
    is_new = not p.exists()
    with p.open("a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if is_new:
            w.writerow(["sent_at", "message_id", "from_mail", "subject", "to_mail"])
        w.writerow([sent_at, report.message_id, report.from_mail,
                    report.subject, report.to_mail])


def _insert_report_hasura(sent_at: str, report: SendReport) -> None:
    """Insert one send's report row into the Hasura email_sends table.

    No-op when Hasura isn't configured. Raises on a GraphQL/transport error so
    the caller can decide what to do (the email has already been sent by now).
    """
    if not HASURA_URL:
        return
    table = HASURA_SENDS_TABLE
    mutation = (f"mutation InsertSend($obj: {table}_insert_input!) "
                f"{{ insert_{table}_one(object: $obj) {{ id }} }}")
    obj = {
        "sent_at": sent_at,
        "message_id": report.message_id,
        "from_mail": report.from_mail,
        "subject": report.subject,
        "to_mail": report.to_mail,
    }
    headers = {"Content-Type": "application/json"}
    if HASURA_SECRET:
        headers["x-hasura-admin-secret"] = HASURA_SECRET
    r = requests.post(HASURA_URL, json={"query": mutation, "variables": {"obj": obj}},
                      headers=headers, timeout=30)
    r.raise_for_status()
    payload = r.json()
    if payload.get("errors"):
        raise RuntimeError(f"Hasura insert failed: {payload['errors']}")


@app.post("/send", response_model=SendReport)
def send(req: SendRequest) -> SendReport:
    keys = load_keys()
    if not keys:
        raise HTTPException(500, "no Brevo API keys configured "
                                 "(brevo_keys.json / BREVO_API_KEYS / BREVO_API_KEY)")

    is_html = (req.content_type or "html").strip().lower() not in _TEXT_TYPES

    if req.from_mail:
        # FOLLOW-UP / top-up: must go out from the same address as the primary,
        # so use whichever account has that address as a verified sender.
        want = req.from_mail.strip().lower()
        chosen_key = None
        for k in keys:
            _, senders = _account_view(k["api_key"])
            if any((s.get("email") or "").lower() == want for s in senders):
                chosen_key = k["api_key"]
                break
        if not chosen_key:
            raise HTTPException(
                409, f"from_mail '{req.from_mail}' is not a verified sender "
                     f"on any configured Brevo account")
        sender_email = req.from_mail
    else:
        # PRIMARY: pick the account with the MOST remaining send credits that
        # also has at least one usable (verified) sender.
        best: Optional[Tuple[int, str, List[Dict]]] = None
        for k in keys:
            credits, senders = _account_view(k["api_key"])
            if credits is None or not senders:
                continue
            if best is None or credits > best[0]:
                best = (credits, k["api_key"], senders)
        if best is None:
            raise HTTPException(409, "no Brevo account has both credits and a "
                                     "verified sender available")
        _credits, chosen_key, senders = best
        # Prefer a verified sender whose local-part matches from_username,
        # otherwise fall back to the account's first verified sender.
        uname = (req.from_username or "").strip().lower()
        sender_email = next(
            (s["email"] for s in senders
             if (s.get("email") or "").split("@", 1)[0].lower() == uname),
            senders[0]["email"],
        )

    # For a follow-up, thread it under the original via standard email headers.
    headers = None
    if req.in_reply_to:
        headers = {"In-Reply-To": req.in_reply_to, "References": req.in_reply_to}

    client = BrevoClient(chosen_key)
    try:
        message_id = client.send_message(
            sender={"name": req.from_name, "email": sender_email},
            to_email=req.to_email,
            subject=req.subject,
            body=req.text_body,
            html=is_html,
            headers=headers,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(502, f"Brevo send failed: {e}")

    report = SendReport(message_id=message_id, from_mail=sender_email,
                        subject=req.subject, to_mail=req.to_email)
    sent_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    _append_report(sent_at, report)          # durable local backup
    try:
        _insert_report_hasura(sent_at, report)
    except Exception as e:  # noqa: BLE001 — email already sent; don't fail the request
        print(f"WARNING: Hasura insert failed (row kept in {REPORT_CSV}): {e}")
    return report
