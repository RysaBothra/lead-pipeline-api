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
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..http_client import HTTPClient
from ..models import DecisionMaker


class ProspeoClient:
    def __init__(self, api_key: str, rate_per_sec: float = 5.0):
        self.api_key = (api_key or "").strip()
        self.api = HTTPClient(
            "https://api.prospeo.io",
            {"X-KEY": self.api_key},
            rate_per_sec=rate_per_sec,
        )

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
