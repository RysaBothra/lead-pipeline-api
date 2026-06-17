"""Website analyzer for the onboarding flow.

Fetches a prospect's own website, extracts readable text, and asks an LLM (via
OpenRouter) to surface the things the InboundIQ-style wizard needs:

  - services         what the business does / its core offers
  - differentiators  why it's different (proof-y, specific)
  - personas         ideal-customer profiles (industry, size, target roles)
  - geographies       suggested target markets
  - ideal_companies   example accounts / lookalike hints
  - offers            outbound CTAs with a rough impact score
  - voice_profile     tone + one-line positioning summary

OpenRouter is OpenAI-compatible. Configure with:
  OPENROUTER_API_KEY   (required to use the LLM)
  OPENROUTER_MODEL     (optional; default anthropic/claude-3.5-sonnet)

If no key is set, analyze() raises AnalyzerError so the caller can mark the
session as errored and let the user fill the sections in by hand.
"""
from __future__ import annotations

import json
import os
import re
from html.parser import HTMLParser
from typing import Any, Dict, List
from urllib.parse import urlparse

import requests

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MODEL = "anthropic/claude-3.5-haiku"
# Cap the page text we send to the model — enough for context, cheap on tokens.
_MAX_TEXT_CHARS = 12000


class AnalyzerError(RuntimeError):
    """Raised when the site can't be fetched or the LLM call fails."""


# --------------------------------------------------------------------------
# Fetch + extract readable text
# --------------------------------------------------------------------------
class _TextExtractor(HTMLParser):
    """Pull visible text + the title, skipping script/style/noscript."""

    _SKIP = {"script", "style", "noscript", "svg", "template"}

    def __init__(self) -> None:
        super().__init__()
        self.parts: List[str] = []
        self.title = ""
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in self._SKIP:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            d = dict(attrs)
            if d.get("name") in ("description", "keywords") and d.get("content"):
                self.parts.append(d["content"])
            if d.get("property") == "og:description" and d.get("content"):
                self.parts.append(d["content"])

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip_depth:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title:
            self.title = (self.title + " " + text).strip()
        else:
            self.parts.append(text)


def _normalize_url(website: str) -> str:
    website = (website or "").strip()
    if not website:
        raise AnalyzerError("no website provided")
    if not re.match(r"^https?://", website, re.I):
        website = "https://" + website
    return website


def fetch_site_text(website: str, timeout: int = 20) -> Dict[str, str]:
    """Return {url, domain, title, text} for a website (best effort)."""
    url = _normalize_url(website)
    try:
        resp = requests.get(
            url, timeout=timeout, allow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (compatible; LeadsIQ/1.0)"},
        )
        resp.raise_for_status()
    except requests.RequestException as e:
        raise AnalyzerError(f"could not fetch {url}: {e}") from e

    parser = _TextExtractor()
    try:
        parser.feed(resp.text)
    except Exception:  # noqa: BLE001 - malformed HTML shouldn't kill the run
        pass
    text = re.sub(r"\s+", " ", " ".join(parser.parts)).strip()[:_MAX_TEXT_CHARS]
    domain = urlparse(url).netloc.lower().lstrip("www.")
    return {"url": url, "domain": domain, "title": parser.title, "text": text}


# --------------------------------------------------------------------------
# LLM call (OpenRouter, OpenAI-compatible)
# --------------------------------------------------------------------------
_SYSTEM_PROMPT = (
    "You are a B2B go-to-market analyst. Given the text of a company's website, "
    "extract a structured outbound-sales profile. Be specific and concrete; "
    "prefer claims you can ground in the page text. Return ONLY valid JSON "
    "matching the requested schema, with no commentary."
)

_SCHEMA_HINT = """Return JSON with exactly these keys:
{
  "services": [ "5 short sentences describing core offers / what they do" ],
  "differentiators": [ "5 short sentences on why they're different, specific and provable" ],
  "personas": [
    { "name": "ICP label", "industries": ["..."], "company_size": "e.g. 10-200 employees", "roles": ["target job titles"] }
  ],
  "geographies": { "countries": ["ISO names or codes"], "regions": [], "global": false },
  "ideal_companies": { "names": ["example/lookalike companies"], "linkedin_urls": [], "domains": [] },
  "offers": [
    { "text": "a clear outbound CTA question", "impact": 5 }
  ],
  "voice_profile": { "tone": "one or two words", "summary": "one-line positioning statement" }
}
Provide 3-5 personas, 5 services, 5 differentiators, and 5 offers. impact is an
integer 1-10 estimating reply likelihood."""


