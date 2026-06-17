"""End-to-end smoke test for the onboarding wizard backend.

Exercises the whole flow against a running server:
  analyze -> poll until analyzed -> PATCH a section -> launch.

Run the server first (in another terminal):
    .venv\\Scripts\\python.exe -m uvicorn server:app --port 8000

Then:
    .venv\\Scripts\\python.exe test_onboarding.py
    .venv\\Scripts\\python.exe test_onboarding.py https://stripe.com   # any site

Reads API_TOKEN from .env. Override the server with BASE_URL env var.
"""
from __future__ import annotations

import json
import os
import sys
import time

import requests


def load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    for ln in open(path, encoding="utf-8"):
        ln = ln.strip()
        if ln and not ln.startswith("#") and "=" in ln:
            k, v = ln.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def main() -> int:
    load_dotenv()
    base = os.getenv("BASE_URL", "http://localhost:8000").rstrip("/")
    token = (os.getenv("API_TOKEN") or "").strip()
    website = sys.argv[1] if len(sys.argv) > 1 else "https://subspace.money"
    if not token:
        print("! API_TOKEN not set (check .env)")
        return 1
    H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    print(f"-> server {base}")
    try:
        h = requests.get(f"{base}/health", timeout=5)
        print(f"   health: {h.status_code} {h.json()}")
    except requests.RequestException as e:
        print(f"! server not reachable: {e}\n  Start it: "
              f".venv\\Scripts\\python.exe -m uvicorn server:app --port 8000")
        return 1

    print(f"-> analyze {website}")
    r = requests.post(f"{base}/onboarding/analyze", headers=H,
                      json={"website": website}, timeout=30)
    print(f"   {r.status_code} {r.text[:140]}")
    r.raise_for_status()
    oid = r.json()["id"]

    print("-> polling (AI analysis runs in the background)…")
    row = {}
    for i in range(60):
        time.sleep(2)
        row = requests.get(f"{base}/onboarding/{oid}", headers=H, timeout=15).json()
        print(f"   poll {i:>2}: status={row['status']:<9} "
              f"progress={row['analysis_progress']:>3} "
              f"err={row.get('analysis_error')}")
        if row["status"] in ("analyzed", "error"):
            break

    if row.get("status") != "analyzed":
        print("! analysis did not complete:", row.get("analysis_error"))
        return 1

    print("-> sections produced:")
    for k in ("services", "differentiators", "personas", "offers"):
        print(f"   {k}: {len(row.get(k) or [])}")
    print("   persona[0]:", json.dumps((row.get("personas") or [None])[0]))
    print("   offer[0]:  ", json.dumps((row.get("offers") or [None])[0]))
    print("   voice:     ", json.dumps(row.get("voice_profile")))

    print("-> PATCH exclusions (autosave test)")
    p = requests.patch(f"{base}/onboarding/{oid}", headers=H, json={
        "exclusions": {"companies": ["Google"], "industries": ["Agencies"],
                       "job_titles": ["Intern"]}}, timeout=15)
    print(f"   {p.status_code} exclusions={p.json().get('exclusions')}")

    print("-> launch (persist-only)")
    offers = row.get("offers") or []
    if offers:
        offers[0]["selected"] = True
        requests.patch(f"{base}/onboarding/{oid}", headers=H,
                       json={"offers": offers}, timeout=15)
    L = requests.post(f"{base}/onboarding/{oid}/launch", headers=H, timeout=15)
    print(f"   {L.status_code} {json.dumps(L.json())}")

    print(f"\nOK — session {oid}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
