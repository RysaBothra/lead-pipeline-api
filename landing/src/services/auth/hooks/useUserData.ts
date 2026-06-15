import { useCallback, useEffect, useRef } from 'react';
import { AuthState } from '../types/authTypes';
import { authApi } from '../api/authApi';

export function useUserData(auth: AuthState, setAuth: (auth: AuthState) => void) {
  const dataFetchedRef = useRef(false);

  const updateUserData = useCallback(async () => {
    if (!auth.user?.id || !auth.authToken) return;

    try {
      const userData = await authApi.getUserData(auth.user.id, auth.authToken);
      if (userData) {
        const updatedAuth = {
          ...auth,
          user: {
            ...auth.user,
            fullname: userData.fullname || undefined,
            email: userData.email || undefined,
            dp: userData.dp || undefined,
            username: userData.username || undefined,
            email_verified: userData.email_verified || false,
            country: userData.country || undefined,
            currency: userData.currency || undefined
          },
        };

        try {
          // Update localStorage with new user data
          localStorage.setItem('auth', JSON.stringify(updatedAuth));
        } catch (storageError) {
          // Silent error handling
        }
        
        setAuth(updatedAuth);
      }
    } catch (error) {
      // Silent error handling
    }
  }, [auth, setAuth]);

  useEffect(() => {
    if (auth.isAuthenticated && auth.user?.id && !dataFetchedRef.current) {
      dataFetchedRef.current = true;
      updateUserData();
    }
    if (!auth.isAuthenticated) {
      dataFetchedRef.current = false;
    }
  }, [auth.isAuthenticated, auth.user?.id, updateUserData]);

  return { updateUserData };
}