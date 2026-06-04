r"""End-to-end: LinkedIn URLs --(EazyReach)--> emails --(Brevo)--> VocalLabs mailer.

For each row in the input CSV: resolve a work email from the LinkedIn URL via
EazyReach (unless the row already carries one), then send the VocalLabs HTML
mailer to that address through Brevo. Writes a per-recipient result log.

SAFE BY DEFAULT: runs in Brevo *sandbox* mode (validated but NOT delivered).
Add --send to actually deliver.

Env (PowerShell):
    .\.venv\Scripts\Activate.ps1
    $env:EAZYREACH_CLIENT_ID="your-client-id"
    $env:EAZYREACH_CLIENT_SECRET="your-client-secret"
    $env:BREVO_API_KEY="xkeysib-..."

Usage:
    python eazy_to_brevo.py                              # sandbox, all rows
    python eazy_to_brevo.py --send --from sales@you.com  # REAL send
    python eazy_to_brevo.py --in eazyreach_results.csv   # reuse resolved emails (no credits)
    python eazy_to_brevo.py --limit 5                    # cap sends/lookups
    python eazy_to_brevo.py --yes                        # skip the confirmation prompt

Input CSV: needs a 'linkedin' column. Optional 'name' and an email column
('eazyreach_email' or 'email') — if a row already has an email it's used as-is
and no EazyReach credit is spent.

Output CSV (eazy_to_brevo_results.csv):
    name, linkedin, email, source, status, message_id, error
"""
import csv
import os
import sys

from leadpipeline.clients.brevo import BrevoClient
from leadpipeline.clients.eazyreach import EazyReachClient
from leadpipeline.templates import CAMPAIGN_HTML, CAMPAIGN_SUBJECT


def best_email(resp: dict) -> str:
    """Pick the best email from an EazyReach response (prefer verified)."""
    emails = resp.get("emails") or []

    def to_pair(e):
        if isinstance(e, dict):
            return e.get("email", "") or "", e.get("verification", "") or ""
        return str(e), ""

    pairs = [to_pair(e) for e in emails]
    pairs = [(em, v) for (em, v) in pairs if em]
    if not pairs:
        return ""
    pairs.sort(key=lambda pv: 0 if pv[1] == "verified" else 1)
    return pairs[0][0]


def arg_value(flag: str, default=None):
    if flag in sys.argv:
        try:
            return sys.argv[sys.argv.index(flag) + 1]
        except IndexError:
            print(f"ERROR: {flag} needs a value")
            sys.exit(1)
    return default


# ---- args ----
do_send = "--send" in sys.argv
assume_yes = "--yes" in sys.argv
prefer_from = arg_value("--from")
# --to EMAIL: preview mode. Sends the mailer to this address instead of the
# resolved prospect, and skips EazyReach lookups entirely (no credit spent).
to_override = arg_value("--to")
IN = arg_value("--in", os.getenv("EAZY_IN", "kipplo_contacts.csv"))
OUT = arg_value("--out", os.getenv("EAZY_OUT", "eazy_to_brevo_results.csv"))
limit = None
if "--limit" in sys.argv:
    try:
        limit = int(arg_value("--limit"))
    except (TypeError, ValueError):
        print("ERROR: --limit needs a number, e.g. --limit 5")
        sys.exit(1)

# ---- creds ----
cid = (os.getenv("EAZYREACH_CLIENT_ID") or "").strip()
csec = (os.getenv("EAZYREACH_CLIENT_SECRET") or "").strip()
brevo_key = (os.getenv("BREVO_API_KEY") or "").strip()
if not brevo_key:
    print('ERROR: set BREVO_API_KEY:  $env:BREVO_API_KEY="xkeysib-..."')
    sys.exit(1)

