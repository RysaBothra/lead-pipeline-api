import { GraphQLClient } from 'graphql-request';
import { API_CONFIG } from './config';

const REFRESH_DEBOUNCE_MS = 5 * 60 * 1000;

const lastTokenRefreshTime = {
  value: 0,
  shouldRefresh(now: number) {
    return now - this.value > REFRESH_DEBOUNCE_MS;
  },
};

const getAuthTokenFromStorage = (fallback?: string | null) => {
  try {
    const authData = localStorage.getItem('auth');
    if (authData) {
      const auth = JSON.parse(authData);
      return auth.authToken || fallback;
    }
  } catch (error) {
    console.error('Error getting auth token from localStorage:', error);
  }
  return fallback;
};

// Hasura with JWT auth typically returns HTTP 200 with an `invalid-jwt`
// extensions code on the errors array — not a 401 — so we have to peek at
// the body to detect a genuinely expired/invalid token.
async function isAuthFailure(response: Response): Promise<boolean> {
  if (response.status === 401) return true;
  if (!response.ok && response.status !== 200) return false;
  try {
    const text = await response.clone().text();
    if (!text.includes('invalid-jwt')) return false;
    const json = JSON.parse(text);
    return (
      Array.isArray(json?.errors) &&
      json.errors.some((e: any) => e?.extensions?.code === 'invalid-jwt')
    );
  } catch {
    return false;
  }
}

// Shared fetch that injects the latest token, attempts a single refresh on 401,
// and dispatches `auth:expired` when the session can't be recovered so the
// AuthContext can log the user out and redirect to /login.
const createAuthFetch = (fallbackToken?: string | null) => {
  return async (url: RequestInfo | URL, options?: RequestInit) => {
    const currentToken = getAuthTokenFromStorage(fallbackToken);
    const headers = new Headers(options?.headers);
    headers.set('Cache-Control', 'no-store');
    if (currentToken) {
      headers.set('Authorization', `Bearer ${currentToken}`);
    }

    const response = await fetch(url, {
      ...options,
      headers: Object.fromEntries(headers.entries()),
    });

    if (!currentToken || !(await isAuthFailure(response))) {
      return response;
    }

    const now = Date.now();
    if (!lastTokenRefreshTime.shouldRefresh(now)) {
      return response;
    }

    let auth: any;
    try {
      const authData = localStorage.getItem('auth');
      auth = authData ? JSON.parse(authData) : null;
    } catch {
      auth = null;
    }

    if (!auth?.user?.id || !auth?.refreshToken) {
      window.dispatchEvent(new Event('auth:expired'));
      return response;
    }

    lastTokenRefreshTime.value = now;

    try {
      // Dynamic import avoids the static cycle with authApi (which calls
      // createGrowClient/createSubspaceClient from this file at module load).
      const { authApi } = await import('../auth/api/authApi');
      const result = await authApi.refreshToken(auth.user.id, auth.refreshToken);

      if (!result?.auth_token) {
        window.dispatchEvent(new Event('auth:expired'));
        return response;
      }


      const { calculateTokenExpiry } = await import('../auth/utils/tokenUtils');
      const updatedAuth = {
        ...auth,
        authToken: result.auth_token,
        refreshToken: result.refresh_token || auth.refreshToken,
        tokenExpiry: calculateTokenExpiry(result.auth_token),
        silentUpdate: true,
      };

      try {
        localStorage.setItem('auth', JSON.stringify(updatedAuth));
      } catch {
        // Silent error handling
      }

      const retryHeaders = new Headers(options?.headers);
      retryHeaders.set('Cache-Control', 'no-store');
      retryHeaders.set('Authorization', `Bearer ${result.auth_token}`);

      return fetch(url, {
        ...options,
        headers: Object.fromEntries(retryHeaders.entries()),
      });
    } catch {
      window.dispatchEvent(new Event('auth:expired'));
      return response;
    }
  };
};

const buildClient = (
  endpoint: string,
  authToken?: string | null,
  enableAutoRefresh = true,
) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  };

  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  return new GraphQLClient(endpoint, {
    headers,
    fetch: enableAutoRefresh ? createAuthFetch(authToken) : undefined,
  });
};

const createHasuraClient = (authToken?: string | null, enableAutoRefresh = true) =>
  buildClient(API_CONFIG.HASURA_ENDPOINT, authToken, enableAutoRefresh);

export const createGrowClient = (authToken?: string | null, enableAutoRefresh = true) =>
  buildClient(API_CONFIG.GROW_ENDPOINT, authToken, enableAutoRefresh);

export const createSubspaceClient = (authToken?: string | null, enableAutoRefresh = true) =>
  buildClient(API_CONFIG.SUBSPACE_ENDPOINT, authToken, enableAutoRefresh);

const publicGraphQLClient = new GraphQLClient(API_CONFIG.HASURA_ENDPOINT, {
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
});
