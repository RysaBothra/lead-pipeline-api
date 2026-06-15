// Server-only whitelabel fetcher. Used by:
//   - app/layout.tsx's generateMetadata — for per-tenant <title>/favicon/OG tags
//   - The Providers tree — server-fetches branding once per request and seeds
//     WhiteLabelingProvider so the browser never has to call Hasura directly
//     (avoids cross-origin CORS, eliminates the flash of default branding,
//     and removes one round-trip from first paint).

import { VOCALLABS_GRAPHQL_ENDPOINT } from '../api/config';

const ENDPOINT = VOCALLABS_GRAPHQL_ENDPOINT;

const QUERY = /* GraphQL */ `
  query GetWlResourcesByDomain($domain: String!) {
    vocallabs_wl_resources(where: { domain: { _ilike: $domain } }) {
      client_id
      name
      domain
      square_logo
      square_logo_dark
      rect_logo
      rect_logo_dark
      home_config
      feature_access
      status
    }
  }
`;

// JSON-serializable snapshot — safe to pass from server components to client
// components as a prop. Mirrors the non-function fields of WhiteLabelingData
// so the provider can hydrate state directly.
export interface WhitelabelBrandingSnapshot {
  companyName: string;
  logoSquare: string | null;
  logoSquareDark: string | null;
  logoRect: string | null;
  logoRectDark: string | null;
  favicon: string | null;
  featureAccess: string[] | null;
  homeConfig: any | null;
  isWhiteLabeled: boolean;
}

export const DEFAULT_BRANDING_SNAPSHOT: WhitelabelBrandingSnapshot = {
  companyName: 'VocalLabs AI',
  logoSquare: null,
  logoSquareDark: null,
  logoRect: null,
  logoRectDark: null,
  favicon: null,
  featureAccess: null,
  homeConfig: null,
  isWhiteLabeled: false,
};

function parseFeatureAccess(raw: unknown): string[] | null {
  if (!raw) return null;
  try {
    if (Array.isArray(raw)) return raw as string[];
    if (typeof raw === 'string') return JSON.parse(raw);
    if (typeof raw === 'object') {
      const obj = raw as { features?: string[] };
      return obj.features ?? (raw as string[]);
    }
  } catch {
    return null;
  }
  return null;
}

// Fetched per-hostname and cached for 5 minutes. Hasura returns multiple rows
// for the wildcard match; we filter to the exact hostname client-side.
export async function fetchBrandingForHost(
  host: string | null | undefined
): Promise<WhitelabelBrandingSnapshot> {
  if (!host) return DEFAULT_BRANDING_SNAPSHOT;

  const hostname = host.split(':')[0].toLowerCase();

  const isLocalHostname =
    hostname === 'localhost' || hostname.endsWith('.local') || hostname === '127.0.0.1';

  // Skip the lookup for localhost/dev hostnames — they'll never match in prod.
  // In development we DO allow it, so a record saved with domain "localhost"
  // can be previewed locally (server-side fetch, so no CORS concerns).
  if (isLocalHostname && process.env.NODE_ENV !== 'development') {
    return DEFAULT_BRANDING_SNAPSHOT;
  }

  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: QUERY,
        variables: { domain: `%${hostname}%` },
      }),
      next: { revalidate: 300 },
    });

    if (!res.ok) return DEFAULT_BRANDING_SNAPSHOT;
    const json = await res.json();
    const rows: any[] = json?.data?.vocallabs_wl_resources ?? [];
    if (rows.length === 0) return DEFAULT_BRANDING_SNAPSHOT;

    // A row's `domain` may be a comma-list of hostnames. Pick the exact match.
    const match = rows.find((row) => {
      if (!row.domain) return false;
      const domains: string[] = row.domain
        .split(',')
        .map((d: string) => d.trim().toLowerCase());
      return domains.includes(hostname);
    });

    if (!match) return DEFAULT_BRANDING_SNAPSHOT;

    return {
      companyName: match.name || DEFAULT_BRANDING_SNAPSHOT.companyName,
      logoSquare: match.square_logo || null,
      logoSquareDark: match.square_logo_dark || null,
      logoRect: match.rect_logo || null,
      logoRectDark: match.rect_logo_dark || null,
      favicon: match.square_logo || null,
      featureAccess: parseFeatureAccess(match.feature_access),
      homeConfig: match.home_config ?? null,
      isWhiteLabeled: true,
    };
  } catch {
    return DEFAULT_BRANDING_SNAPSHOT;
  }
}
