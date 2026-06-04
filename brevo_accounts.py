r"""Rank every Brevo account in the Hasura brevo_keys table by usage.

For each active key: calls GET /v3/account to read remaining send credits and
the verified senders. Sorts by credits remaining so the LEAST-used account
(most credits) is first — that's the one the mailer / pipeline auto-picks.

Env: HASURA_GRAPHQL_URL, HASURA_ADMIN_SECRET  (load via .\setenv.ps1)

Usage:  python brevo_accounts.py
"""
from __future__ import annotations

import os

import requests

from leadpipeline.hasura_store import HasuraStore

FREE_DAILY_CAP = 300  # Brevo free-plan transactional cap/day (for "used today")


def account_info(api_key: str) -> dict:
    h = {"api-key": api_key.strip(), "Accept": "application/json"}
    r = requests.get("https://api.brevo.com/v3/account", headers=h, timeout=30)
    a = r.json() if r.text else {}
    if r.status_code >= 300:
        # Brevo rejected the key — surface its message (e.g. unauthorized).
        msg = a.get("message") or a.get("code") or r.text[:120]
        return {"email": "", "plan": "?", "remaining": 0, "senders": [],
                "error": f"HTTP {r.status_code}: {msg}"}
    plan = next((p for p in (a.get("plan") or [])
                 if p.get("creditsType") == "sendLimit"), {})
    s = requests.get("https://api.brevo.com/v3/senders", headers=h, timeout=30).json()
    senders = [x.get("email") for x in (s.get("senders") or []) if x.get("active")]
    return {
        "email": a.get("email", ""),
        "plan": plan.get("type", "?"),
        "remaining": int(plan.get("credits") or 0),
        "senders": senders,
        "error": "",
    }


def main() -> None:
    store = HasuraStore()
    rows = store.fetch("brevo_keys", "label api_key",
                       where='{is_active: {_eq: true}}')
    if not rows:
        print("No active keys in brevo_keys.")
        return

    accounts = []
    for r in rows:
        key = (r.get("api_key") or "").strip()
        if not key:
            continue
        try:
            info = account_info(key)
        except Exception as e:  # noqa: BLE001
            print(f"  {r.get('label')}: ERROR reading account ({e})")
            continue
        info["label"] = r.get("label") or key[:10]
        info["used_today"] = (max(0, FREE_DAILY_CAP - info["remaining"])
                              if info["plan"] == "free" else None)
        accounts.append(info)

    # Usable accounts (key valid + has a verified sender) rank first, by credits.
    def sort_key(a):
        usable = not a.get("error") and bool(a["senders"])
        return (0 if usable else 1, -a["remaining"])
    accounts.sort(key=sort_key)

    print(f"\n{'rank':4} {'label':14} {'account':26} {'plan':6} "
          f"{'remaining':9} {'used today':11} note")
    print("-" * 92)
    usable = [a for a in accounts if not a.get("error") and a["senders"]]
    for i, a in enumerate(accounts, 1):
        used = a["used_today"] if a["used_today"] is not None else "n/a"
        if a.get("error"):
            note = f"INVALID KEY - {a['error']}"
        elif not a["senders"]:
            note = "no verified sender (skipped)"
        elif usable and a is usable[0]:
            note = "<- least used (auto-picked)"
        else:
            note = ""
        print(f"{i:<4} {a['label']:14} {a['email']:26} {a['plan']:6} "
              f"{a['remaining']:<9} {str(used):11} {note}")

    if usable:
        top = usable[0]
        print(f"\nPipeline/mailer will send from: {top['label']} "
              f"({top['email']}) — {top['remaining']} emails left.")
        print(f"  verified senders: {', '.join(top['senders'])}")
    else:
        print("\nNo usable account (valid key + verified sender). Fix the "
              "invalid key(s) above or verify a sender before sending.")


if __name__ == "__main__":
    main()
