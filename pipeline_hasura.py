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
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

from leadpipeline.clients.brevo import BrevoClient
from leadpipeline.clients.eazyreach import EazyReachClient, normalize_linkedin
from leadpipeline.clients.ocean import OceanClient, SearchFilter
from leadpipeline.clients.prospeo import ProspeoClient, account_credits
from leadpipeline.hasura_store import HasuraStore
from leadpipeline.templates import (CAMPAIGN_SUBJECT, CAMPAIGN_TEXT,
                                    FOLLOWUP1_SUBJECT, FOLLOWUP1_TEXT,
                                    FOLLOWUP2_SUBJECT, FOLLOWUP2_TEXT)

SENT_LOG_TABLE = os.getenv("HASURA_SENT_LOG_TABLE", "subspace_sent_email_log")

# Sequence subjects double as markers: a send counts toward a contact's cadence
# only if its logged subject is one of these. Order = step number.
SEQUENCE_SUBJECTS = [CAMPAIGN_SUBJECT, FOLLOWUP1_SUBJECT, FOLLOWUP2_SUBJECT]
# step -> (subject, body) for follow-ups. step 1 = first follow-up, etc.
FOLLOWUP_STEPS = {
    1: (FOLLOWUP1_SUBJECT, FOLLOWUP1_TEXT),
    2: (FOLLOWUP2_SUBJECT, FOLLOWUP2_TEXT),
}
MAX_TOTAL_SENDS = 3   # initial + 2 follow-ups, then stop
FOLLOWUP_GAP_DAYS = 4


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


def _ocean_keys(store: HasuraStore) -> List[str]:
    """Active Ocean keys to rotate through. Falls back to OCEAN_API_KEY env."""
    try:
        rows = store.fetch("ocean_keys", "api_key",
                           where='{is_active: {_eq: true}}',
                           order_by='{created_at: asc}')
        keys = [(r.get("api_key") or "").strip() for r in rows]
        keys = [k for k in keys if k]
    except Exception:  # noqa: BLE001
        keys = []
    if not keys:
        env_key = (os.getenv("OCEAN_API_KEY") or "").strip()
        if env_key:
            keys = [env_key]
    if not keys:
        raise RuntimeError("no Ocean keys: add rows to ocean_keys or set "
                           "OCEAN_API_KEY")
    return keys


