-- Brevo API keys table for the multi-account mailer (mailer_api.py).
-- Run this in Hasura Console > Data > SQL  (tick "track this" so Hasura exposes it),
-- or via any Postgres client then track the table in Hasura manually.
--
-- Column names match mailer_api.py defaults:
--   HASURA_KEYS_TABLE        = brevo_keys
--   HASURA_KEYS_LABEL_FIELD  = label
--   HASURA_KEYS_APIKEY_FIELD = api_key

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS public.brevo_keys (
    id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    label       text          NOT NULL,              -- account name, e.g. "vocallabs"
    api_key     text          NOT NULL UNIQUE,       -- xkeysib-...
    is_active   boolean       NOT NULL DEFAULT true, -- flip false to retire a key
    created_at  timestamptz   NOT NULL DEFAULT now()
);

-- Add your Brevo API keys as rows (do NOT commit real keys to git).
-- Insert via the Hasura Console (Data > brevo_keys > Insert Row), or:
-- INSERT INTO public.brevo_keys (label, api_key)
-- VALUES ('your-account-label', 'xkeysib-REPLACE_WITH_YOUR_BREVO_KEY')
-- ON CONFLICT (api_key) DO NOTHING;
