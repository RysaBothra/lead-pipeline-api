"""Tiny Hasura GraphQL store: execute, insert_one, update_by_pk, fetch.

Used by the Hasura-backed pipeline to persist each stage's output. Auth via
x-hasura-admin-secret. Configure with env HASURA_GRAPHQL_URL + HASURA_ADMIN_SECRET
(or pass explicitly).
"""
from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

import requests


class HasuraStore:
    def __init__(self, url: Optional[str] = None, secret: Optional[str] = None,
                 timeout: int = 60):
        self.url = (url or os.getenv("HASURA_GRAPHQL_URL") or "").strip()
        self.secret = (secret or os.getenv("HASURA_ADMIN_SECRET") or "").strip()
        self.timeout = timeout
        if not self.url:
            raise RuntimeError("HASURA_GRAPHQL_URL not set")

    def _headers(self) -> Dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.secret:
            h["x-hasura-admin-secret"] = self.secret
        return h

    def execute(self, query: str,
                variables: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        r = requests.post(self.url, headers=self._headers(),
                          json={"query": query, "variables": variables or {}},
                          timeout=self.timeout)
        r.raise_for_status()
        payload = r.json()
        if payload.get("errors"):
            raise RuntimeError(f"Hasura error: {payload['errors']}")
        return payload.get("data") or {}

    def insert_one(self, table: str, obj: Dict[str, Any],
                   returning: str = "id") -> Dict[str, Any]:
        """insert_<table>_one(object: $obj) -> {returning...}. Returns the row."""
        mutation = (f"mutation Ins($obj: {table}_insert_input!) "
                    f"{{ insert_{table}_one(object: $obj) {{ {returning} }} }}")
        data = self.execute(mutation, {"obj": obj})
        return data.get(f"insert_{table}_one") or {}

    def update_by_pk(self, table: str, pk: Any, changes: Dict[str, Any],
                     pk_field: str = "id", returning: str = "id") -> Dict[str, Any]:
        """update_<table>_by_pk(pk_columns:{id}, _set:$set)."""
        mutation = (
            f"mutation Upd($id: uuid!, $set: {table}_set_input!) "
            f"{{ update_{table}_by_pk(pk_columns: {{{pk_field}: $id}}, _set: $set) "
            f"{{ {returning} }} }}")
        data = self.execute(mutation, {"id": pk, "set": changes})
        return data.get(f"update_{table}_by_pk") or {}

    def fetch(self, table: str, fields: str, where: Optional[str] = None,
              order_by: Optional[str] = None,
              limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Generic select. `where`/`order_by` are raw GraphQL arg snippets, e.g.
        where='{status: {_eq: "pending"}}', order_by='{created_at: asc}'.
        """
        args = []
        if where:
            args.append(f"where: {where}")
        if order_by:
            args.append(f"order_by: {order_by}")
        if limit is not None:
            args.append(f"limit: {limit}")
        arg_str = f"({', '.join(args)})" if args else ""
        query = f"query Sel {{ {table}{arg_str} {{ {fields} }} }}"
        return self.execute(query).get(table) or []
