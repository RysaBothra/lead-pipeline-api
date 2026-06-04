r"""Test the EazyReach stage: read LinkedIn URLs from kipplo_contacts.csv,
resolve emails via EazyReach, write eazyreach_results.csv.

Auth needs BOTH clientId and clientSecret (two-step token auth).

PowerShell:
    .\.venv\Scripts\Activate.ps1
    $env:EAZYREACH_CLIENT_ID="your-client-id"
    $env:EAZYREACH_CLIENT_SECRET="your-client-secret"
    python test_eazyreach.py                # only rows with NO email yet (default)
    python test_eazyreach.py --all          # every row in the CSV
    python test_eazyreach.py --limit 5      # cap how many lookups (saves credits)

Input  CSV columns expected: linkedin, name, company_domain, email
Output CSV columns: name, linkedin, company_domain, kipplo_email,
                    eazyreach_email, verification, status
"""
import csv
import os
import sys

from leadpipeline.clients.eazyreach import EazyReachClient, normalize_linkedin

cid = (os.getenv("EAZYREACH_CLIENT_ID") or "").strip()
csec = (os.getenv("EAZYREACH_CLIENT_SECRET") or "").strip()
if not cid or not csec:
    print("ERROR: set both EAZYREACH_CLIENT_ID and EAZYREACH_CLIENT_SECRET")
    sys.exit(1)

IN = os.getenv("EAZY_IN", "testing.csv")
OUT = os.getenv("EAZY_OUT", "eazyreach_results.csv")
do_all = "--all" in sys.argv
limit = None
if "--limit" in sys.argv:
    try:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
    except (ValueError, IndexError):
        print("ERROR: --limit needs a number, e.g. --limit 5")
        sys.exit(1)

# Load input rows
try:
    with open(IN, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
except FileNotFoundError:
    print(f"ERROR: {IN} not found. Run it from the folder that has it.")
    sys.exit(1)

# Filter: by default only rows missing an email
targets = []
for r in rows:
    li = (r.get("linkedin") or "").strip()
    if not li:
        continue
    if not do_all and (r.get("email") or "").strip():
        continue  # skip rows that already have a Kipplo email
    targets.append(r)

if limit:
    targets = targets[:limit]

print(f"Loaded {len(rows)} rows from {IN}.")
print(f"Looking up {len(targets)} LinkedIn URL(s) via EazyReach "
      f"({'all rows' if do_all else 'only rows missing email'}).\n")

client = EazyReachClient(cid, csec)

# Authenticate once up front so auth errors are obvious.
try:
    client.authenticate()
    print("Auth OK.\n")
except Exception as e:  # noqa: BLE001
    print("=== EAZYREACH AUTH FAILED ===")
    print(repr(e))
    sys.exit(1)

out_rows = []
for i, r in enumerate(targets, 1):
    li = r["linkedin"].strip()
    name = (r.get("name") or "").strip()
    try:
        resp = client.email_for_url(li)
    except Exception as e:  # noqa: BLE001
        print(f"{i:2}. {name:24} ERROR: {e}")
        out_rows.append([name, li, r.get("company_domain", ""),
                         r.get("email", ""), "", "", f"error: {e}"])
        continue

    # show raw email entries the first time so we can confirm the shape
    if i == 1:
        import json as _json
        print("    [raw emails sample]:", _json.dumps(resp.get("emails"))[:300])
    emails = resp.get("emails") or []
    email, verif, status = "", "", resp.get("status", "no_email")
    if emails:
        # EazyReach may return emails as dicts {email, verification} OR plain strings.
        def to_pair(e):
            if isinstance(e, dict):
                return e.get("email", ""), e.get("verification", "")
            return str(e), ""  # plain string email, no verification info
        pairs = [to_pair(e) for e in emails]
        pairs = [(em, v) for (em, v) in pairs if em]
        if pairs:
            # prefer verified if any dict said so
            pairs.sort(key=lambda pv: 0 if pv[1] == "verified" else 1)
            email, verif = pairs[0]
            status = "found"
    print(f"{i:2}. {name:24} -> {email or '(none)':35} [{verif or status}]")
    out_rows.append([name, li, r.get("company_domain", ""),
                     r.get("email", ""), email, verif, status])

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["name", "linkedin", "company_domain", "kipplo_email",
                "eazyreach_email", "verification", "status"])
    w.writerows(out_rows)

found = sum(1 for r in out_rows if r[4])
print(f"\nDone. {found}/{len(out_rows)} got an email from EazyReach.")
print(f"Wrote {OUT}")
