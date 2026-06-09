"""Ocean.io client for company/domain discovery.

Matches the WORKING query structure confirmed against the live API:
  POST https://api.ocean.io/v3/search/companies
  Header: x-api-token: <token>   (token in header only, NOT in query string)
  Body:   {"size": N, "companiesFilters": {...}, "fields": [...]}

Response wraps each result as {"company": {...}, "relevance": "A"}, so the
company object is nested under the "company" key.

Lookalike search is the reliable targeting method: give 1-10 seed domains of
companies like the ones you want via `lookalike_domains`.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from ..http_client import HTTPClient
from ..models import Company

# Error fragments that mean "rotate to the next Ocean key" (rate limit / quota).
_OCEAN_ROTATE = ("429", "402", "403", "rate", "Rate", "limit", "Limit",
                 "quota", "Quota", "credit", "Credit", "exhaust")

# Fields requested from Ocean for each company.
_FIELDS = [
    "name",
    "domain",
    "primaryCountry",
    "companySize",
    "industries",
    "employeeCountLinkedin",
    "revenue",
    "description",
]


@dataclass
class SearchFilter:
    lookalike_domains: List[str] = field(default_factory=list)  # seed domains
    countries: List[str] = field(default_factory=list)
    company_sizes: List[str] = field(default_factory=list)
    include_domains: List[str] = field(default_factory=list)
    exclude_domains: List[str] = field(default_factory=list)
    limit: int = 0
    # escape hatch: merged into companiesFilters verbatim
    extra: Dict[str, Any] = field(default_factory=dict)


class OceanClient:
    def __init__(self, api_key, rate_per_sec: float = 5.0):
        """api_key may be a single key (str) or a pool (list) to rotate through:
        round-robin per call, failing over to the next key on rate-limit/quota.
        The x-api-token header is set per request, not globally."""
        if isinstance(api_key, (list, tuple)):
            keys = [str(k).strip() for k in api_key if k and str(k).strip()]
        else:
            keys = [api_key.strip()] if api_key and api_key.strip() else []
        seen = set()
        self.keys = [k for k in keys if not (k in seen or seen.add(k))]
        self.api_key = self.keys[0] if self.keys else ""   # back-compat attr
        self._idx = 0
        self.api = HTTPClient(
            "https://api.ocean.io/v3", {}, rate_per_sec=rate_per_sec)

    def _post(self, path: str, body: Dict[str, Any]) -> Dict[str, Any]:
        if not self.keys:
            raise RuntimeError("no Ocean API keys configured")
        n = len(self.keys)
        delay = 2.0
        last: Optional[Exception] = None
        for _ in range(n + 4):
            key = self.keys[self._idx % n]
            self._idx = (self._idx + 1) % n
            try:
                return self.api.do_json("POST", path, body,
                                        extra_headers={"x-api-token": key}) or {}
            except RuntimeError as e:
                last, msg = e, str(e)
                if any(s in msg for s in _OCEAN_ROTATE):
                    if "429" in msg or "ate limit" in msg:
                        time.sleep(delay)
                        delay = min(delay * 2, 20.0)
                    continue        # rotate to next key
                raise               # real error — bubble up
        raise last or RuntimeError("Ocean: all keys exhausted or rate-limited")

    def find_companies(self, f: SearchFilter) -> List[Company]:
        size = f.limit if 0 < f.limit <= 10000 else 10

        filters: Dict[str, Any] = {}
        if f.lookalike_domains:
            filters["lookalikeDomains"] = f.lookalike_domains
        if f.countries:
            filters["countries"] = f.countries
        if f.company_sizes:
            filters["companySizes"] = f.company_sizes
        if f.include_domains:
            filters["includeDomains"] = f.include_domains
        if f.exclude_domains:
            filters["excludeDomains"] = f.exclude_domains
        if f.extra:
            filters.update(f.extra)

        body = {
            "size": size,
            "companiesFilters": filters,
            "fields": _FIELDS,
        }

        resp = self._post("/search/companies", body)

        rows = resp.get("companies") or resp.get("results") or resp.get("data") or []
        out: List[Company] = []
        for row in rows:
            # API returns items as {"company": {...}, "relevance": "A"}
            company = row.get("company") if isinstance(row, dict) else None
            if not isinstance(company, dict):
                company = row if isinstance(row, dict) else {}
            domain = company.get("domain", "")
            if not domain:
                continue
            out.append(Company(
                name=company.get("name", ""),
                domain=domain,
                industry=_first(company.get("industries")),
                size=str(company.get("companySize")
                         or company.get("employeeCountLinkedin") or ""),
                country=company.get("primaryCountry", ""),
            ))
        return out


def _first(v):
    if isinstance(v, list) and v:
        return v[0]
    return v if isinstance(v, str) else ""
