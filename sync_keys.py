r"""Sync API keys from local text files into the Hasura key tables.

Edit the files in keys\ (one key per line; blank lines and #comments ignored),
then run this whenever you add keys:

    .\setenv.ps1            # loads HASURA_GRAPHQL_URL + HASURA_ADMIN_SECRET
    python sync_keys.py

It adds any NEW keys to the matching table and skips ones already present, so
it's safe to re-run. The keys\ folder is gitignored — never committed.

  keys\ocean.txt    -> ocean_keys     (Ocean.io discovery)
  keys\brevo.txt    -> brevo_keys     (Brevo sending)
  keys\prospeo.txt  -> prospeo_keys   (Prospeo enrichment)
"""
from __future__ import annotations

import os

from leadpipeline.hasura_store import HasuraStore

# file -> Hasura table
FILES = {
    "ocean_keys":   os.path.join("keys", "ocean.txt"),
    "brevo_keys":   os.path.join("keys", "brevo.txt"),
    "prospeo_keys": os.path.join("keys", "prospeo.txt"),
}


def read_keys(path: str):
    """Lines from a key file (stripped), skipping blanks and # comments.
    Returns None if the file doesn't exist."""
    try:
        with open(path, encoding="utf-8") as f:
            out = []
            for ln in f:
                s = ln.strip()
                if s and not s.startswith("#"):
                    out.append(s)
            # de-dup within the file, preserve order
            seen = set()
            return [k for k in out if not (k in seen or seen.add(k))]
    except FileNotFoundError:
        return None


def main() -> None:
    store = HasuraStore()  # raises if HASURA_GRAPHQL_URL is unset
    print("Syncing key files -> Hasura\n")
    for table, path in FILES.items():
        keys = read_keys(path)
        if keys is None:
            print(f"  {table:13} {path} not found — skipped")
            continue
        existing = {(r.get("api_key") or "")
                    for r in store.fetch(table, "api_key")}
        new = [k for k in keys if k not in existing]
        added = 0
        for k in new:
            # label is REQUIRED on brevo_keys; harmless on the others. Use a
            # masked tail so rows are identifiable in Hasura without exposing
            # the full key.
            obj = {"api_key": k, "label": "…" + k[-4:] if len(k) > 4 else "key"}
            try:
                store.insert_one(table, obj)
                added += 1
            except Exception as e:  # noqa: BLE001
                print(f"    ! {table}: skipped a key ({str(e)[:100]})")
        print(f"  {table:13} {len(keys):3} in file · "
              f"{added:3} added · {len(keys) - added:3} already present")
    print("\nDone.")


if __name__ == "__main__":
    main()
