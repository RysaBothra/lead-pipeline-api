"""In-memory store for web-based approval jobs.

A Job holds a batch of prepared drafts. Each draft moves through:
    pending -> approved -> sent | failed
            -> rejected (skipped)

This is intentionally in-memory (single process). For production, back it
with Redis/Postgres so state survives restarts and scales across workers.
"""
from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

from .models import EmailDraft, SendResult


@dataclass
class DraftItem:
    draft: EmailDraft
    status: str = "pending"   # pending | approved | rejected | sent | failed
    result: Optional[SendResult] = None


@dataclass
class Job:
    id: str
    created_at: datetime
    status: str = "preparing"  # preparing | ready | sending | done
    items: Dict[str, DraftItem] = field(default_factory=dict)


class JobStore:
    def __init__(self) -> None:
        self._jobs: Dict[str, Job] = {}
        self._lock = threading.Lock()

    def create(self) -> Job:
        job = Job(id=uuid.uuid4().hex[:12], created_at=datetime.now())
        with self._lock:
            self._jobs[job.id] = job
        return job

    def get(self, job_id: str) -> Optional[Job]:
        with self._lock:
            return self._jobs.get(job_id)

    def add_draft(self, job_id: str, draft: EmailDraft) -> None:
        with self._lock:
            job = self._jobs[job_id]
            job.items[draft.id] = DraftItem(draft=draft)

    def set_job_status(self, job_id: str, status: str) -> None:
        with self._lock:
            self._jobs[job_id].status = status

    def update_draft(self, job_id: str, draft_id: str,
                     draft: Optional[EmailDraft] = None,
                     status: Optional[str] = None,
                     result: Optional[SendResult] = None) -> Optional[DraftItem]:
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return None
            item = job.items.get(draft_id)
            if not item:
                return None
            if draft is not None:
                item.draft = draft
            if status is not None:
                item.status = status
            if result is not None:
                item.result = result
            return item

    def list_jobs(self) -> List[Job]:
        with self._lock:
            return list(self._jobs.values())
