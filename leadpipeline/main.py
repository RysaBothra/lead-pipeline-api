"""Entrypoint: wires config from environment and runs the pipeline.

Usage:
    python -m leadpipeline.main
"""
from __future__ import annotations

import logging
import os
import sys

from .agent import Agent, AutoApprover, CLIApprover, DraftConfig
from .clients.brevo import BrevoClient
from .clients.eazyreach import EazyReachClient
from .clients.kipplo import KipploClient
from .clients.ocean import OceanClient, SearchFilter
from .pipeline import Params, Pipeline
from .report import Report


def env(key: str) -> str:
    v = os.getenv(key)
    if not v:
        print(f"missing required env var: {key}", file=sys.stderr)
        sys.exit(1)
    return v


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    cfg = DraftConfig(
        from_email=env("FROM_EMAIL"),
        from_name=env("FROM_NAME"),
        campaign_brief=env("CAMPAIGN_BRIEF"),
        # cc=["team@yourdomain.com"],
        # attachments=[Attachment(name="deck.pdf", url="https://...")],
    )

    pipeline = Pipeline(
        ocean=OceanClient(env("OCEAN_API_KEY")),
        kipplo=KipploClient(env("KIPPLO_API_KEY")),
        eazyreach=EazyReachClient(env("EAZYREACH_API_KEY")),
        agent=Agent(env("ANTHROPIC_API_KEY"), cfg),
        approver=CLIApprover(),   # swap for AutoApprover() to skip prompts
        brevo=BrevoClient(env("BREVO_API_KEY")),
        report=Report(),
    )

    params = Params(
        company_filter=SearchFilter(
            industries=["Hospital & Health Care"],
            countries=["IN"],
            keywords=["dental"],
            limit=10,
        ),
        decision_titles=["Founder", "CEO", "Director", "Head of Procurement"],
        per_company_limit=3,
    )

    try:
        pipeline.run(params)
    except Exception as e:  # noqa: BLE001
        logging.error("pipeline error: %s", e)
        sys.exit(1)

    pipeline.report.write_csv("report.csv")
    pipeline.report.write_json("report.json")
    logging.info("DONE: %s -> report.csv, report.json", pipeline.report.summary())


if __name__ == "__main__":
    main()
