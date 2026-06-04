"""Agent layer: generates drafts via the Anthropic API and gates on approval."""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import List, Tuple

from .http_client import HTTPClient
from .models import Attachment, EmailContact, EmailDraft


@dataclass
class DraftConfig:
    from_email: str            # e.g. roshan@yourdomain.com
    from_name: str             # e.g. Roshan
    campaign_brief: str        # what you're pitching / why
    cc: List[str] = field(default_factory=list)
    attachments: List[Attachment] = field(default_factory=list)


SYSTEM_PROMPT = (
    "You write concise, personalized B2B cold outreach emails.\n"
    'Return ONLY a JSON object with keys "subject" and "body" (body is HTML).\n'
    "No preamble, no markdown fences. Keep it short, specific, and human."
)


def _sender_domain(email: str) -> str:
    return email.rsplit("@", 1)[1] if "@" in email else ""


def _strip_fences(s: str) -> str:
    s = s.strip()
    for pre in ("```json", "```"):
        if s.startswith(pre):
            s = s[len(pre):]
    if s.endswith("```"):
        s = s[:-3]
    return s.strip()


class Agent:
    """Uses the Anthropic API to write personalized drafts."""

    def __init__(self, anthropic_key: str, config: DraftConfig,
                 model: str = "claude-opus-4-20250514"):
        self.api = HTTPClient(
            "https://api.anthropic.com/v1",
            {"x-api-key": anthropic_key, "anthropic-version": "2023-06-01"},
            rate_per_sec=2.0,
        )
        self.model = model
        self.config = config

    def draft(self, c: EmailContact) -> EmailDraft:
        dm = c.decision_maker
        prompt = (
            f"Campaign brief:\n{self.config.campaign_brief}\n\n"
            f"Recipient:\n"
            f"- Name: {dm.full_name}\n"
            f"- Title: {dm.title}\n"
            f"- Company: {dm.company_name} ({dm.domain})\n"
            f"- LinkedIn: {dm.linkedin_url}\n\n"
            f"Write a personalized outreach email from {self.config.from_name}."
        )

        resp = self.api.do_json("POST", "/messages", {
            "model": self.model,
            "max_tokens": 1024,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": prompt}],
        }) or {}

        raw = "".join(
            blk.get("text", "")
            for blk in resp.get("content", [])
            if blk.get("type") == "text"
        )
        parsed = json.loads(_strip_fences(raw))

        return EmailDraft(
            id=c.email,
            from_domain=_sender_domain(self.config.from_email),
            from_email=self.config.from_email,
            from_name=self.config.from_name,
            to_email=c.email,
            to_name=dm.full_name,
            cc=list(self.config.cc),
            subject=parsed["subject"],
            body=parsed["body"],
            attachments=list(self.config.attachments),
        )


class CLIApprover:
    """Shows each draft in the terminal and asks for y/N/s approval."""

    def review(self, d: EmailDraft) -> Tuple[bool, EmailDraft]:
        print("\n========================= DRAFT =========================")
        print(f"From:    {d.from_name} <{d.from_email}>  (domain: {d.from_domain})")
        print(f"To:      {d.to_name} <{d.to_email}>")
        if d.cc:
            print(f"CC:      {', '.join(d.cc)}")
        print(f"Subject: {d.subject}")
        if d.attachments:
            print(f"Attach:  {', '.join(a.name for a in d.attachments)}")
        print("---------------------------------------------------------")
        print(d.body)
        print("=========================================================")
        ans = input("Send this email? [y/N/s=skip] ").strip().lower()
        return (ans in ("y", "yes")), d


class AutoApprover:
    """Sends everything without prompting (use with care)."""

    def review(self, d: EmailDraft) -> Tuple[bool, EmailDraft]:
        return True, d
