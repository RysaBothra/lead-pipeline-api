-- Sent-email report table for mailer_api.py.
-- Run in Hasura Console > Data > SQL  (tick "Track this" so the GraphQL
-- mutation insert_email_sends_one is generated), or run in Postgres then
-- track the table in Hasura manually.
--
-- Matches mailer_api.py default:  HASURA_SENDS_TABLE = email_sends

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- for gen_random_uuid()

CREATE TABLE IF NOT EXISTS public.email_sends (
    id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    sent_at     timestamptz  NOT NULL DEFAULT now(),
    message_id  text,                         -- Brevo's unique id for the email
    from_mail   text         NOT NULL,        -- sender it went out from
    subject     text,
    to_mail     text         NOT NULL         -- recipient
);

-- Handy for looking up a thread / following up by recipient or message id.
CREATE INDEX IF NOT EXISTS email_sends_to_mail_idx     ON public.email_sends (to_mail);
CREATE INDEX IF NOT EXISTS email_sends_message_id_idx  ON public.email_sends (message_id);
