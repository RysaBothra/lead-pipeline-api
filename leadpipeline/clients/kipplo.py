"""Kipplo client for decision-maker discovery by company domain.

Kipplo exposes capability as configurable "integrations", each with its own
UUID and execute URL:
  POST https://api.kipplo.com/api/v1/customer/integrations/<INTEGRATION_ID>/execute
  Header: X-API-Key: <key>
  Body:   {"params": {"filters": [{field, operator, value}], "page", "page_size"}}

Response is Elasticsearch-style:
  {"success": true, "result": {"hits": {"total": {"value": N},
                                         "hits": [ {"_source": {...}} ]}}}

IMPORTANT: there are (at least) two relevant integrations:
  - "People Data Availability" (280d9c75-...): only reports WHICH fields exist
    per person (has_linkedinurl, has_businessemails, last_name_obfuscated...).
    It does NOT return real linkedin_url / email values. Use it as a coverage
    pre-check only.
  - "Search & Reveal" / "Enrich" (a DIFFERENT UUID from your Kipplo dashboard):
    returns the actual values. Pass that integration_id to get usable people.

Limits: max 5 filters per request; max page_size 1000; max offset 10,000.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..http_client import HTTPClient
from ..models import DecisionMaker

# The availability integration (coverage check only — no real values).
AVAILABILITY_INTEGRATION_ID = "280d9c75-319e-4757-b13c-d8e7cc834fde"


class KipploClient:
    def __init__(self, api_key: str,
                 integration_id: str = AVAILABILITY_INTEGRATION_ID,
                 rate_per_sec: float = 5.0):
        self.api_key = (api_key or "").strip()
        self.integration_id = integration_id
        self.path = f"/api/v1/customer/integrations/{integration_id}/execute"
        self.api = HTTPClient(
            "https://api.kipplo.com",
            {"X-API-Key": self.api_key},
            rate_per_sec=rate_per_sec,
        )

    def _hits(self, resp: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Pull the list of person _source dicts out of the ES-style envelope.
        Handles both the ES shape and a flatter {"data":{"results":[...]}} shape.
        """
        if not isinstance(resp, dict):
            return []
        # ES style: result.hits.hits[]._source
        result = resp.get("result") or {}
        hits = (result.get("hits") or {}).get("hits")
        if isinstance(hits, list):
            out = []
            for h in hits:
                src = h.get("_source") if isinstance(h, dict) else None
                out.append(src if isinstance(src, dict) else h)
            return out
        # flat style fallback
        data = resp.get("data") or {}
        rows = data.get("results")
        return rows if isinstance(rows, list) else []

    def total(self, domain: str) -> int:
        """Coverage check: how many people Kipplo has at this domain."""
        body = {"params": {"filters": [
            {"field": "company_domain", "operator": "Equals", "value": domain},
        ], "page": 1, "page_size": 1}}
        resp = self.api.do_json("POST", self.path, body) or {}
        result = resp.get("result") or {}
        total = ((result.get("hits") or {}).get("total") or {})
        if isinstance(total, dict):
            return int(total.get("value", 0))
        data = resp.get("data") or {}
        return int(data.get("total", 0))

    def find_decision_makers(self, domain: str,
                             titles: Optional[List[str]] = None,
                             limit: int = 5) -> List[DecisionMaker]:
        if limit <= 0:
            limit = 5

        filters: List[Dict[str, Any]] = [
            {"field": "company_domain", "operator": "Equals", "value": domain},
        ]
        if titles:
            vals = titles[:5]
            if len(vals) == 1:
                filters.append({"field": "job_title", "operator": "Contains",
                                "value": vals[0]})
            else:
                filters.append({"field": "job_title", "operator": "In List",
                                "value": vals})

        body = {"params": {"filters": filters[:5], "page": 1,
                           "page_size": min(limit, 1000)}}
        resp = self.api.do_json("POST", self.path, body) or {}

        out: List[DecisionMaker] = []
        for p in self._hits(resp):
            if not isinstance(p, dict):
                continue
            # Handle multiple possible field namings across integrations.
            full = (p.get("full_name") or p.get("fullname")
                    or _join_name(p.get("first_name"),
                                  p.get("last_name") or p.get("last_name_obfuscated"))
                    or "")
            first = p.get("first_name", "") or ""
            last = p.get("last_name") or p.get("last_name_obfuscated") or ""
            if not first and full:
                parts = full.split()
                first = parts[0] if parts else ""
                last = parts[-1] if len(parts) > 1 else last
            out.append(DecisionMaker(
                full_name=full,
                first_name=first,
                last_name=last,
                title=(p.get("job_title") or p.get("jobtitle") or p.get("title") or ""),
                linkedin_url=(p.get("linkedin_url") or p.get("linkedinurl") or ""),
                domain=domain,
                company_name=(p.get("company_name") or p.get("companyname") or ""),
            ))
            if len(out) >= limit:
                break
        return out


def _join_name(first: Optional[str], last: Optional[str]) -> str:
    return " ".join(x for x in (first, last) if x)
