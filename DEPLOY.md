# Deploying the Lead Pipeline API

A single Docker image runs one FastAPI app ([server.py](server.py)) exposing the
mailer and the pipeline trigger, protected by an API key. State lives in Hasura,
so the container is stateless and scales horizontally.

## Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET  | `/health` | no | liveness check |
| POST | `/send` | yes | send one email via Brevo (multi-account, Hasura-logged) |
| POST | `/pipeline/run` | yes | run Ocean→Prospeo→EazyReach→Brevo in the background |
| GET  | `/pipeline/status` | yes | per-stage row counts from Hasura |
| GET  | `/docs` | no | interactive Swagger UI |

Auth: every protected route needs `Authorization: Bearer <API_TOKEN>`.

## 1. Configure

```bash
cp .env.example .env
# edit .env: set API_TOKEN (long random secret), HASURA_*, OCEAN/PROSPEO/EAZYREACH keys
```
Generate a token: `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
Brevo keys are **not** in `.env` — they live in the Hasura `brevo_keys` table.

## 2. Run locally with Docker

```bash
docker compose up --build
# API on http://localhost:8000
```

## 3. Deploy to a server (any VPS / cloud)

Any host with Docker works (DigitalOcean, AWS EC2, Hetzner, etc.):
```bash
# on the server, with the repo + a filled-in .env:
docker compose up -d --build
# put Caddy/Nginx in front for HTTPS, or open port 8000
```

Or build & push an image, then run it:
```bash
docker build -t lead-pipeline-api .
docker run -d -p 8000:8000 --env-file .env lead-pipeline-api
```

**Google Cloud Run** (serverless, scales to zero):
```bash
gcloud run deploy lead-pipeline-api --source . \
  --set-env-vars API_TOKEN=...,HASURA_GRAPHQL_URL=...,HASURA_ADMIN_SECRET=...,\
OCEAN_API_KEY=...,PROSPEO_API_KEY=...,EAZYREACH_CLIENT_ID=...,EAZYREACH_CLIENT_SECRET=... \
  --allow-unauthenticated --region us-central1
# Cloud Run injects $PORT; the Dockerfile already honors it.
```

## 4. Call it

```bash
TOKEN="your-API_TOKEN"
BASE="https://your-host"      # or http://localhost:8000

# health (no auth)
curl $BASE/health

# send one email
curl -X POST $BASE/send -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{
    "from_username":"joy","from_name":"Joy","to_email":"x@y.com",
    "text_body":"<h1>Hi</h1>","subject":"Hello","content_type":"html"}'

# kick off the funnel (resolve + store, no send)
curl -X POST $BASE/pipeline/run -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"send": false, "limit": 1}'

# real send run
curl -X POST $BASE/pipeline/run -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"send": true}'

# progress
curl $BASE/pipeline/status -H "Authorization: Bearer $TOKEN"
```

`/pipeline/run` returns immediately (`202 started`) and runs in the background;
poll `/pipeline/status` or query Hasura for results.

## Production notes
- **HTTPS:** terminate TLS at a reverse proxy (Caddy/Nginx) or the PaaS — the
  API token must never travel over plain HTTP.
- **Secrets:** inject via env vars / the platform's secret manager. Don't bake
  `.env`, `setenv.ps1`, or `brevo_keys.json` into the image (`.dockerignore`
  already excludes them).
- **Workers:** tune `WEB_CONCURRENCY` (gunicorn worker count) to the host's CPUs.
- **Long runs:** `/pipeline/run` uses an in-process background task; if the
  container restarts mid-run, unfinished `ocean_inputs` stay `pending` and are
  picked up on the next run (it's resumable by design).
- **Adding inputs:** insert rows into `ocean_inputs` (seed_domain + countries +
  max_results); the next `/pipeline/run` processes pending ones.
