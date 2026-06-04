r"""Test the Brevo stage (Option B: retrieve verified senders).

Steps:
  python test_brevo.py                 -> just LIST your verified senders
  python test_brevo.py --sandbox       -> list, then sandbox-send (no real email)
  python test_brevo.py --send          -> list, then REAL send to yourself

Choose which sender to send from:
  --from you@verified.com              (defaults to first active sender)

Env:
  BREVO_API_KEY    your Brevo API key
  TEST_TO_EMAIL    your own inbox (for --sandbox/--send)

PowerShell:
  $env:BREVO_API_KEY="xkeysib-..."
  $env:TEST_TO_EMAIL="you@gmail.com"
  python test_brevo.py
  python test_brevo.py --sandbox --from sales@yourdomain.com
  python test_brevo.py --send --from sales@yourdomain.com
"""
import os
import sys

import requests

from leadpipeline.clients.brevo import BrevoClient

key = (os.getenv("BREVO_API_KEY") or "").strip()
if not key:
    print('ERROR: set BREVO_API_KEY first:  $env:BREVO_API_KEY="..."')
    sys.exit(1)

client = BrevoClient(key)

# 1) Always list verified senders first.
print("Fetching verified senders from Brevo ...\n")
try:
    senders = client.list_senders(only_active=True)
    all_senders = client.list_senders(only_active=False)
except Exception as e:  # noqa: BLE001
    print("=== SENDER FETCH FAILED ===")
    print(repr(e))
    sys.exit(1)

print(f"Verified (active) senders: {len(senders)} of {len(all_senders)} total\n")
for s in all_senders:
    mark = "VERIFIED" if s["active"] else "  not verified"
    print(f"  [{mark}] {s['name'] or '(no name)':24} {s['email']}")

if not senders:
    print("\nNo verified senders. Verify one in Brevo: "
          "Settings > Senders, Domains & Dedicated IPs.")
    sys.exit(0)

do_sandbox = "--sandbox" in sys.argv
do_send = "--send" in sys.argv
if not (do_sandbox or do_send):
    print("\n(List only. Add --sandbox to test-send, or --send for a real email.)")
    sys.exit(0)

# 2) Pick a sender (explicit --from, else first verified).
prefer = None
if "--from" in sys.argv:
    try:
        prefer = sys.argv[sys.argv.index("--from") + 1]
    except IndexError:
        print("ERROR: --from needs an email")
        sys.exit(1)

chosen = client.pick_sender(prefer_email=prefer)
if not chosen:
    print(f"\nRequested sender '{prefer}' is not a verified sender.")
    sys.exit(1)

to_email = (os.getenv("TEST_TO_EMAIL") or "").strip()
if not to_email:
    print('\nERROR: set TEST_TO_EMAIL (your inbox):  $env:TEST_TO_EMAIL="..."')
    sys.exit(1)

mode = "REAL SEND" if do_send else "SANDBOX (no real email)"
print(f"\nMode: {mode}")
print(f"From: {chosen['name']} <{chosen['email']}>")
print(f"To:   {to_email}")

payload = {
    "sender": {"name": chosen["name"], "email": chosen["email"]},
    "to": [{"email": to_email, "name": "Test Recipient"}],
    "subject": "Lead Pipeline - Brevo test",
    "htmlContent": (
        "<html><body><h2>Brevo test done OK</h2>"
        f"<p>Sent from {chosen['name']} &lt;{chosen['email']}&gt;.</p>"
        "</body></html>"
    ),
}
headers = {"api-key": key, "Content-Type": "application/json",
           "Accept": "application/json"}
if do_sandbox and not do_send:
    headers["X-Sib-Sandbox"] = "drop"

print("\nCalling Brevo /smtp/email ...")
r = requests.post("https://api.brevo.com/v3/smtp/email",
                  json=payload, headers=headers, timeout=30)
print(f"HTTP {r.status_code}")
print("Body:", r.text or "(empty)")
if 200 <= r.status_code < 300:
    if do_send:
        print(f"\nSUCCESS - check {to_email} (and spam).")
    else:
        print("\nSANDBOX OK - sender + request valid. Run --send for real.")
else:
    print("\n=== BREVO REJECTED ===  paste this output to get it fixed.")
    sys.exit(1)
