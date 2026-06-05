-- Phase 1 (SaaS): users + per-user tenancy.
-- Run in Hasura Console > Data > SQL with "Track this" ticked so the GraphQL
-- queries/mutations for `users` are generated.
--
-- Multi-tenancy model: every run starts as an ocean_inputs row tagged with
-- user_id. All downstream rows (ocean_companies -> decision_makers ->
-- email_contacts) trace back to that input, so scoping reads by the user's
-- input ids isolates each tenant's data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

CREATE TABLE IF NOT EXISTS public.users (
    id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email          text        UNIQUE NOT NULL,
    password_hash  text        NOT NULL,
    name           text,
    plan           text        NOT NULL DEFAULT 'free',
    -- usage metering (Phase 2): monthly_quota caps billable actions (emails
    -- sent / leads found); usage_count is the running total this period.
    monthly_quota  int         NOT NULL DEFAULT 50,
    usage_count    int         NOT NULL DEFAULT 0,
    usage_period   text,        -- 'YYYY-MM' the usage_count applies to
    is_active      boolean     NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now()
);

-- Tenant key on the funnel's entry table. Nullable so existing rows (from the
-- single-user era) stay valid; new rows are always written with a user_id.
ALTER TABLE public.ocean_inputs
    ADD COLUMN IF NOT EXISTS user_id uuid
    REFERENCES public.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS ocean_inputs_user_idx ON public.ocean_inputs(user_id);
CREATE INDEX IF NOT EXISTS users_email_idx        ON public.users(lower(email));
