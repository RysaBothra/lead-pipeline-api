/**
 * Gets the latest auth token from localStorage
 * This is useful for cases where we need to ensure we're using the most up-to-date token
 * rather than one that might be stale in a component's state
 */
export function getLatestAuthToken(): string | null {
  try {
    const authData = localStorage.getItem('auth');
    if (authData) {
      const auth = JSON.parse(authData);
      return auth.authToken || null;
    }
  } catch (error) {
    console.error('Error getting auth token from localStorage:', error);
  }
  return null;
}

/**
 * Gets the previous auth token from localStorage
 */
function getPreviousAuthToken(): string | null {
  try {
    const prevAuthData = localStorage.getItem('previous_auth');
    if (prevAuthData) {
      const prevAuth = JSON.parse(prevAuthData);
      return prevAuth.authToken || null;
    }
  } catch (error) {
    console.error('Error getting previous auth token from localStorage:', error);
  }
  return null;
}

// Flag to track if we've already refreshed the previous auth token
let previousAuthRefreshed = false;

/**
 * Refreshes the previous auth token and updates localStorage
 */
export async function refreshPreviousAuthToken(): Promise<string | null> {
  // Skip if we've already refreshed the previous auth token
  if (previousAuthRefreshed) {
    return null;
  }
  
  try {
    const prevAuthData = localStorage.getItem('previous_auth');
    if (!prevAuthData) return null;
    
    const prevAuth = JSON.parse(prevAuthData);
    if (!prevAuth.user?.id || !prevAuth.refreshToken) return null;
    
    // Import here to avoid circular dependencies
    const { authApi } = await import('../services/auth/api/authApi');
    const { calculateTokenExpiry } = await import('../services/auth/utils/tokenUtils');
    
    // Call the API to refresh the token
    const result = await authApi.refreshToken(prevAuth.user.id, prevAuth.refreshToken);
    
    if (result && result.auth_token) {
      const newTokenExpiry = calculateTokenExpiry(result.auth_token);
      
      // Create updated auth object with the same format as auth
      const updatedPrevAuth = {
        ...prevAuth,
        authToken: result.auth_token,
        refreshToken: result.refresh_token || prevAuth.refreshToken,
        tokenExpiry: newTokenExpiry,
        silentUpdate: true,
        id: prevAuth.id || prevAuth.user?.id // Ensure id field is present
      };
      
      // Update localStorage
      localStorage.setItem('previous_auth', JSON.stringify(updatedPrevAuth));
      
      // Set flag to indicate we've refreshed the previous auth token
      previousAuthRefreshed = true;
      
      return result.auth_token;
    }
    
    return null;
  } catch (error) {
    console.error('Error refreshing previous auth token:', error);
    return null;
  }
}

/**
 * Checks if a token is expired or about to expire
 * @param tokenExpiry Expiry timestamp in milliseconds
 * @param bufferMs Buffer time in milliseconds (default: 60 seconds)
 */
function isTokenExpired(tokenExpiry: number | null, bufferMs = 60000): boolean {
  if (!tokenExpiry) return true;
  return Date.now() + bufferMs >= tokenExpiry;
}