# ---- load input ----
try:
    with open(IN, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
except FileNotFoundError:
    print(f"ERROR: {IN} not found. Run from the folder that has it, "
          f"or pass --in <file>.")
    sys.exit(1)

# Keep rows that either have a LinkedIn URL to resolve or an email already.
targets = []
for r in rows:
    li = (r.get("linkedin") or "").strip()
    existing = (r.get("eazyreach_email") or r.get("email") or "").strip()
    if li or existing:
        targets.append(r)
if limit:
    targets = targets[:limit]

needs_lookup = (not to_override) and any(
    (r.get("linkedin") or "").strip()
    and not (r.get("eazyreach_email") or r.get("email") or "").strip()
    for r in targets
)
if needs_lookup and (not cid or not csec):
    print("ERROR: some rows need an EazyReach lookup but "
          "EAZYREACH_CLIENT_ID / EAZYREACH_CLIENT_SECRET are not set.\n"
          "Either set them, or use --in eazyreach_results.csv to reuse "
          "already-resolved emails.")
    sys.exit(1)

# ---- Brevo sender ----
brevo = BrevoClient(brevo_key)
try:
    sender = brevo.pick_sender(prefer_email=prefer_from)
except Exception as e:  # noqa: BLE001
    print("=== BREVO SENDER FETCH FAILED ===")
    print(repr(e))
    sys.exit(1)
if not sender:
    if prefer_from:
        print(f"Requested sender '{prefer_from}' is not a verified Brevo sender.")
    else:
        print("No verified Brevo senders. Verify one in Brevo: "
              "Settings > Senders, Domains & Dedicated IPs.")
    sys.exit(1)

# Ensure personalization attributes exist so {{contact.*}} tags resolve.
for _attr in ("FIRSTNAME", "COMPANY"):
    brevo.ensure_contact_attribute(_attr)

# ---- EazyReach (auth only if we'll actually look anything up) ----
eazy = EazyReachClient(cid, csec) if (cid and csec) else None
if needs_lookup:
    try:
        eazy.authenticate()
    except Exception as e:  # noqa: BLE001
        print("=== EAZYREACH AUTH FAILED ===")
        print(repr(e))
        sys.exit(1)

mode = "REAL SEND" if do_send else "SANDBOX (nothing delivered)"
print(f"\nInput:   {IN}  ({len(targets)} recipient row(s))")
print(f"From:    {sender['name']} <{sender['email']}>")
print(f"Subject: {CAMPAIGN_SUBJECT}")
print(f"Mode:    {mode}")
if to_override:
    print(f"PREVIEW: all mail goes to {to_override} (EazyReach lookups skipped)")

if do_send and not assume_yes:
    ans = input(f"\nReally send {len(targets)} real email(s)? [y/N] ").strip().lower()
    if ans not in ("y", "yes"):
        print("Aborted. (Drop --send to sandbox, or re-run with --yes.)")
        sys.exit(0)

# ---- run ----
out_rows = []
sent = skipped = failed = 0
for i, r in enumerate(targets, 1):
    name = (r.get("name") or "").strip()
    li = (r.get("linkedin") or "").strip()
    email = (r.get("eazyreach_email") or r.get("email") or "").strip()
    source = "csv" if email else ""

    # Resolve via EazyReach if needed (skipped in preview/--to mode).
    if not to_override and not email and li:
        try:
            resp = eazy.email_for_url(li)
            email = best_email(resp)
            source = "eazyreach"
        except Exception as e:  # noqa: BLE001
            print(f"{i:2}. {name:24} lookup ERROR: {e}")
            out_rows.append([name, li, "", "eazyreach", "lookup_error", "", str(e)])
            failed += 1
            continue

    # In preview mode every mail goes to the override address.
    send_to = to_override or email
    if not send_to:
        print(f"{i:2}. {name:24} (no email) -> skipped")
        out_rows.append([name, li, "", source, "no_email", "", ""])
        skipped += 1
        continue
    if to_override:
        source = "preview"

    # Upsert the recipient as a Brevo contact so {{contact.*}} tags populate.
    try:
        brevo.upsert_contact(send_to, {
            "FIRSTNAME": (name.split()[0] if name else "there"),
            "COMPANY": (r.get("company_domain") or ""),
        })
    except Exception as e:  # noqa: BLE001
        print(f"{i:2}. {name:24} contact upsert warning: {e}")

    try:
        msg_id = brevo.send_message(
            sender=sender,
            to_email=send_to,
            to_name=name,
            subject=CAMPAIGN_SUBJECT,
            body=CAMPAIGN_HTML,
            html=True,
            sandbox=not do_send,
        )
    except Exception as e:  # noqa: BLE001
        print(f"{i:2}. {name:24} {send_to:34} SEND FAILED: {e}")
        out_rows.append([name, li, send_to, source, "failed", "", str(e)])
        failed += 1
        continue

    status = "sent" if do_send else "sandbox_ok"
    print(f"{i:2}. {name:24} {send_to:34} [{status}] {msg_id}")
    out_rows.append([name, li, send_to, source, status, msg_id, ""])
    sent += 1

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["name", "linkedin", "email", "source",
                "status", "message_id", "error"])
    w.writerows(out_rows)

label = "sent" if do_send else "validated (sandbox)"
print(f"\nDone. {sent} {label}, {skipped} skipped (no email), {failed} failed.")
print(f"Wrote {OUT}")
if not do_send and sent:
    print("This was a SANDBOX run — re-run with --send to deliver for real.")
