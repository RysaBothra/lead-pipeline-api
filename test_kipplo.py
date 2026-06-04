r"""Test the Kipplo integration in isolation — pulls MULTIPLE people and
writes the full results to a JSON file (kipplo_output.json).

Uses ONLY your real KIPPLO_API_KEY.

Run:
    .\.venv\Scripts\Activate.ps1
    $env:KIPPLO_API_KEY="your-real-key"
    python test_kipplo.py
Optional:
    $env:KIPPLO_TEST_DOMAIN="razorpay.com"
    $env:KIPPLO_HOW_MANY="25"
"""
import json
import os
import sys

from leadpipeline.clients.kipplo import KipploClient

key = (os.getenv("KIPPLO_API_KEY") or "").strip()
if not key:
    print('ERROR: set KIPPLO_API_KEY first:  $env:KIPPLO_API_KEY="..."')
    sys.exit(1)

DOMAIN = os.getenv("KIPPLO_TEST_DOMAIN", "razorpay.com")
HOW_MANY = int(os.getenv("KIPPLO_HOW_MANY", "25"))
OUT_FILE = os.getenv("KIPPLO_OUT", "kipplo_output.json")

client = KipploClient(key)

# 1) Coverage total
try:
    total = client.total(DOMAIN)
    print(f"Kipplo has {total} people on record at {DOMAIN}.")
except Exception as e:  # noqa: BLE001
    print("=== KIPPLO COVERAGE CALL FAILED ===")
    print(repr(e))
    sys.exit(1)

# 2) Pull people (parsed) AND grab the raw API response for the same query
print(f"Fetching up to {HOW_MANY} people ...")
try:
    dms = client.find_decision_makers(DOMAIN, titles=None, limit=HOW_MANY)
    raw = client.api.do_json("POST", client.path, {"params": {"filters": [
        {"field": "company_domain", "operator": "Equals", "value": DOMAIN},
    ], "page": 1, "page_size": min(HOW_MANY, 1000)}})
except Exception as e:  # noqa: BLE001
    print("=== KIPPLO FETCH FAILED ===")
    print(repr(e))
    sys.exit(1)

# Build a clean JSON structure: summary + parsed people + raw API response.
people = [{
    "full_name": d.full_name,
    "first_name": d.first_name,
    "last_name": d.last_name,
    "title": d.title,
    "linkedin_url": d.linkedin_url,
    "company_name": d.company_name,
    "domain": d.domain,
} for d in dms]

output = {
    "domain": DOMAIN,
    "total_on_record": total,
    "returned": len(people),
    "people": people,
    "raw_response": raw,   # full API response for inspection / field mapping
}

with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"\nWrote {len(people)} people (+ raw response) to {OUT_FILE}")
print("\nQuick preview:")
for i, p in enumerate(people[:10], 1):
    li = p["linkedin_url"] or "(no url - availability endpoint)"
    print(f"{i:2}. {p['full_name']:28} {p['title'] or '(hidden)':28} {li}")
if len(people) > 10:
    print(f"    ... and {len(people)-10} more in {OUT_FILE}")
