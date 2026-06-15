import React, { useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';

// Refresh token 1 hour before expiry (since token lasts 12 hours)
const REFRESH_BUFFER_MS = 1 * 60 * 60 * 1000;
// Set debounce to 23 hours to refresh once per day
const REFRESH_DEBOUNCE_MS = 23 * 60 * 60 * 1000;

export function TokenRefreshProvider({ children }: { children: React.ReactNode }) {
  const { authToken, tokenExpiry, triggerRefreshToken: refreshTokenFn, user, refreshingToken } = useAuth();
  const timeoutRef = useRef<number | null>(null);
  const refreshInProgressRef = useRef(false);
  const lastRefreshTimeRef = useRef<number | null>(null);
  const tokenExpiryRef = useRef<number | null>(null);

  // Update the ref when tokenExpiry changes
  useEffect(() => {
    if (tokenExpiry) {
      tokenExpiryRef.current = tokenExpiry;
    }
  }, [tokenExpiry]);

  // Set up a periodic check to ensure token refresh is scheduled
  useEffect(() => {
    if (!authToken || !user?.id) return;

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const currentTokenExpiry = tokenExpiryRef.current;

      if (!currentTokenExpiry) return;

      const timeUntilExpiry = currentTokenExpiry - now;

      // If token expires in less than 2 hours and no refresh is in progress or scheduled
      if (timeUntilExpiry < (REFRESH_BUFFER_MS + 3600000) && !refreshInProgressRef.current && !timeoutRef.current) {
        // Schedule a new refresh
        scheduleTokenRefresh(now, currentTokenExpiry);
      }

      // We no longer refresh previous_auth token here
    }, 3600000); // Check every 1 hour

    return () => clearInterval(checkInterval);
  }, [authToken, user?.id]);

  // Function to schedule token refresh
  const scheduleTokenRefresh = (currentTime: number, expiryTime: number) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const timeUntilExpiry = expiryTime - currentTime;
    const timeUntilRefresh = Math.max(0, timeUntilExpiry - REFRESH_BUFFER_MS);

    // If token is about to expire within 1 hour, refresh immediately
    if (timeUntilRefresh < 3600000) { // Less than 1 hour until refresh needed
      const timeSinceLastRefresh = lastRefreshTimeRef.current
        ? currentTime - lastRefreshTimeRef.current
        : Infinity;

      // Only refresh if we haven't refreshed too recently
      if (timeSinceLastRefresh > REFRESH_DEBOUNCE_MS || timeUntilExpiry < 3600000) {
        performTokenRefresh(currentTime);
      }
      return;
    }

    // Schedule token refresh
    timeoutRef.current = window.setTimeout(() => {
      performTokenRefresh(Date.now());
    }, timeUntilRefresh);
  };

  // Function to perform token refresh
  const performTokenRefresh = (currentTime: number) => {
    const timeSinceLastRefresh = lastRefreshTimeRef.current
      ? currentTime - lastRefreshTimeRef.current
      : Infinity;

    // Check if we should proceed with the refresh
    if (timeSinceLastRefresh > REFRESH_DEBOUNCE_MS ||
      (tokenExpiryRef.current && (tokenExpiryRef.current - currentTime) < 3600000)) {

      if (refreshInProgressRef.current) {
        return;
      }

      refreshInProgressRef.current = true;
      lastRefreshTimeRef.current = currentTime;

      refreshTokenFn()
        .then((newToken) => {
          // If we got a new token, schedule the next refresh
          if (newToken && tokenExpiryRef.current) {
            // Schedule next refresh after a short delay to allow state updates
            setTimeout(() => {
              if (tokenExpiryRef.current) {
                scheduleTokenRefresh(Date.now(), tokenExpiryRef.current);
              }
            }, 1000);
          }
        })
        .catch(() => {
          // Silent error handling
        })
        .finally(() => {
          refreshInProgressRef.current = false;
        });
    }
  };

  useEffect(() => {
    // Skip if missing required data or already refreshing
    const currentTime = Date.now();
    if (!authToken || !tokenExpiry || !user?.id || !refreshTokenFn || refreshingToken ||
      refreshInProgressRef.current) {
      return;
    }

    // Use the extracted function to schedule the token refresh
    scheduleTokenRefresh(currentTime, tokenExpiry);

    // Clean up on unmount
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [
    // Keep essential dependencies but use refs for values that change frequently
    authToken,
    tokenExpiry,
    user?.id,
    refreshTokenFn
  ]);

  return <>{children}</>;
}