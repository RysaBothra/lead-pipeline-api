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

from dataclasses import dataclass, field
from typing import Any, Dict, List

from ..http_client import HTTPClient
from ..models import Company

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
    def __init__(self, api_key: str, rate_per_sec: float = 5.0):
        self.api_key = (api_key or "").strip()
        self.api = HTTPClient(
            "https://api.ocean.io/v3",
            {"x-api-token": self.api_key},
            rate_per_sec=rate_per_sec,
        )

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

        resp = self.api.do_json("POST", "/search/companies", body) or {}

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
