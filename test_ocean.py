r"""Test the Ocean.io integration in isolation, using the confirmed-working
lookalike query (similar to apollo.io).

Run:
    .\.venv\Scripts\Activate.ps1
    $env:OCEAN_API_KEY="your-real-key"
    python test_ocean.py
"""
import json
import os
import sys

from leadpipeline.clients.ocean import OceanClient, SearchFilter

key = (os.getenv("OCEAN_API_KEY") or "").strip()
if not key:
    print('ERROR: set OCEAN_API_KEY first:  $env:OCEAN_API_KEY="..."')
    sys.exit(1)

client = OceanClient(key)

# Same shape as your working query: lookalike of apollo.io.
# For real runs, put YOUR ideal-customer seed domains here.
f = SearchFilter(lookalike_domains=["apollo.io"], limit=10)

print("Calling Ocean.io ...\n")
try:
    companies = client.find_companies(f)
except Exception as e:  # noqa: BLE001
    print("=== OCEAN CALL FAILED ===")
    print(repr(e))
    sys.exit(1)

print(f"Parsed {len(companies)} compan(y/ies):\n")
for c in companies:
    print(f"  - {c.name:28} {c.domain:24} {c.country:4} size={c.size:10} {c.industry}")

if not companies:
    print("\n(0 parsed -- run your standalone query and paste "
          "ocean_lookalike_out.json so the mapping can be checked.)")
