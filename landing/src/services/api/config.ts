// Base URL for all VocalLabs API endpoints — resolved at RUNTIME, not build.
//
// - Server side (Node, Server Components, route handlers, SSR): reads
//   `process.env.VOCALLABS_API_BASE_URL` directly each time this module loads.
// - Client side (browser): reads `window.__ENV__.VOCALLABS_API_BASE_URL`,
//   which is injected by an inline <script> in app/layout.tsx before any
//   client JS runs.
//
// This avoids the NEXT_PUBLIC_* build-time inlining problem: a single Docker
// image can be deployed to dev/staging/prod by changing the env var in the
// container — no rebuild required.
const DEFAULT_API_BASE_URL = 'https://hasura-dev.vocallabs.ai';

function resolveApiBaseUrl(): string { 
  if (typeof window === 'undefined') {
    return process.env.VOCALLABS_API_BASE_URL || DEFAULT_API_BASE_URL;
  }
  return window.__ENV__?.VOCALLABS_API_BASE_URL || DEFAULT_API_BASE_URL;
}

export const VOCALLABS_API_BASE_URL = resolveApiBaseUrl();

// Env-driven (NOT hardcoded): follows VOCALLABS_API_BASE_URL, so a dev
// deployment hits hasura-dev.vocallabs.ai and a prod deployment hits
// db.vocallabs.ai — no rebuild, just the container env var. Defaults to dev.
export const VOCALLABS_GRAPHQL_ENDPOINT = `${VOCALLABS_API_BASE_URL}/v1/graphql`;

// EazyReach search uses Subspace endpoint (same as history)
export const EAZYREACH_SEARCH_ENDPOINT = 'https://db.subspace.money/v1/graphql';

// goFlash auth service base (passkey REST lives here). Runtime-resolved like the
// API base; defaults to the deployed goFlash at auth.vocallabs.ai.
const DEFAULT_GOFLASH_BASE_URL = 'https://auth.vocallabs.ai';
function resolveGoflashBaseUrl(): string {
  if (typeof window === 'undefined') {
    return process.env.GOFLASH_BASE_URL || DEFAULT_GOFLASH_BASE_URL;
  }
  return (window.__ENV__ as any)?.GOFLASH_BASE_URL || DEFAULT_GOFLASH_BASE_URL;
}
export const GOFLASH_BASE_URL = resolveGoflashBaseUrl();

export const API_CONFIG = {
  HASURA_ENDPOINT: VOCALLABS_GRAPHQL_ENDPOINT,
  GROW_ENDPOINT: VOCALLABS_GRAPHQL_ENDPOINT,
  SUBSPACE_ENDPOINT: VOCALLABS_GRAPHQL_ENDPOINT,
  // Passkey (WebAuthn) now served by goFlash via REST, not Subspace GraphQL.
  PASSKEY_ENDPOINT: GOFLASH_BASE_URL,
};
