"""EazyReach client: resolve work emails from LinkedIn profile URLs.

Two-step auth per EazyReach B2B API docs:
  1) POST https://api.superflow.run/b2b/createAuthToken/
        body: {"clientId": "...", "clientSecret": "..."}
        -> {"status": "...", "auth_token": "...", "id": "..."}
  2) POST https://api.superflow.run/b2b/linkedin-emails
        header: Authorization: Bearer <auth_token>
        body:   {"linkedinUrl": "www.linkedin.com/in/<handle>"}
        -> {"status": "success", "emails": [ {email, verification, source} ]}

Each lookup debits the EazyReach prepaid wallet (402 = insufficient balance).
"""
from __future__ import annotations

from typing import Optional, Tuple

from ..http_client import HTTPClient
from ..models import DecisionMaker, EmailContact


def normalize_linkedin(url: str) -> str:
    """EazyReach expects a full-ish URL. Kipplo gives bare 'linkedin.com/in/x'."""
    u = (url or "").strip()
    if not u:
        return u
    u = u.replace("https://", "").replace("http://", "")
    if u.startswith("linkedin.com"):
        u = "www." + u
    return u


class EazyReachClient:
    def __init__(self, client_id: str, client_secret: str,
                 rate_per_sec: float = 3.0):
        self.client_id = (client_id or "").strip()
        self.client_secret = (client_secret or "").strip()
        self.rate_per_sec = rate_per_sec
        # Base client with no auth header yet; token added after auth.
        self.api = HTTPClient("https://api.superflow.run",
                              {}, rate_per_sec=rate_per_sec)
        self._token: Optional[str] = None

    def authenticate(self) -> str:
        """Exchange clientId+clientSecret for an auth_token. Cached."""
        if self._token:
            return self._token
        resp = self.api.do_json("POST", "/b2b/createAuthToken/", {
            "clientId": self.client_id,
            "clientSecret": self.client_secret,
        }) or {}
        token = resp.get("auth_token") or resp.get("authToken") or ""
        if not token:
            raise RuntimeError(f"EazyReach auth returned no token: {resp}")
        self._token = token
        self.api.session.headers["Authorization"] = f"Bearer {token}"
        return token

    def find_email(self, dm: DecisionMaker) -> Tuple[Optional[EmailContact], bool]:
        """Returns (contact, found). found=False if no email resolved."""
        self.authenticate()
        url = normalize_linkedin(dm.linkedin_url)
        resp = self.api.do_json("POST", "/b2b/linkedin-emails",
                                {"linkedinUrl": url}) or {}
        emails = resp.get("emails") or []
        if not emails:
            return None, False

        # EazyReach may return emails as dicts {email, verification} or plain strings.
        def to_pair(e):
            if isinstance(e, dict):
                return e.get("email", "") or "", e.get("verification", "") or ""
            return str(e), ""

        pairs = [to_pair(e) for e in emails]
        pairs = [(em, v) for (em, v) in pairs if em]
        if not pairs:
            return None, False
        pairs.sort(key=lambda pv: 0 if pv[1] == "verified" else 1)
        email, verif = pairs[0]
        verified = verif == "verified"

        return EmailContact(
            decision_maker=dm,
            email=email,
            verified=verified,
            confidence=1.0 if verified else 0.5,
        ), True

    # Convenience for the standalone test: look up a raw URL.
    def email_for_url(self, linkedin_url: str) -> dict:
        self.authenticate()
        url = normalize_linkedin(linkedin_url)
        return self.api.do_json("POST", "/b2b/linkedin-emails",
                                {"linkedinUrl": url}) or {}
