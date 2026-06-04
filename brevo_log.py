r"""Check what Brevo actually sent — straight from the terminal.

A reliable source of truth that doesn't depend on which account your browser is
logged into, or where the Brevo dashboard hides transactional logs.

Env:
  BREVO_API_KEY    your Brevo API key  (or load it via .\setenv.ps1)

Usage (PowerShell):
  python brevo_log.py                          # recent delivery summary, all recipients
  python brevo_log.py naveen@drawmycareer.com  # full event + message history for one address
  python brevo_log.py --days 14                # widen the lookback window (default 7)

Transactional mail (sent via /smtp/email) lives under Brevo > Transactional, NOT
Campaigns. This pulls the same data the dashboard's Logs/Statistics pages show.
"""
import os
import sys
from collections import defaultdict
from datetime import date, timedelta

import requests

BASE = "https://api.brevo.com/v3"
BOUNCE_EVENTS = {"hardBounces", "softBounces", "blocked", "invalid",
                 "deferred", "error"}


def _headers():
    key = (os.getenv("BREVO_API_KEY") or "").strip()
    if not key:
        print('ERROR: set BREVO_API_KEY first:  $env:BREVO_API_KEY="xkeysib-..."')
        sys.exit(1)
    return {"api-key": key, "Accept": "application/json"}


def _arg_days(default=7):
    if "--days" in sys.argv:
        try:
            return int(sys.argv[sys.argv.index("--days") + 1])
        except (ValueError, IndexError):
            print("ERROR: --days needs a number, e.g. --days 14")
            sys.exit(1)
    return default


def whoami(h):
    """Print which Brevo account this key belongs to — catches wrong-account confusion."""
    try:
        a = requests.get(f"{BASE}/account", headers=h, timeout=30).json()
        plan = a.get("plan") or []
        credits = next((p.get("credits") for p in plan
                        if p.get("creditsType") == "sendLimit"), "?")
        print(f"Account: {a.get('email')}  (company: {a.get('companyName') or 'n/a'})  "
              f"| send credits left: {credits}")
    except Exception as e:  # noqa: BLE001
        print(f"(could not read account: {e})")


def fetch_events(h, days, email=None):
    end = date.today()
    start = end - timedelta(days=days)
    url = (f"{BASE}/smtp/statistics/events?limit=2500&sort=desc"
           f"&startDate={start.isoformat()}&endDate={end.isoformat()}")
    if email:
        url += f"&email={email}"
    r = requests.get(url, headers=h, timeout=60)
    if r.status_code >= 300:
        print(f"events HTTP {r.status_code}: {r.text[:300]}")
        sys.exit(1)
    return (r.json() or {}).get("events") or []


def summary(h, days):
    """Distinct-recipient delivery table + totals."""
    events = fetch_events(h, days)
    per = defaultdict(set)
    totals = defaultdict(int)
    for e in events:
        per[e.get("email") or "(hidden)"].add(e.get("event"))
        totals[e.get("event")] += 1

    print(f"\nLast {days} day(s): {len(events)} events across {len(per)} recipients\n")
    print(f"{'recipient':38} {'deliv':6} {'open':5} {'click':6} bounce")
    print("-" * 70)
    delivered = bounced = 0
    for em in sorted(per):
        ev = per[em]
        dl = "yes" if "delivered" in ev else "-"
        op = "yes" if "opened" in ev else "-"
        cl = "yes" if "clicks" in ev else "-"
        bo = ",".join(sorted(ev & BOUNCE_EVENTS)) or "-"
        delivered += "delivered" in ev
        bounced += bool(ev & BOUNCE_EVENTS)
        print(f"{em:38} {dl:6} {op:5} {cl:6} {bo}")

    print("-" * 70)
    print(f"DELIVERED: {delivered}   BOUNCED: {bounced}   RECIPIENTS: {len(per)}")
    if totals:
        print("event totals:",
              ", ".join(f"{k}={v}" for k, v in
                        sorted(totals.items(), key=lambda kv: -kv[1])))


def detail(h, email, days):
    """Full event timeline + message-log entries for one address."""
    print(f"\n--- events for {email} (last {days} day(s)) ---")
    events = fetch_events(h, days, email=email)
    if not events:
        print("  (no events — not sent to, or outside the window; try --days 30)")
    for e in sorted(events, key=lambda x: x.get("date", "")):
        reason = e.get("reason") or ""
        print(f"  {e.get('date',''):30} {e.get('event',''):12} {reason}")

    print(f"\n--- message log for {email} ---")
    r = requests.get(
        f"{BASE}/smtp/emails?email={email}&limit=20&sort=desc",
        headers=h, timeout=60)
    if r.status_code >= 300:
        print(f"  smtp/emails HTTP {r.status_code}: {r.text[:200]}")
        return
    rows = (r.json() or {}).get("transactionalEmails") or []
    if not rows:
        print("  (no messages found)")
    for m in rows:
        print(f"  {m.get('date',''):30} {(m.get('subject') or '')[:42]}")
        print(f"     messageId={m.get('messageId','')}")


def main():
    h = _headers()
    days = _arg_days()
    # First positional arg that isn't a flag/flag-value is the email to inspect.
    skip = set()
    if "--days" in sys.argv:
        i = sys.argv.index("--days")
        skip.update({i, i + 1})
    email = next((a for j, a in enumerate(sys.argv[1:], 1)
                  if j not in skip and not a.startswith("--")), None)

    whoami(h)
    if email:
        detail(h, email, days)
    else:
        summary(h, days)


if __name__ == "__main__":
    main()
