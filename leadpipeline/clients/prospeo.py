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


class ProspeoClient:
    def __init__(self, api_key: str, rate_per_sec: float = 1.0):
        self.api_key = (api_key or "").strip()
        self.api = HTTPClient(
            "https://api.prospeo.io",
            {"X-KEY": self.api_key},
            rate_per_sec=rate_per_sec,
        )

    def _post(self, path: str, body: Dict[str, Any],
              attempts: int = 5) -> Dict[str, Any]:
        """POST with backoff on Prospeo's rate limit, which it returns as an
        HTTP 400 body {"error":true,"error_code":"Rate limit exceeded"} — the
        HTTPClient's normal 429 retry doesn't catch that status."""
        delay = 2.0
        for i in range(attempts):
            try:
                return self.api.do_json("POST", path, body) or {}
            except RuntimeError as e:
                if "Rate limit" in str(e) and i < attempts - 1:
                    time.sleep(delay)
                    delay = min(delay * 2, 30.0)
                    continue
                raise
        return {}

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
