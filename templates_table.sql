-- Email templates library + per-run email override.
-- A template is reusable email copy; a run (ocean_inputs row) may carry its own
-- chosen email_subject/email_body (from a picked template or a custom draft),
-- which the pipeline uses for the initial send instead of the hardcoded default.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.templates (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text        NOT NULL,
    subject     text        NOT NULL,
    body        text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Per-run email override (nullable: falls back to the default template).
ALTER TABLE public.ocean_inputs ADD COLUMN IF NOT EXISTS email_subject text;
ALTER TABLE public.ocean_inputs ADD COLUMN IF NOT EXISTS email_body    text;
