"""Shared data models for the lead pipeline."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional


@dataclass
class Company:
    """A target organization discovered via Ocean.io."""
    name: str
    domain: str
    industry: str = ""
    size: str = ""
    country: str = ""


@dataclass
class DecisionMaker:
    """A person at a company found via Kipplo (LinkedIn)."""
    full_name: str
    first_name: str
    last_name: str
    title: str
    linkedin_url: str
    domain: str          # company domain (link back to Company)
    company_name: str


@dataclass
class EmailContact:
    """A decision maker enriched with an email via EazyReach."""
    decision_maker: DecisionMaker
    email: str
    verified: bool = False
    confidence: float = 0.0


@dataclass
class Attachment:
    name: str
    url: str = ""           # hosted file
    content_b64: str = ""   # base64 inline content
    content_type: str = ""


@dataclass
class EmailDraft:
    """What the agent shows you before sending."""
    id: str
    from_domain: str
    from_email: str
    from_name: str
    to_email: str
    to_name: str
    subject: str
    body: str               # HTML or text
    cc: List[str] = field(default_factory=list)
    attachments: List[Attachment] = field(default_factory=list)
    approved: bool = False


@dataclass
class SendResult:
    """Outcome of a single send, for reporting."""
    from_domain: str
    from_username: str
    from_name: str
    to_email: str
    to_name: str
    subject: str
    body: str
    cc_mail: List[str] = field(default_factory=list)
    attachments: List[Attachment] = field(default_factory=list)
    message_id: str = ""
    status: str = ""        # sent | failed | skipped
    error: str = ""
    sent_at: Optional[datetime] = None
