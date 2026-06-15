import { useState, useCallback } from 'react';
import { AuthState } from '../../../types/auth';

// Token expiry time in milliseconds (default: 15 minutes)
const TOKEN_EXPIRY_TIME = 15 * 60 * 1000;

export function useAuthState() {
  const [auth, setAuth] = useState<AuthState>(() => {
    // SSR guard: localStorage is unavailable during server-render of client
    // components. Return logged-out state on the server; the client will
    // re-initialize from localStorage after mount via the Providers gate.
    if (typeof window === 'undefined') {
      return {
        isAuthenticated: false,
        user: null,
        authToken: null,
        refreshToken: null,
        tokenExpiry: null,
      };
    }
    try {
      const savedAuth = localStorage.getItem('auth');

      if (savedAuth) {
        try {
          const parsedAuth = JSON.parse(savedAuth);

          if (typeof parsedAuth === 'object' && parsedAuth !== null) {
            // Check if token is expired
            if (parsedAuth.tokenExpiry && parsedAuth.tokenExpiry < Date.now()) {
              localStorage.removeItem('auth');
              return {
                isAuthenticated: false,
                user: null,
                authToken: null,
                refreshToken: null,
                tokenExpiry: null,
              };
            }

            return parsedAuth;
          }
        } catch (parseError) {
          // Silent error handling
        }
      }
    } catch (error) {
      // Silent error handling
    }

    return {
      isAuthenticated: false,
      user: null,
      authToken: null,
      refreshToken: null,
      tokenExpiry: null,
    };
  });

  const updateAuth = useCallback((newAuth: AuthState) => {
    setAuth(newAuth);
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('auth', JSON.stringify(newAuth));
    } catch (error) {
      // Silent error handling
    }
  }, []);

  return { 
    auth, 
    setAuth: updateAuth,
    TOKEN_EXPIRY_TIME
  };
}