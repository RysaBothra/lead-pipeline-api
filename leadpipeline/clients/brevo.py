"""Brevo (Sendinblue) transactional email client.

Endpoints used:
  GET  /v3/senders        -> list account senders (active = verified/usable)
  POST /v3/smtp/email     -> send a transactional email
Auth: api-key header.

Sender retrieval (Option B): the pipeline can fetch your verified senders from
Brevo, pick/rotate among them, and the report records exactly which one sent.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from ..http_client import HTTPClient
from ..models import EmailDraft


class BrevoClient:
    def __init__(self, api_key: str, rate_per_sec: float = 8.0):
        self.api_key = (api_key or "").strip()
        self.api = HTTPClient(
            "https://api.brevo.com/v3",
            {"api-key": self.api_key},
            rate_per_sec=rate_per_sec,
        )

    def list_senders(self, only_active: bool = True) -> List[Dict]:
        """Return account senders. Each: {id, name, email, active}.
        active=True means verified and usable for sending.
        """
        resp = self.api.do_json("GET", "/senders") or {}
        senders = resp.get("senders") or []
        out = []
        for s in senders:
            if not isinstance(s, dict):
                continue
            if only_active and not s.get("active", False):
                continue
            out.append({
                "id": s.get("id"),
                "name": s.get("name", ""),
                "email": s.get("email", ""),
                "active": bool(s.get("active", False)),
            })
        return out

    def pick_sender(self, prefer_email: Optional[str] = None) -> Optional[Dict]:
        """Pick a verified sender. If prefer_email is given and active, use it;
        otherwise return the first active sender (or None if none)."""
        senders = self.list_senders(only_active=True)
        if not senders:
            return None
        if prefer_email:
            pe = prefer_email.strip().lower()
            for s in senders:
                if s["email"].lower() == pe:
                    return s
        return senders[0]

    def account(self) -> Dict:
        """Raw GET /account for this key (login email, plan, credits, ...)."""
        return self.api.do_json("GET", "/account") or {}

    def send_credits(self) -> int:
        """Remaining transactional send credits (Brevo's 'sendLimit' plan)."""
        for p in self.account().get("plan") or []:
            if p.get("creditsType") == "sendLimit":
                try:
                    return int(p.get("credits") or 0)
                except (TypeError, ValueError):
                    return 0
        return 0

    def send_message(self, sender: Dict, to_email: str, subject: str,
                     body: str, html: bool = True, to_name: str = "",
                     cc: Optional[List[str]] = None,
                     headers: Optional[Dict[str, str]] = None,
                     params: Optional[Dict[str, object]] = None,
                     sandbox: bool = False) -> str:
        """Send a ready-made email and return the Brevo messageId.

        sender: {"name", "email"} (e.g. from pick_sender()).
        html=True puts `body` in htmlContent; html=False uses textContent.
        headers: extra email headers in the message itself (e.g. In-Reply-To /
        References) so a follow-up threads under the original.
        params: values for {{params.X}} personalization tags in subject/body
        (e.g. {"FIRSTNAME": "Asha", "COMPANY": "Acme"}).
        sandbox=True adds X-Sib-Sandbox:drop so Brevo validates the request
        but delivers nothing — use it to dry-run the whole chain.
        """
        recipient: Dict = {"email": to_email}
        if to_name:
            recipient["name"] = to_name
        payload: Dict = {
            "sender": {"name": sender.get("name", ""), "email": sender["email"]},
            "to": [recipient],
            "subject": subject,
            "htmlContent" if html else "textContent": body,
        }
        if cc:
            payload["cc"] = [{"email": c} for c in cc]
        if headers:
            payload["headers"] = headers
        if params:
            payload["params"] = params
        req_headers = {"X-Sib-Sandbox": "drop"} if sandbox else None
        resp = self.api.do_json("POST", "/smtp/email", payload,
                                extra_headers=req_headers) or {}
        return resp.get("messageId", "")

    def send_html(self, sender: Dict, to_email: str, subject: str,
                  html: str, to_name: str = "",
                  cc: Optional[List[str]] = None,
                  sandbox: bool = False) -> str:
        """Convenience wrapper: send_message with HTML content."""
        return self.send_message(sender, to_email, subject, html, html=True,
                                 to_name=to_name, cc=cc, sandbox=sandbox)

    def ensure_contact_attribute(self, name: str,
                                 attr_type: str = "text") -> None:
        """Create a normal contact attribute if missing (best-effort).

        Needed so {{contact.COMPANY}} etc. resolve — Brevo rejects upserts that
        set an attribute the account doesn't define. Ignores 'already exists'.
        """
        try:
            self.api.do_json("POST", f"/contacts/attributes/normal/{name}",
                             {"type": attr_type})
        except Exception:  # noqa: BLE001 — already exists / not permitted
            pass

    def upsert_contact(self, email: str,
                       attributes: Optional[Dict[str, object]] = None) -> None:
        """Create or update a Brevo contact so {{contact.*}} tags populate.

        updateEnabled=True updates the contact if it already exists.
        """
        payload: Dict = {"email": email, "updateEnabled": True}
        if attributes:
            payload["attributes"] = attributes
        self.api.do_json("POST", "/contacts", payload)

    def send(self, d: EmailDraft) -> str:
        """Send an approved draft, return the Brevo messageId."""
        payload: Dict = {
            "sender": {"name": d.from_name, "email": d.from_email},
            "to": [{"name": d.to_name, "email": d.to_email}],
            "subject": d.subject,
            "htmlContent": d.body,
        }
        if d.cc:
            payload["cc"] = [{"email": c} for c in d.cc]
        if d.attachments:
            payload["attachment"] = [
                {k: v for k, v in {
                    "name": a.name,
                    "url": a.url or None,
                    "content": a.content_b64 or None,
                }.items() if v is not None}
                for a in d.attachments
            ]
        resp = self.api.do_json("POST", "/smtp/email", payload) or {}
        return resp.get("messageId", "")
