import { calculateTokenExpiry } from './tokenUtils';

const CAMPAIGN_API = process.env.NEXT_PUBLIC_CAMPAIGN_API_URL as string;
const SWITCH_TO_CLIENT_URL = `${CAMPAIGN_API}/rbac_switch_to_client`;

export interface SwitchResult {
  success: boolean;
  /** Set when success is false. */
  error?: string;
}

/**
 * Switches the active session DOWN into a mapped client (admin -> child).
 *
 * Subspace's `getSignedAuth_v3` only mints upward (member -> admin) and returns
 * "No Admin account associated" for the downward direction. So the downward
 * token is minted by our backend (`vocallabsBackend` `/rbac_switch_to_client`),
 * which authorizes the caller via the existing `rbac_user_mapping` row — no
 * reverse row, no schema change.
 *
 * The upward child -> admin switch (SwitchAccountModal) is untouched and still
 * uses Subspace directly. The current admin session is preserved as
 * `previous_auth` so the existing "switch back" path keeps working.
 */
export async function switchToClientAccount(targetClientId: string): Promise<SwitchResult> {
  if (!targetClientId) {
    return { success: false, error: 'Missing target account id' };
  }

  // The requester is the currently active (admin) account. Read it fresh from
  // localStorage rather than React state, since PREVENT_RERENDERS=true means the
  // in-memory token can be stale after a silent refresh.
  let adminToken: string | null = null;
  let adminId: string | null = null;
  let adminPhone: string | undefined;

  try {
    const currentAuthData = localStorage.getItem('auth');
    if (currentAuthData) {
      const currentAuth = JSON.parse(currentAuthData);
      adminToken = currentAuth.authToken || null;
      adminId = currentAuth.user?.id || currentAuth.id || null;
      adminPhone = currentAuth.user?.phone;
    }
  } catch (err) {
    console.error('switchToClientAccount: failed to read current auth', err);
  }

  if (!adminToken || !adminId) {
    return { success: false, error: 'Authentication required' };
  }
  if (targetClientId === adminId) {
    return { success: false, error: 'Already on this account' };
  }

  let data: any = {};
  try {
    const resp = await fetch(SWITCH_TO_CLIENT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ target_client_id: targetClientId }),
    });
    data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return { success: false, error: data?.error || `Switch failed (${resp.status})` };
    }
  } catch (err: any) {
    console.error('switchToClientAccount: request failed', err);
    return { success: false, error: err?.message || 'Failed to switch account' };
  }

  if (!data?.auth_token) {
    return { success: false, error: 'Backend did not return a token' };
  }

  const newAuth = {
    isAuthenticated: true,
    authToken: data.auth_token,
    // Minted tokens are not refreshable via Subspace; flag so the session layer
    // can re-mint (using previous_auth) rather than attempt a Subspace refresh.
    refreshToken: '',
    minted: true,
    id: data.id || targetClientId,
    tokenExpiry: calculateTokenExpiry(data.auth_token),
    user: {
      id: data.id || targetClientId,
      phone: adminPhone,
    },
  };

  // Preserve the original (admin) account so the user can switch back. Only set
  // it if not already present, so the root account stays the switch-back target.
  try {
    if (!localStorage.getItem('previous_auth')) {
      const currentAuth = localStorage.getItem('auth');
      if (currentAuth) {
        localStorage.setItem('previous_auth', currentAuth);
      }
    }
  } catch (err) {
    console.error('switchToClientAccount: failed to store previous_auth', err);
  }

  localStorage.setItem('auth', JSON.stringify(newAuth));
  window.location.reload();
  return { success: true };
}