def _prospeo_keys(store: HasuraStore) -> List[str]:
    """Active Prospeo keys ordered by remaining credits (most first) so the
    pipeline auto-uses the richest key and fails over as keys deplete. Depleted
    keys (0 credits) are dropped. Falls back to the PROSPEO_API_KEY env var when
    the prospeo_keys table is empty. The credit check is free (no credits used)."""
    try:
        rows = store.fetch("prospeo_keys", "api_key",
                           where='{is_active: {_eq: true}}',
                           order_by='{created_at: asc}')
        keys = [(r.get("api_key") or "").strip() for r in rows]
        keys = [k for k in keys if k]
    except Exception:  # noqa: BLE001  (table missing / not tracked)
        keys = []
    if not keys:
        env_key = (os.getenv("PROSPEO_API_KEY") or "").strip()
        if env_key:
            keys = [env_key]
    if not keys:
        raise RuntimeError("no Prospeo keys: add rows to prospeo_keys or set "
                           "PROSPEO_API_KEY")

    # Usage-based ordering: query each key's remaining credits (free endpoint),
    # use the richest first, drop fully-depleted keys.
    scored = [(account_credits(k), k) for k in keys]
    usable = [(c, k) for c, k in scored if c != 0]   # keep >0 and unknown(-1)
    if not usable:                                   # all known-depleted
        usable = scored
    usable.sort(key=lambda ck: ck[0] if ck[0] >= 0 else -0.5, reverse=True)
    ordered = [k for _, k in usable]
    summary = ", ".join(str(c) if c >= 0 else "?" for c, _ in usable)
    print(f"[prospeo] {len(ordered)} key(s) by remaining credits: {summary}")
    return ordered


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
                 from_username: str = "joy", from_name: str = "Joy",
                 input_id: Optional[str] = None) -> dict:
    """Run the funnel for ocean_inputs rows; return a totals dict.

    input_id: process only that one ocean_inputs row (used by the Hasura
    insert webhook). When None, processes all rows with status='pending'.

    Server-safe: takes plain arguments, no argv parsing, and raises (never
    sys.exit) so a web worker can catch and report errors.
    """
    if titles is None:
        titles = [t.strip() for t in
                  (os.getenv("DECISION_TITLES") or "Founder,CEO,Director").split(",")
                  if t.strip()]

    store = HasuraStore()  # raises if HASURA_GRAPHQL_URL unset

    ocean = OceanClient(_ocean_keys(store))
    prospeo = ProspeoClient(_prospeo_keys(store))
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
    where = ('{id: {_eq: "%s"}}' % input_id if input_id
             else '{status: {_eq: "pending"}}')
    inputs = store.fetch(
        "ocean_inputs",
        "id seed_domain seed_domains countries company_sizes max_results "
        "email_subject email_body",
        where=where,
        order_by='{created_at: asc}',
        limit=limit or None)
    print(f"\n{len(inputs)} pending ocean_inputs row(s). "
          f"Mode: {'REAL SEND' if do_send else 'NO SEND (resolve + store only)'}\n")

    totals = {"companies": 0, "dms": 0, "emails": 0, "sent": 0}

    for inp in inputs:
        seed = inp["seed_domain"]
        # One or more seed domains feed a single Ocean lookalike search.
        seeds = inp.get("seed_domains") or ([seed] if seed else [])
        flt = SearchFilter(
            lookalike_domains=seeds,
            countries=inp.get("countries") or [],
            company_sizes=inp.get("company_sizes") or [],
            limit=int(inp.get("max_results") or 10),
        )
        # Email copy for this run: chosen template/draft, else hardcoded default.
        run_subject = inp.get("email_subject") or CAMPAIGN_SUBJECT
        run_body = inp.get("email_body") or CAMPAIGN_TEXT
        # 1) OCEAN
        try:
            companies = ocean.find_companies(flt)
        except Exception as e:  # noqa: BLE001
            print(f"[ocean] {seed}: ERROR {e}")
            store.update_by_pk("ocean_inputs", inp["id"],
                               {"status": "error", "error": str(e)[:500]})
            continue
        print(f"[ocean] {', '.join(seeds)}: {len(companies)} companies")

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

                # 3) EMAIL: EazyReach first, Prospeo enrich-person as fallback.
                email, verified, source = "", False, ""
                try:
                    resp = eazy.email_for_url(dm.linkedin_url)
                    email, verified = _best_email(resp)
                    if email:
                        source = "eazyreach"
                except Exception as e:  # noqa: BLE001
                    print(f"    [eazyreach] {dm.full_name}: ERROR {e}")
                # Fallback: if EazyReach found nothing (or errored), try Prospeo.
                if not email:
                    try:
                        p_email, p_verified = prospeo.find_email_by_linkedin(
                            dm.linkedin_url)
                        if p_email:
                            email, verified, source = p_email, p_verified, "prospeo"
                    except Exception as e:  # noqa: BLE001
                        print(f"    [prospeo-email] {dm.full_name}: ERROR {e}")

                contact_row = store.insert_one("email_contacts", {
                    "decision_maker_id": dm_id, "linkedin_url": li_norm,
                    "email": email or None, "verified": verified,
                    "status": "no_email" if not email else "pending",
                })
                store.update_by_pk("decision_makers", dm_id, {"status": "done"})
                contact_id = contact_row.get("id")
                if email:
                    totals["emails"] += 1
                tag = f"[{source}{' verified' if verified else ''}]" if email else ""
                print(f"    [email] {dm.full_name:24} -> "
                      f"{email or '(none)'} {tag}")

                # 4) BREVO
                if email and do_send:
                    # Dedup: the auto pipeline sends the INITIAL email only, once
                    # ever. If this address already got any campaign email (this
                    # or a previous run), skip — follow-ups are manual-only.
                    if _campaign_send_count(store, email) >= 1:
                        store.update_by_pk("email_contacts", contact_id,
                                           {"status": "already_sent"})
                        print(f"      [dedup] {email} already emailed — "
                              f"skipping (follow-ups are manual)")
                        continue
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
                            subject=run_subject, body=run_body,
                            html=False)
                    except Exception as e:  # noqa: BLE001
                        print(f"      [brevo] {email}: SEND FAILED {e}")
                        store.update_by_pk("email_contacts", contact_id,
                                           {"status": "error", "error": str(e)[:500]})
                        continue
                    _log_send(store, sender, email, msg_id,
                              subject=run_subject, body=run_body)
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


def _log_send(store: HasuraStore, sender: Dict, to_email: str, msg_id: str,
              subject: str = CAMPAIGN_SUBJECT, body: str = CAMPAIGN_TEXT) -> None:
    """Insert one delivered email into subspace_sent_email_log. The subject is
    also the cadence marker (see SEQUENCE_SUBJECTS), so always log the real one."""
    local, _, domain = sender["email"].partition("@")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    store.insert_one(SENT_LOG_TABLE, {
        "from_username": local,
        "from_name": sender.get("name", ""),
        "from_domain": domain,
        "subject": subject,
        "body": body,
        "to_mails": [to_email],
        "cc_mails": [],
        "attachments": [],
        "message_id": msg_id,
        "sent_at": now,
        "brevo_from": sender["email"],
        "brevo_to": [to_email],
        "brevo_subject": subject,
        "brevo_synced": True,
    })


