"""Prospeo client for decision-maker discovery by company domain.

Replaces Kipplo's role. Uses Prospeo's Search Person API (the old domain-search
endpoint was removed):
  POST https://api.prospeo.io/search-person
  Header: X-KEY: <api_key>
  Body:   {"page": 1, "filters": {
              "company": {"websites": {"include": ["<domain>"]}},
              "person_job_title": {"include": ["CEO", "Founder", ...]}  # optional
          }}
  Response:
    {"error": false, "results": [
        {"person": {first_name, last_name, full_name, job_title, seniority,
                     linkedin_url}, "company": {name, ...}}],
     "pagination": {current_page, per_page, total_page, total_count}}

Note: Search Person does NOT return email/phone — that's what the EazyReach
stage resolves from each linkedin_url. 1 Prospeo credit per search that returns
at least one person; 25 results per page.

This client also exposes find_email_by_linkedin(), used as a FALLBACK when
EazyReach returns no email. It hits Prospeo's Enrich Person endpoint:
  POST https://api.prospeo.io/enrich-person
  Header: X-KEY: <api_key>
  Body:   {"data": {"linkedin_url": "https://www.linkedin.com/in/<handle>"}}
  Response:
    {"error": false, "person": {"email": {"email": "...", "status": "VERIFIED",
                                           "revealed": true, ...}}}
1 credit per email found (0 if none / not revealed). If the account has no
credits the email comes back revealed:false and we treat it as "no email".
"""
from __future__ import annotations

import time
from typing import Any, Dict, List, Optional, Tuple

from ..http_client import HTTPClient
from ..models import DecisionMaker


def _ensure_scheme(url: str) -> str:
    """Enrich Person wants a full URL with a scheme."""
    u = (url or "").strip()
    if not u:
        return u
    if u.startswith("http://") or u.startswith("https://"):
        return u
    return "https://" + u.lstrip("/")


def _extract_email(resp: Dict[str, Any]) -> Tuple[str, bool]:
    """Pull (email, verified) from an Enrich Person response. The address only
    appears when person.email.revealed is true; status VERIFIED/VALID = verified.
    Parsed defensively in case the payload nests under response/result instead."""
    data = (resp.get("person") or resp.get("response")
            or resp.get("result") or resp)
    if not isinstance(data, dict):
        return "", False
    node = data.get("email")
    email, status = "", ""
    if isinstance(node, dict):
        email = node.get("email") or node.get("value") or ""
        status = (node.get("status") or node.get("email_status")
                  or node.get("verification") or "")
    elif isinstance(node, str):
        email = node
        status = data.get("email_status") or data.get("verification") or ""
    verified = str(status).strip().upper() in {"VERIFIED", "VALID"}
    return (email or ""), verified


# Error fragments that mean "this key is tapped out" — rotate to the next one.
_QUOTA_SIGNALS = ("INSUFFICIENT", "credit", "Credit", "QUOTA", "quota",
                  "PAYMENT", "Not enough", "NO_CREDIT", "402")


def account_credits(api_key: str) -> int:
    """Remaining Prospeo credits for a key via the free GET /account-information
    endpoint (consumes no credits). Returns -1 if it can't be determined."""
    if not api_key:
        return -1
    try:
        api = HTTPClient("https://api.prospeo.io", {}, rate_per_sec=3.0)
        resp = api.do_json("GET", "/account-information", None,
                           extra_headers={"X-KEY": api_key}) or {}
    except Exception:  # noqa: BLE001
        return -1
    data = resp.get("response") if isinstance(resp.get("response"), dict) else resp
    if not isinstance(data, dict):
        return -1
    for k in ("remaining_credits", "credits_remaining", "remaining", "credits"):
        v = data.get(k)
        if isinstance(v, (int, float)):
            return int(v)
    return -1


