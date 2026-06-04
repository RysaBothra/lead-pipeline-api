"""Pipeline orchestrator wiring all stages together."""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import List

from .agent import Agent
from .clients.brevo import BrevoClient
from .clients.eazyreach import EazyReachClient
from .clients.kipplo import KipploClient
from .clients.ocean import OceanClient, SearchFilter
from .models import EmailDraft, SendResult
from .report import Report

log = logging.getLogger("pipeline")


@dataclass
class Params:
    company_filter: SearchFilter
    decision_titles: List[str] = field(default_factory=list)
    per_company_limit: int = 3


def _to_result(d: EmailDraft, msg_id: str, status: str, err: str) -> SendResult:
    user = d.from_email.split("@", 1)[0] if "@" in d.from_email else d.from_email
    return SendResult(
        from_domain=d.from_domain,
        from_username=user,
        from_name=d.from_name,
        to_email=d.to_email,
        to_name=d.to_name,
        cc_mail=d.cc,
        subject=d.subject,
        body=d.body,
        attachments=d.attachments,
        message_id=msg_id,
        status=status,
        error=err,
        sent_at=datetime.now(),
    )


class Pipeline:
    def __init__(self, ocean: OceanClient, kipplo: KipploClient,
                 eazyreach: EazyReachClient, agent: Agent,
                 approver, brevo: BrevoClient, report: Report):
        # approver may be None when using the web flow (prepare/send_one)
        self.ocean = ocean
        self.kipplo = kipplo
        self.eazyreach = eazyreach
        self.agent = agent
        self.approver = approver
        self.brevo = brevo
        self.report = report

    def run(self, params: Params) -> None:
        # 1. companies (domains) via Ocean.io
        companies = self.ocean.find_companies(params.company_filter)
        log.info("ocean: found %d companies", len(companies))

        for co in companies:
            # 2. decision makers via Kipplo
            try:
                dms = self.kipplo.find_decision_makers(
                    co.domain, params.decision_titles, params.per_company_limit)
            except Exception as e:  # noqa: BLE001
                log.warning("kipplo[%s]: %s", co.domain, e)
                continue
            log.info("kipplo[%s]: %d decision makers", co.domain, len(dms))

            for dm in dms:
                # 3. email via EazyReach
                try:
                    contact, ok = self.eazyreach.find_email(dm)
                except Exception as e:  # noqa: BLE001
                    log.warning("eazyreach[%s]: %s", dm.full_name, e)
                    continue
                if not ok or contact is None:
                    log.info("eazyreach[%s]: no email found", dm.full_name)
                    continue

                # 4. agent drafts the email
                try:
                    draft = self.agent.draft(contact)
                except Exception as e:  # noqa: BLE001
                    log.warning("agent[%s]: %s", contact.email, e)
                    continue

                # 4b. human approval gate
                approved, edited = self.approver.review(draft)
                if not approved:
                    self.report.add(_to_result(edited, "", "skipped", "not approved"))
                    continue

                # 5. send via Brevo
                try:
                    msg_id = self.brevo.send(edited)
                except Exception as e:  # noqa: BLE001
                    self.report.add(_to_result(edited, "", "failed", str(e)))
                    log.warning("brevo[%s]: %s", edited.to_email, e)
                    continue

                self.report.add(_to_result(edited, msg_id, "sent", ""))
                log.info("sent -> %s (msg %s)", edited.to_email, msg_id)

    def prepare(self, params: "Params", on_draft) -> None:
        """Phase 1 for the web flow: build drafts without sending.

        Calls on_draft(EmailDraft) for each draft produced. The caller
        (e.g. the API) decides how to store and later approve them.
        """
        companies = self.ocean.find_companies(params.company_filter)
        log.info("ocean: found %d companies", len(companies))

        for co in companies:
            try:
                dms = self.kipplo.find_decision_makers(
                    co.domain, params.decision_titles, params.per_company_limit)
            except Exception as e:  # noqa: BLE001
                log.warning("kipplo[%s]: %s", co.domain, e)
                continue
            log.info("kipplo[%s]: %d decision makers", co.domain, len(dms))

            for dm in dms:
                try:
                    contact, ok = self.eazyreach.find_email(dm)
                except Exception as e:  # noqa: BLE001
                    log.warning("eazyreach[%s]: %s", dm.full_name, e)
                    continue
                if not ok or contact is None:
                    log.info("eazyreach[%s]: no email found", dm.full_name)
                    continue

                try:
                    draft = self.agent.draft(contact)
                except Exception as e:  # noqa: BLE001
                    log.warning("agent[%s]: %s", contact.email, e)
                    continue

                on_draft(draft)

    def send_one(self, draft: EmailDraft) -> SendResult:
        """Phase 2 for the web flow: send a single approved draft and
        record + return its result."""
        try:
            msg_id = self.brevo.send(draft)
        except Exception as e:  # noqa: BLE001
            res = _to_result(draft, "", "failed", str(e))
            self.report.add(res)
            log.warning("brevo[%s]: %s", draft.to_email, e)
            return res
        res = _to_result(draft, msg_id, "sent", "")
        self.report.add(res)
        log.info("sent -> %s (msg %s)", draft.to_email, msg_id)
        return res
