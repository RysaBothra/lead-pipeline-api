interface ClarityEvent {
  name: string;
  properties?: Record<string, any>;
}

declare global {
  interface Window {
    clarity?: (method: string, ...args: any[]) => void;
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
  }
}

const isDevelopment = () => {
  return window.location.hostname.includes('localhost') || 
         window.location.hostname.includes('webcontainer');
};

export const trackEvent = (event: ClarityEvent) => {
  if (isDevelopment()) return;

  // Track in Clarity
  if (typeof window.clarity === 'function') {
    window.clarity('event', event.name, event.properties);
  }
  
  // Track in Google Analytics
  if (typeof window.gtag === 'function') {
    window.gtag('event', event.name, event.properties);
  }
};

export const setUserProperties = (properties: Record<string, any>) => {
  if (isDevelopment()) return;

  // Set in Clarity
  if (typeof window.clarity === 'function') {
    window.clarity('set', properties);
  }
  
  // Set in Google Analytics
  if (typeof window.gtag === 'function') {
    window.gtag('set', 'user_properties', properties);
  }
};

export const identifyUser = (userId: string) => {
  if (isDevelopment()) return;

  // Identify in Clarity
  if (typeof window.clarity === 'function') {
    window.clarity('identify', userId);
  }
  
  // Identify in Google Analytics
  if (typeof window.gtag === 'function') {
    window.gtag('set', 'user_id', userId);
  }
};