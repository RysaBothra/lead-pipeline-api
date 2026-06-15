import React, {
  createContext,
  useCallback,
  useMemo,
  useState,
  useEffect,
  useRef,
} from "react";
import { User } from "../../../types/auth";
import { AuthContextInterface } from "../types/authTypes";
import { useAuthState } from "../hooks/useAuthState";
import { useUserData } from "../hooks/useUserData";
import { authApi } from "../api/authApi";
import { calculateTokenExpiry } from "../utils/tokenUtils";
import { refreshPreviousAuthToken } from "../../../utils/auth";
import { buttonAnalytics } from "../../analytics/analytics";
import { fcmService } from "../../fcm/fcmService";

const PREVENT_RERENDERS = true; // Set to true to prevent UI re-rendering on token refresh
const REFRESH_DEBOUNCE_MS = 5 * 60 * 1000; // 5 minute debounce to prevent refresh spam while allowing legitimate refreshes

export const AuthContext = createContext<AuthContextInterface | undefined>(
  undefined
);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { auth, setAuth } = useAuthState();
  const { updateUserData } = useUserData(auth, setAuth);
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const silentUpdateRef = useRef(false);
  const refreshInProgressRef = useRef(false);
  const lastRefreshTimeRef = useRef<number | null>(null);

  const login = useCallback(
    (token: string, user: User, refreshToken?: string) => {
      const tokenExpiry = calculateTokenExpiry(token);

      const authData = {
        isAuthenticated: true,
        user: {
          ...user,
          username: user.username || undefined,
        },
        authToken: token,
        refreshToken: refreshToken || null,
        tokenExpiry: tokenExpiry,
        id: user.id, // Ensure id field is present
      };

      try {
        localStorage.setItem("auth", JSON.stringify(authData));
      } catch (error) {
        // Silent error handling
      }

      setAuth(authData);

      // Set Mixpanel distinct_id to client_id immediately after login
      try {
        buttonAnalytics.identifyUser(user.id);
        console.log(
          "🔍 Mixpanel: User identified on login with client_id:",
          user.id
        );
      } catch (error) {
        console.error("Error identifying user in Mixpanel:", error);
      }
    },
    [setAuth]
  );

  const logout = useCallback(async () => {
    setLoggingOut(true);
    // Disconnect notification service before clearing auth data
    // (dispatched synchronously so NotificationContext reads the token from localStorage before it's removed)
    window.dispatchEvent(new Event('notification:disconnect'));

    // Reset Mixpanel session before clearing auth data
    try {
      buttonAnalytics.resetSession();
      console.log("🔍 Mixpanel: Session reset on logout");
    } catch (error) {
      console.error("Error resetting Mixpanel session:", error);
    }

    // Clear FCM token from backend and local cache
    if (auth.user?.id && auth.authToken) {
      try {
        await fcmService.clearToken(auth.user.id, auth.authToken);
      } catch (error) {
        console.error("Error clearing FCM token on logout:", error);
      }
    }

    if (auth.authToken) {
      try {
        await authApi.logoutWithToken(auth.authToken);
      } catch (err) {
        console.error("Error calling logout mutation with token on logout:", err);
      }
    }

    if (auth.refreshToken) {
      try {
        setRefreshingToken(true);

        // Call the logout API through our service
        await authApi.logout(auth.refreshToken);
      } catch (err) {
        // Silent error handling
      }
    }

    // Also invalidate previous_auth if it exists
    try {
      const prevAuthData = localStorage.getItem("previous_auth");
      if (prevAuthData) {
        const prevAuth = JSON.parse(prevAuthData);
        if (prevAuth.authToken) {
          authApi.logoutWithToken(prevAuth.authToken).catch((err) => {
            console.error("Error invalidating previous auth token on logout:", err);
          });
        }
        if (prevAuth.refreshToken) {
          authApi.logout(prevAuth.refreshToken).catch((err) => {
            console.error(
              "Error invalidating previous refresh token on logout:",
              err
            );
          });
        }
      }
    } catch (err) {
      console.error("Error handling previous_auth invalidation on logout:", err);
    }

    // Clear auth state
    const emptyAuth = {
      isAuthenticated: false,
      user: null,
      authToken: null,
      refreshToken: null,
      tokenExpiry: null,
    };

    setAuth(emptyAuth);

    try {
      localStorage.removeItem("auth");
      // Also clear previous_auth when logging out
      localStorage.removeItem("previous_auth");
      // Clear all sessionStorage to ensure clean state for next login
      // This includes Chatwoot onboarding flags and any other session-specific data
      sessionStorage.clear();
    } catch (err) {
      // Silent error handling
    }

    setRefreshingToken(false);
    setLoggingOut(false);
  }, [auth.refreshToken, setAuth]);

  const triggerRefreshToken = useCallback(async (): Promise<string | null> => {
    // Prevent concurrent refresh attempts or refreshing too frequently
    const now = Date.now();
    const timeSinceLastRefresh = lastRefreshTimeRef.current
      ? now - lastRefreshTimeRef.current
      : Infinity;

    if (
      refreshInProgressRef.current ||
      !auth.user?.id ||
      !auth.refreshToken ||
      timeSinceLastRefresh < REFRESH_DEBOUNCE_MS
    ) {
      return null;
    }

    try {
      refreshInProgressRef.current = true;
      setRefreshingToken(true);
      silentUpdateRef.current = true;
      lastRefreshTimeRef.current = now;

      // Get the latest refresh token from localStorage
      let refreshToken = auth.refreshToken;
      try {
        const latestAuthData = localStorage.getItem("auth");
        if (latestAuthData) {
          const latestAuth = JSON.parse(latestAuthData);
          if (latestAuth.refreshToken) {
            refreshToken = latestAuth.refreshToken;
          }
        }
      } catch (error) {
        // Silent error handling
      }

      // Call the API to refresh the token
      const result = await authApi.refreshToken(auth.user.id, refreshToken);

      if (result && result.auth_token) {
        const newTokenExpiry = calculateTokenExpiry(result.auth_token);

        // Create updated auth object
        const updatedAuth = {
          ...auth,
          authToken: result.auth_token,
          refreshToken: result.refresh_token || auth.refreshToken,
          tokenExpiry: newTokenExpiry,
          silentUpdate: true,
          id: auth.user.id, // Ensure id field is present
        };

        // Update localStorage first
        try {
          localStorage.setItem("auth", JSON.stringify(updatedAuth));
        } catch (storageError) {
          // Silent error handling
        }

        // Dispatch event to notify other parts of the app
        const event = new CustomEvent("auth:tokenRefreshed", {
          detail: {
            token: result.auth_token,
            refreshToken: result.refresh_token || auth.refreshToken,
            tokenExpiry: newTokenExpiry,
            silentUpdate: true,
            id: auth.user.id, // Ensure id field is present
          },
        });
        window.dispatchEvent(event);

        // Update auth state - conditionally to prevent unnecessary re-renders
        if (!PREVENT_RERENDERS) {
          setAuth(updatedAuth);
        }

        // Update the last refresh time
        lastRefreshTimeRef.current = Date.now();

        // Also refresh the previous_auth token if it exists
        // This is the only place we refresh the previous_auth token
        refreshPreviousAuthToken().catch((err) => {
          console.error("Error refreshing previous auth token:", err);
        });

        return result.auth_token;
      }

      return null;
    } catch (error) {
      return null;
    } finally {
      refreshInProgressRef.current = false;
      setRefreshingToken(false);
      // Reset silentUpdate flag after a short delay
      setTimeout(() => {
        silentUpdateRef.current = false;
      }, 100);
    }
  }, [auth, setAuth]);

  // Listen for token refresh events from other parts of the app
  useEffect(() => {
    const handleTokenRefreshed = (event: CustomEvent) => {
      if (event.detail && event.detail.token) {
        silentUpdateRef.current = true;

        // Only update state if we're not preventing re-renders
        if (!PREVENT_RERENDERS) {
          // Note: setAuth from useAuthState doesn't currently support functional updates
          // This is a pre-existing issue. We'll use the latest known state from localStorage
          // to try and mitigate staleness, though trigger logic is better.
          try {
            const latestAuthData = localStorage.getItem("auth");
            const baseAuth = latestAuthData ? JSON.parse(latestAuthData) : auth;

            setAuth({
              ...baseAuth,
              authToken: event.detail.token,
              refreshToken: event.detail.refreshToken || baseAuth.refreshToken,
              tokenExpiry:
                event.detail.tokenExpiry ||
                calculateTokenExpiry(event.detail.token),
              silentUpdate: true,
              id: event.detail.id || baseAuth.user?.id,
            });
          } catch (e) {
            // Fallback to currently known closure auth
            setAuth({
              ...auth,
              authToken: event.detail.token,
              refreshToken: event.detail.refreshToken || auth.refreshToken,
              tokenExpiry:
                event.detail.tokenExpiry ||
                calculateTokenExpiry(event.detail.token),
              silentUpdate: true,
              id: event.detail.id || auth.user?.id,
            });
          }
        }

        // Reset silentUpdate after a short delay
        setTimeout(() => {
          silentUpdateRef.current = false;
        }, 100);
      }
    };

    window.addEventListener(
      "auth:tokenRefreshed",
      handleTokenRefreshed as EventListener
    );
    return () => {
      window.removeEventListener(
        "auth:tokenRefreshed",
        handleTokenRefreshed as EventListener
      );
    };
  }, [setAuth]);

  // Listen for storage changes (multi-tab support)
  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key === "auth") {
        try {
          const oldAuth = event.oldValue ? JSON.parse(event.oldValue) : null;
          const newAuth = event.newValue ? JSON.parse(event.newValue) : null;

          const oldToken = oldAuth?.authToken;
          const newToken = newAuth?.authToken;

          // If the token changed and we have an old token, call the logout mutation
          // Only if this is an explicit logout (new state is not authenticated)
          if (oldToken && oldToken !== newToken) {
            const isLogout = !newAuth || !newAuth.isAuthenticated;

            if (isLogout) {
              authApi.logoutWithToken(oldToken).catch((err) => {
                console.error(
                  "Error calling logout mutation on cross-tab logout:",
                  err
                );
              });
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Listen for auth:expired events (dispatched from fetch interceptors when
  // a 401 cannot be recovered via refresh, or from the visibilitychange handler
  // below when the laptop wakes up to a token that is already past its expiry).
  useEffect(() => {
    const handleExpired = () => {
      if (auth.isAuthenticated) {
        logout();
      }
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [auth.isAuthenticated, logout]);

  // When the tab becomes visible (e.g. user opens their laptop the next day),
  // check the persisted tokenExpiry against the wall clock and kick to login
  // if it's past — this catches the case before any query fires.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return;
      try {
        const authData = localStorage.getItem("auth");
        if (!authData) return;
        const parsed = JSON.parse(authData);
        if (!parsed?.isAuthenticated || !parsed?.tokenExpiry) return;
        if (parsed.tokenExpiry < Date.now()) {
          window.dispatchEvent(new Event("auth:expired"));
        }
      } catch {
        // Ignore parse errors
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  // Check token expiry on mount and refresh if needed
  useEffect(() => {
    const checkAndRefreshIfNeeded = () => {
      if (!auth.isAuthenticated || !auth.tokenExpiry) return;

      const now = Date.now();
      const timeUntilExpiry = auth.tokenExpiry - now;
      const timeSinceLastRefresh = lastRefreshTimeRef.current
        ? now - lastRefreshTimeRef.current
        : Infinity;

      // If token expires in less than 3 minutes and we haven't refreshed recently, refresh immediately
      if (
        timeUntilExpiry < 3 * 60 * 1000 &&
        timeUntilExpiry > 0 &&
        timeSinceLastRefresh > REFRESH_DEBOUNCE_MS
      ) {
        triggerRefreshToken();
      }
    };

    // Check on mount
    checkAndRefreshIfNeeded();

    // Also set up an interval to periodically check token expiry
    const intervalId = setInterval(() => {
      checkAndRefreshIfNeeded();
    }, 3600000); // Check every 1 hour

    return () => clearInterval(intervalId);
  }, []); // Empty dependency array to prevent re-running this effect

  const contextValue = useMemo(
    () => ({
      ...auth,
      login,
      logout,
      updateUserData,
      triggerRefreshToken,
      refreshingToken,
      loggingOut,
      silentUpdate: silentUpdateRef.current,
      // Add a stable reference to prevent context value changes
      _stableRef: {},
    }),
    [
      // Only include essential dependencies that should trigger context updates
      auth.isAuthenticated,
      auth.user,
      auth.authToken,
      // Exclude tokenExpiry and refreshToken to prevent re-renders on token refresh
      login,
      logout,
      updateUserData,
      loggingOut,
    ]
  );

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
      {loggingOut && <LogoutOverlay />}
    </AuthContext.Provider>
  );
}

function LogoutOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Signing out"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/80 dark:bg-black/70 backdrop-blur-sm animate-in fade-in"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
        <p className="text-gray-700 dark:text-gray-200 text-sm font-medium">
          Signing out...
        </p>
      </div>
    </div>
  );
}