class ProspeoClient:
    def __init__(self, api_key, rate_per_sec: float = 1.0):
        """api_key may be a single key (str) or a pool of keys (list) to rotate
        through — round-robin per call, with failover when a key is rate-limited
        or out of credits. The X-KEY header is set per request, not globally."""
        if isinstance(api_key, (list, tuple)):
            keys = [str(k).strip() for k in api_key if k and str(k).strip()]
        else:
            keys = [api_key.strip()] if api_key and api_key.strip() else []
        # de-dup, preserve order
        seen = set()
        self.keys = [k for k in keys if not (k in seen or seen.add(k))]
        self.api_key = self.keys[0] if self.keys else ""   # back-compat attr
        self._idx = 0
        self.api = HTTPClient(
            "https://api.prospeo.io", {}, rate_per_sec=rate_per_sec)

    def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        """POST using the current key, advancing only when a key is depleted.

        The pool is pre-ordered most-credits-first (see _prospeo_keys), so this
        sticks to the richest key and fails over to the next only when the
        current one is out of credits. Rate limits are retried on the same key
        a couple times (transient), then it moves on."""
        if not self.keys:
            raise RuntimeError("no Prospeo API keys configured")
        n = len(self.keys)
        delay, rl_retries, attempts = 2.0, 0, 0
        last: Optional[Exception] = None
        while attempts < n + 6:
            attempts += 1
            key = self.keys[self._idx % n]
            try:
                return self.api.do_json("POST", path, body,
                                        extra_headers={"X-KEY": key}) or {}
            except RuntimeError as e:
                last, msg = e, str(e)
                if "Rate limit" in msg:
                    if rl_retries < 2:           # transient — retry same key
                        rl_retries += 1
                        time.sleep(delay)
                        delay = min(delay * 2, 20.0)
                        continue
                    rl_retries = 0               # persistent — move on
                    self._idx = (self._idx + 1) % n
                    continue
                if any(s in msg for s in _QUOTA_SIGNALS):
                    rl_retries = 0               # depleted — next richest key
                    self._idx = (self._idx + 1) % n
                    continue
                raise                            # real error (incl. NO_RESULTS)
        raise last or RuntimeError("Prospeo: all keys exhausted or rate-limited")

    def find_email_by_linkedin(self, linkedin_url: str) -> Tuple[str, bool]:
        """Resolve a work email from a LinkedIn profile URL via Enrich Person.
        Returns (email, verified); empty email means no match / not revealed.
        Used as a fallback after EazyReach."""
        url = _ensure_scheme(linkedin_url)
        if not url:
            return "", False
        try:
            resp = self._post("/enrich-person", {"data": {"linkedin_url": url}})
        except RuntimeError as e:
            # Prospeo signals "no match / no email" with a 400 error_code.
            if any(code in str(e) for code in
                   ("NO_RESULTS", "NO_EMAIL", "NOT_FOUND")):
                return "", False
            raise
        return _extract_email(resp)

    def find_decision_makers(self, domain: str,
                             titles: Optional[List[str]] = None,
                             limit: int = 5) -> List[DecisionMaker]:
        if limit <= 0:
            limit = 5

        filters: Dict[str, Any] = {
            "company": {"websites": {"include": [domain]}},
        }
        if titles:
            filters["person_job_title"] = {"include": titles[:25]}

        try:
            resp = self.api.do_json("POST", "/search-person",
                                    {"page": 1, "filters": filters}) or {}
        except RuntimeError as e:
            # Prospeo returns HTTP 400 NO_RESULTS when nobody matches — that's an
            # empty result, not a failure.
            if "NO_RESULTS" in str(e):
                return []
            raise

        out: List[DecisionMaker] = []
        for row in resp.get("results") or []:
            if not isinstance(row, dict):
                continue
            person = row.get("person") or {}
            first = (person.get("first_name") or "") or ""
            last = (person.get("last_name") or "") or ""
            full = (person.get("full_name")
                    or " ".join(x for x in (first, last) if x))

            # Current role lives in current_job_title; the matching company name
            # is on the "current" entry of job_history.
            jobs = person.get("job_history") or []
            current = next((j for j in jobs
                            if isinstance(j, dict) and j.get("current")),
                           jobs[0] if jobs else {})
            current = current if isinstance(current, dict) else {}
            title = (person.get("current_job_title") or person.get("job_title")
                     or person.get("title") or current.get("title") or "")
            company = row.get("company") or {}
            company_name = (company.get("name") or company.get("company_name")
                            or current.get("company_name") or domain)

            out.append(DecisionMaker(
                full_name=full,
                first_name=first,
                last_name=last,
                title=title,
                linkedin_url=(person.get("linkedin_url") or ""),
                domain=domain,
                company_name=company_name,
            ))
            if len(out) >= limit:
                break
        return out
