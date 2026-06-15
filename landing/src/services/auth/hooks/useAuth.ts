import { useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { trackEvent, setUserProperties, identifyUser } from '../../../utils/analytics';

export const useAuth = () => {
  const context = useContext(AuthContext);
  const isLoggingOutRef = useRef(false);
  const prevUserRef = useRef<string | null>(null);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  // Set up analytics when user data changes
  useEffect(() => {
    // Only update analytics if the user ID has changed
    const currentUserId = context.user?.id;
    if (currentUserId && currentUserId !== prevUserRef.current) {
      // Update the ref to prevent future unnecessary updates
      prevUserRef.current = currentUserId;
      
      // Call analytics functions directly instead of using the hook
      identifyUser(currentUserId);
      setUserProperties({
        phone: context.user?.phone,
        fullname: context.user?.fullname || 'Anonymous',
        email: context.user?.email || undefined
      });
    }
  }, [context.user?.id]);

  // Create a wrapped logout function that prevents multiple calls
  const enhancedLogout = async () => {
    // Prevent multiple logout calls
    if (isLoggingOutRef.current) {
      return;
    }
    
    isLoggingOutRef.current = true;
    
    try {
      await context.logout();
    } finally {
      // Reset the flag after a short delay
      setTimeout(() => {
        isLoggingOutRef.current = false;
      }, 100);
    }
  };

  return {
    ...context,
    logout: enhancedLogout
  };
};