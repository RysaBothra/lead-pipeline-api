-- Hasura-backed lead pipeline tables.
-- Run in Hasura Console > Data > SQL with "Track this" ticked so the GraphQL
-- queries/mutations (insert_*_one, *_by_pk, etc.) are generated for each table.
-- The final Brevo send is logged into the EXISTING subspace_sent_email_log.
--
--   ocean_inputs  --Ocean-->  ocean_companies  --Kipplo-->  decision_makers
--                 --EazyReach-->  email_contacts  --Brevo-->  subspace_sent_email_log

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

-- 1) SOURCE ("original database"): seed domains to run through Ocean lookalike.
CREATE TABLE IF NOT EXISTS public.ocean_inputs (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    seed_domain   text        NOT NULL,                 -- e.g. apollo.io
    countries     jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- ["IN"]
    company_sizes jsonb       NOT NULL DEFAULT '[]'::jsonb,   -- ["11-50"]
    max_results   int         NOT NULL DEFAULT 10,      -- Ocean "limit" per seed
    status        text        NOT NULL DEFAULT 'pending',  -- pending|done|error
    error         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2) OCEAN OUTPUT: companies (domains).
CREATE TABLE IF NOT EXISTS public.ocean_companies (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    input_id    uuid        REFERENCES public.ocean_inputs(id) ON DELETE SET NULL,
    name        text,
    domain      text        NOT NULL,
    industry    text,
    size        text,
    country     text,
    status      text        NOT NULL DEFAULT 'pending',  -- pending|done|error
    error       text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ocean_companies_domain_idx   ON public.ocean_companies(domain);
CREATE INDEX IF NOT EXISTS ocean_companies_input_idx    ON public.ocean_companies(input_id);

-- 3) KIPPLO OUTPUT: decision makers (LinkedIn).
CREATE TABLE IF NOT EXISTS public.decision_makers (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    uuid        REFERENCES public.ocean_companies(id) ON DELETE SET NULL,
    full_name     text,
    first_name    text,
    last_name     text,
    title         text,
    linkedin_url  text,
    domain        text,
    company_name  text,
    status        text        NOT NULL DEFAULT 'pending',  -- pending|done|no_linkedin
    error         text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decision_makers_company_idx  ON public.decision_makers(company_id);

-- 4) EAZYREACH OUTPUT: resolved email per decision maker.
CREATE TABLE IF NOT EXISTS public.email_contacts (
    id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    decision_maker_id  uuid        REFERENCES public.decision_makers(id) ON DELETE SET NULL,
    linkedin_url       text,
    email              text,
    verified           boolean     DEFAULT false,
    confidence         numeric,
    status             text        NOT NULL DEFAULT 'pending',  -- pending|sent|no_email|error
    error              text,
    created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_contacts_dm_idx     ON public.email_contacts(decision_maker_id);
CREATE INDEX IF NOT EXISTS email_contacts_email_idx  ON public.email_contacts(email);

-- Seed one row so you can run immediately (apollo.io lookalike, India, 5 results).
INSERT INTO public.ocean_inputs (seed_domain, countries, max_results)
VALUES ('apollo.io', '["IN"]'::jsonb, 5);
