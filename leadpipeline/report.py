"""Report writer: CSV + JSON output of all sends."""
from __future__ import annotations

import csv
import json
from dataclasses import asdict
from typing import List

from .models import SendResult


class Report:
    def __init__(self) -> None:
        self.results: List[SendResult] = []

    def add(self, res: SendResult) -> None:
        self.results.append(res)

    def write_json(self, path: str) -> None:
        def serialize(r: SendResult) -> dict:
            d = asdict(r)
            d["sent_at"] = r.sent_at.isoformat() if r.sent_at else None
            return d

        with open(path, "w", encoding="utf-8") as f:
            json.dump([serialize(r) for r in self.results], f, indent=2)

    def write_csv(self, path: str) -> None:
        header = [
            "from_domain", "from_username", "from_name",
            "to_mail", "to_name", "cc_mail",
            "subject", "body", "attachments",
            "message_id", "status", "error", "sent_at",
        ]
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(header)
            for r in self.results:
                w.writerow([
                    r.from_domain,
                    r.from_username,
                    r.from_name,
                    r.to_email,
                    r.to_name,
                    "; ".join(r.cc_mail),
                    r.subject,
                    r.body,
                    "; ".join(a.name for a in r.attachments),
                    r.message_id,
                    r.status,
                    r.error,
                    r.sent_at.strftime("%Y-%m-%d %H:%M:%S") if r.sent_at else "",
                ])

    def summary(self) -> str:
        sent = sum(1 for r in self.results if r.status == "sent")
        failed = sum(1 for r in self.results if r.status == "failed")
        skipped = sum(1 for r in self.results if r.status == "skipped")
        return (f"sent={sent} failed={failed} skipped={skipped} "
                f"total={len(self.results)}")