def _openrouter_chat(messages: List[Dict[str, str]], model: str,
                     api_key: str, timeout: int = 90) -> str:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        # Optional attribution headers OpenRouter recommends.
        "HTTP-Referer": os.getenv("OPENROUTER_SITE_URL", "https://leadsiq.app"),
        "X-Title": "LeadsIQ",
    }
    body = {
        "model": model,
        "messages": messages,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
    }
    try:
        r = requests.post(OPENROUTER_URL, headers=headers, json=body,
                          timeout=timeout)
        r.raise_for_status()
    except requests.RequestException as e:
        raise AnalyzerError(f"OpenRouter request failed: {e}") from e
    data = r.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise AnalyzerError(f"unexpected OpenRouter response: {data}") from e


def _coerce_json(raw: str) -> Dict[str, Any]:
    """Parse the model's JSON, tolerating ```json fences / stray prose."""
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?", "", raw).rstrip("`").strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", raw, re.S)
        if m:
            return json.loads(m.group(0))
        raise AnalyzerError("model did not return valid JSON")


def _shape(parsed: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize/guard the LLM output into the exact stored shape."""
    def _str_list(v: Any) -> List[str]:
        if isinstance(v, list):
            return [str(x).strip() for x in v if str(x).strip()]
        return []

    geo = parsed.get("geographies") or {}
    ic = parsed.get("ideal_companies") or {}
    offers = []
    for o in parsed.get("offers") or []:
        if isinstance(o, dict) and o.get("text"):
            try:
                impact = int(o.get("impact", 5))
            except (TypeError, ValueError):
                impact = 5
            offers.append({"text": str(o["text"]).strip(),
                           "impact": max(1, min(10, impact)),
                           "selected": False})
    personas = []
    for p in parsed.get("personas") or []:
        if not isinstance(p, dict):
            continue
        personas.append({
            "name": str(p.get("name", "")).strip(),
            "industries": _str_list(p.get("industries")),
            "company_size": str(p.get("company_size", "")).strip(),
            "roles": _str_list(p.get("roles")),
        })
    voice = parsed.get("voice_profile") or {}
    return {
        "services": _str_list(parsed.get("services")),
        "differentiators": _str_list(parsed.get("differentiators")),
        "personas": personas,
        "geographies": {
            "countries": _str_list(geo.get("countries")),
            "regions": _str_list(geo.get("regions")),
            "global": bool(geo.get("global", False)),
        },
        "ideal_companies": {
            "names": _str_list(ic.get("names")),
            "linkedin_urls": _str_list(ic.get("linkedin_urls")),
            "domains": _str_list(ic.get("domains")),
        },
        "offers": offers,
        "voice_profile": {
            "tone": str(voice.get("tone", "")).strip(),
            "summary": str(voice.get("summary", "")).strip(),
        },
    }


def analyze(website: str) -> Dict[str, Any]:
    """Fetch + LLM-analyze a website. Returns the shaped profile plus 'raw'
    (the original model JSON) and 'site' (fetch metadata). Raises AnalyzerError."""
    api_key = (os.getenv("OPENROUTER_API_KEY") or "").strip()
    if not api_key:
        raise AnalyzerError("OPENROUTER_API_KEY not set")
    model = (os.getenv("OPENROUTER_MODEL") or DEFAULT_MODEL).strip()

    site = fetch_site_text(website)
    if not site["text"]:
        raise AnalyzerError("no readable text found on the page")

    user_msg = (
        f"Company website: {site['url']}\n"
        f"Page title: {site['title']}\n\n"
        f"Website text:\n{site['text']}\n\n{_SCHEMA_HINT}"
    )
    content = _openrouter_chat(
        [{"role": "system", "content": _SYSTEM_PROMPT},
         {"role": "user", "content": user_msg}],
        model=model, api_key=api_key)
    parsed = _coerce_json(content)
    shaped = _shape(parsed)
    shaped["raw"] = parsed
    shaped["site"] = site
    return shaped