# --------------------------------------------------------------------------
# Cadence helpers (dedup + follow-ups)
# --------------------------------------------------------------------------
def _parse_ts(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    s = s.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _campaign_send_count(store: HasuraStore, email: str) -> int:
    """How many campaign-sequence emails (initial + follow-ups) have already
    gone to this address. Used by the auto pipeline to send the initial once."""
    q = ("query($subj:[String!],$em:jsonb!){%s("
         "where:{brevo_subject:{_in:$subj},to_mails:{_contains:$em}}"
         "){id}}" % SENT_LOG_TABLE)
    rows = store.execute(q, {"subj": SEQUENCE_SUBJECTS, "em": [email]}).get(
        SENT_LOG_TABLE) or []
    return len(rows)


def _campaign_history(store: HasuraStore) -> Dict[str, Dict]:
    """Map recipient email -> {count, last} across all campaign-sequence sends."""
    q = ("query($subj:[String!]){%s("
         "where:{brevo_subject:{_in:$subj}},order_by:{sent_at:desc}"
         "){to_mails sent_at}}" % SENT_LOG_TABLE)
    rows = store.execute(q, {"subj": SEQUENCE_SUBJECTS}).get(SENT_LOG_TABLE) or []
    hist: Dict[str, Dict] = {}
    for r in rows:
        ts = r.get("sent_at")
        for em in (r.get("to_mails") or []):
            h = hist.setdefault(em, {"count": 0, "last": None})
            h["count"] += 1
            if h["last"] is None or (ts or "") > h["last"]:
                h["last"] = ts
    return hist


def _contact_identity(store: HasuraStore, email: str) -> Dict[str, str]:
    """Best-effort FIRSTNAME/COMPANY for a recipient, for Brevo personalization
    on follow-ups (the contact may live on a different Brevo account)."""
    try:
        rows = store.execute(
            "query($em:String!){email_contacts(where:{email:{_eq:$em}},"
            "order_by:{created_at:desc},limit:1){decision_maker_id}}",
            {"em": email}).get("email_contacts") or []
        dmid = rows[0].get("decision_maker_id") if rows else None
        if not dmid:
            return {}
        dm = store.execute(
            "query($id:uuid!){decision_makers_by_pk(id:$id)"
            "{first_name full_name company_name domain}}",
            {"id": dmid}).get("decision_makers_by_pk") or {}
        return {
            "FIRSTNAME": dm.get("first_name") or dm.get("full_name") or "there",
            "COMPANY": dm.get("company_name") or dm.get("domain") or "",
        }
    except Exception:  # noqa: BLE001
        return {}


def run_followups(send: bool = False, min_gap_days: int = FOLLOWUP_GAP_DAYS,
                  limit: int = 0, from_username: str = "joy",
                  from_name: str = "Joy") -> dict:
    """Send the next follow-up to contacts who are due one.

    Eligible = already received 1 or 2 campaign emails (so initial has gone out
    but the sequence isn't complete) AND the last send was >= min_gap_days ago.
    Step is derived from prior count: 1 prior -> follow-up 1; 2 prior -> follow-up 2.

    send=False (default) is a DRY RUN: returns who WOULD be emailed, sends
    nothing. Pass send=True to actually deliver. Never called automatically.
    """
    store = HasuraStore()
    hist = _campaign_history(store)
    cutoff = datetime.now(timezone.utc) - timedelta(days=min_gap_days)

    eligible: List[Dict] = []
    for email, h in hist.items():
        count = h["count"]
        if count < 1 or count >= MAX_TOTAL_SENDS:
            continue  # sequence not started, or already complete
        last = _parse_ts(h["last"])
        if last and last > cutoff:
            continue  # too soon since last send
        eligible.append({"email": email, "prior_sends": count,
                         "followup": count, "last_sent": h["last"]})
    eligible.sort(key=lambda x: x["last_sent"] or "")
    if limit:
        eligible = eligible[:limit]

    out = {"mode": "REAL SEND" if send else "DRY RUN (nothing sent)",
           "min_gap_days": min_gap_days, "eligible": len(eligible),
           "sent": 0, "recipients": eligible}
    if not send or not eligible:
        return out

    api_key, senders = pick_brevo_account(store)
    uname = (from_username or "").strip().lower()
    sender_email = next(
        (s["email"] for s in senders
         if (s.get("email") or "").split("@", 1)[0].lower() == uname),
        senders[0]["email"])
    sender = {"name": from_name, "email": sender_email}
    brevo_client = BrevoClient(api_key)
    for attr in ("FIRSTNAME", "COMPANY"):
        brevo_client.ensure_contact_attribute(attr)

    for r in eligible:
        subject, body = FOLLOWUP_STEPS[r["followup"]]
        attrs = _contact_identity(store, r["email"])
        if attrs:
            try:
                brevo_client.upsert_contact(r["email"], attrs)
            except Exception as e:  # noqa: BLE001
                print(f"  [brevo] upsert warning {r['email']}: {e}")
        try:
            msg_id = brevo_client.send_message(
                sender=sender, to_email=r["email"], subject=subject,
                body=body, html=False)
        except Exception as e:  # noqa: BLE001
            r["error"] = str(e)[:300]
            print(f"  [followup] {r['email']}: SEND FAILED {e}")
            continue
        _log_send(store, sender, r["email"], msg_id, subject=subject, body=body)
        r["sent"] = True
        out["sent"] += 1
        print(f"  [followup {r['followup']}] sent -> {r['email']} ({msg_id})")

    print(f"\nFOLLOW-UPS done. eligible={out['eligible']} sent={out['sent']}")
    return out


if __name__ == "__main__":
    main()
