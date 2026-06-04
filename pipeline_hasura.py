r"""Hasura-backed lead pipeline.

Reads seed domains from Hasura, then for each stage calls the live API and
stores the output back into Hasura before moving on:

  ocean_inputs (Hasura)
     -> Ocean.io        -> ocean_companies (Hasura)
     -> Prospeo         -> decision_makers (Hasura)
     -> EazyReach       -> email_contacts  (Hasura)
     -> Brevo (send)    -> subspace_sent_email_log (Hasura)

Prospeo (Search Person) replaces Kipplo for decision-maker discovery: given a
company domain it returns people + LinkedIn URLs (no email). EazyReach then
resolves each email from the LinkedIn URL, exactly as before.

Brevo uses the multi-account key DB (brevo_keys in Hasura): it sends from the
account with the most remaining credits. SAFE BY DEFAULT — it resolves emails
and writes every stage to Hasura but does NOT send until you pass --send.

Env (load via .\setenv.ps1):
  HASURA_GRAPHQL_URL, HASURA_ADMIN_SECRET
  OCEAN_API_KEY, PROSPEO_API_KEY, EAZYREACH_CLIENT_ID, EAZYREACH_CLIENT_SECRET
  Brevo keys come from the Hasura brevo_keys table.

Usage:
  python pipeline_hasura.py                 # process pending inputs, NO send
  python pipeline_hasura.py --send          # also deliver via Brevo + log sends
  python pipeline_hasura.py --limit 1       # only N input rows (saves credits)
  python pipeline_hasura.py --from-username joy --from-name "Joy"
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from leadpipeline.clients.brevo import BrevoClient
from leadpipeline.clients.eazyreach import EazyReachClient, normalize_linkedin
from leadpipeline.clients.ocean import OceanClient, SearchFilter
from leadpipeline.clients.prospeo import ProspeoClient
from leadpipeline.hasura_store import HasuraStore
from leadpipeline.templates import CAMPAIGN_HTML, CAMPAIGN_SUBJECT

SENT_LOG_TABLE = os.getenv("HASURA_SENT_LOG_TABLE", "subspace_sent_email_log")


def _arg(flag: str, default=None):
    if flag in sys.argv:
        try:
            return sys.argv[sys.argv.index(flag) + 1]
        except IndexError:
            print(f"ERROR: {flag} needs a value")
            sys.exit(1)
    return default


def _env(key: str) -> str:
    v = (os.getenv(key) or "").strip()
    if not v:
        raise RuntimeError(f"missing env var {key}")
    return v


def _best_email(resp: dict) -> Tuple[str, bool]:
    """(email, verified) — prefer a verified address."""
    emails = resp.get("emails") or []

    def pair(e):
        if isinstance(e, dict):
            return e.get("email", "") or "", e.get("verification", "") or ""
        return str(e), ""

    pairs = [pair(e) for e in emails]
    pairs = [(em, v) for (em, v) in pairs if em]
    if not pairs:
        return "", False
    pairs.sort(key=lambda pv: 0 if pv[1] == "verified" else 1)
    em, v = pairs[0]
    return em, (v == "verified")


def pick_brevo_account(store: HasuraStore) -> Tuple[str, List[Dict]]:
    """Read brevo_keys from Hasura, return (api_key, active_senders) for the
    account with the most remaining send credits."""
    rows = store.fetch("brevo_keys", "api_key",
                       where='{is_active: {_eq: true}}')
    best: Optional[Tuple[int, str, List[Dict]]] = None
    for row in rows:
        key = (row.get("api_key") or "").strip()
        if not key:
            continue
        client = BrevoClient(key)
        try:
            credits = client.send_credits()
            senders = client.list_senders(only_active=True)
        except Exception:  # noqa: BLE001
            continue
        if not senders:
            continue
        if best is None or credits > best[0]:
            best = (credits, key, senders)
    if best is None:
        raise RuntimeError("no usable Brevo account (credits + verified sender) "
                           "in brevo_keys")
    return best[1], best[2]


def run_pipeline(do_send: bool = False, limit: int = 0,
                 titles: Optional[List[str]] = None, per_company: int = 3,
                 from_username: str = "joy", from_name: str = "Joy") -> dict:
    """Run the funnel for pending ocean_inputs rows; return a totals dict.

    Server-safe: takes plain arguments, no argv parsing, and raises (never
    sys.exit) so a web worker can catch and report errors.
    """
    if titles is None:
        titles = [t.strip() for t in
                  (os.getenv("DECISION_TITLES") or "Founder,CEO,Director").split(",")
                  if t.strip()]

    store = HasuraStore()  # raises if HASURA_GRAPHQL_URL unset

    ocean = OceanClient(_env("OCEAN_API_KEY"))
    prospeo = ProspeoClient(_env("PROSPEO_API_KEY"))
    eazy = EazyReachClient(_env("EAZYREACH_CLIENT_ID"),
                           _env("EAZYREACH_CLIENT_SECRET"))

    # Resolve the Brevo sender up front (only needed when sending).
    sender = None
    brevo_client = None
    if do_send:
        api_key, senders = pick_brevo_account(store)
        uname = (from_username or "").strip().lower()
        sender_email = next(
            (s["email"] for s in senders
             if (s.get("email") or "").split("@", 1)[0].lower() == uname),
            senders[0]["email"])
        sender = {"name": from_name, "email": sender_email}
        brevo_client = BrevoClient(api_key)
        # Make sure the personalization attributes exist on this account so
        # {{contact.FIRSTNAME}} / {{contact.COMPANY}} resolve.
        for attr in ("FIRSTNAME", "COMPANY"):
            brevo_client.ensure_contact_attribute(attr)
        print(f"Brevo sender: {from_name} <{sender_email}> "
              f"(account chosen by most credits)")

    # --- read pending source rows ------------------------------------------
    inputs = store.fetch(
        "ocean_inputs",
        "id seed_domain countries company_sizes max_results",
        where='{status: {_eq: "pending"}}',
        order_by='{created_at: asc}',
        limit=limit or None)
    print(f"\n{len(inputs)} pending ocean_inputs row(s). "
          f"Mode: {'REAL SEND' if do_send else 'NO SEND (resolve + store only)'}\n")

    totals = {"companies": 0, "dms": 0, "emails": 0, "sent": 0}

    for inp in inputs:
        seed = inp["seed_domain"]
        flt = SearchFilter(
            lookalike_domains=[seed],
            countries=inp.get("countries") or [],
            company_sizes=inp.get("company_sizes") or [],
            limit=int(inp.get("max_results") or 10),
        )
        # 1) OCEAN
        try:
            companies = ocean.find_companies(flt)
        except Exception as e:  # noqa: BLE001
            print(f"[ocean] {seed}: ERROR {e}")
            store.update_by_pk("ocean_inputs", inp["id"],
                               {"status": "error", "error": str(e)[:500]})
            continue
        print(f"[ocean] {seed}: {len(companies)} companies")

        for c in companies:
            company_row = store.insert_one("ocean_companies", {
                "input_id": inp["id"], "name": c.name, "domain": c.domain,
                "industry": c.industry, "size": c.size, "country": c.country,
            })
            totals["companies"] += 1
            company_id = company_row.get("id")

            # 2) PROSPEO (decision-maker discovery)
            try:
                dms = prospeo.find_decision_makers(c.domain, titles, per_company)
            except Exception as e:  # noqa: BLE001
                print(f"  [prospeo] {c.domain}: ERROR {e}")
                store.update_by_pk("ocean_companies", company_id,
                                   {"status": "error", "error": str(e)[:500]})
                continue
            store.update_by_pk("ocean_companies", company_id, {"status": "done"})
            print(f"  [prospeo] {c.domain}: {len(dms)} people")

            for dm in dms:
                dm_row = store.insert_one("decision_makers", {
                    "company_id": company_id, "full_name": dm.full_name,
                    "first_name": dm.first_name, "last_name": dm.last_name,
                    "title": dm.title, "linkedin_url": dm.linkedin_url,
                    "domain": dm.domain, "company_name": dm.company_name,
                })
                totals["dms"] += 1
                dm_id = dm_row.get("id")

                li_norm = normalize_linkedin(dm.linkedin_url) if dm.linkedin_url else None
                if not dm.linkedin_url:
                    store.update_by_pk("decision_makers", dm_id,
                                       {"status": "no_linkedin"})
                    continue

                # 3) EAZYREACH: resolve email from the LinkedIn URL Prospeo gave.
                try:
                    resp = eazy.email_for_url(dm.linkedin_url)
                    email, verified = _best_email(resp)
                except Exception as e:  # noqa: BLE001
                    print(f"    [eazyreach] {dm.full_name}: ERROR {e}")
                    store.insert_one("email_contacts", {
                        "decision_maker_id": dm_id, "linkedin_url": li_norm,
                        "status": "error", "error": str(e)[:500]})
                    store.update_by_pk("decision_makers", dm_id, {"status": "done"})
                    continue

                contact_row = store.insert_one("email_contacts", {
                    "decision_maker_id": dm_id, "linkedin_url": li_norm,
                    "email": email or None, "verified": verified,
                    "status": "no_email" if not email else "pending",
                })
                store.update_by_pk("decision_makers", dm_id, {"status": "done"})
                contact_id = contact_row.get("id")
                if email:
                    totals["emails"] += 1
                print(f"    [eazyreach] {dm.full_name:24} -> "
                      f"{email or '(none)'} {'[verified]' if verified else ''}")

                # 4) BREVO
                if email and do_send:
                    # Upsert the recipient as a Brevo contact so {{contact.*}}
                    # tags in the template populate.
                    try:
                        brevo_client.upsert_contact(email, {
                            "FIRSTNAME": dm.first_name or dm.full_name or "there",
                            "COMPANY": dm.company_name or dm.domain or "",
                        })
                    except Exception as e:  # noqa: BLE001
                        print(f"      [brevo] contact upsert warning: {e}")
                    try:
                        msg_id = brevo_client.send_message(
                            sender=sender, to_email=email,
                            subject=CAMPAIGN_SUBJECT, body=CAMPAIGN_HTML,
                            html=True)
                    except Exception as e:  # noqa: BLE001
                        print(f"      [brevo] {email}: SEND FAILED {e}")
                        store.update_by_pk("email_contacts", contact_id,
                                           {"status": "error", "error": str(e)[:500]})
                        continue
                    _log_send(store, sender, email, msg_id)
                    store.update_by_pk("email_contacts", contact_id,
                                       {"status": "sent"})
                    totals["sent"] += 1
                    print(f"      [brevo] sent -> {email} ({msg_id})")

        store.update_by_pk("ocean_inputs", inp["id"], {"status": "done"})

    print(f"\nDONE. companies={totals['companies']} people={totals['dms']} "
          f"emails={totals['emails']} sent={totals['sent']}")
    if not do_send:
        print("No emails sent (resolve + store only). Re-run with --send to deliver.")
    return totals


def main() -> None:
    run_pipeline(
        do_send="--send" in sys.argv,
        limit=int(_arg("--limit", "0") or 0),
        per_company=int(os.getenv("PER_COMPANY_LIMIT", "3")),
        from_username=_arg("--from-username", os.getenv("FROM_USERNAME", "joy")),
        from_name=_arg("--from-name", os.getenv("FROM_NAME", "Joy")),
    )


def _log_send(store: HasuraStore, sender: Dict, to_email: str,
              msg_id: str) -> None:
    """Insert one delivered email into subspace_sent_email_log."""
    local, _, domain = sender["email"].partition("@")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    store.insert_one(SENT_LOG_TABLE, {
        "from_username": local,
        "from_name": sender.get("name", ""),
        "from_domain": domain,
        "subject": CAMPAIGN_SUBJECT,
        "body": CAMPAIGN_HTML,
        "to_mails": [to_email],
        "cc_mails": [],
        "attachments": [],
        "message_id": msg_id,
        "sent_at": now,
        "brevo_from": sender["email"],
        "brevo_to": [to_email],
        "brevo_subject": VOCALLABS_SUBJECT,
        "brevo_synced": True,
    })


if __name__ == "__main__":
    main()
