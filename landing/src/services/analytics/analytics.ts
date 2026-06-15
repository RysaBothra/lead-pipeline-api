import mixpanel from 'mixpanel-browser';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// Extend dayjs with plugins
dayjs.extend(utc);
dayjs.extend(timezone);

// Initialize Mixpanel with a placeholder token
// IMPORTANT: Replace 'YOUR_PROJECT_TOKEN' with your actual Mixpanel project token
// You can also set debug: true for development to see events in the console.
// SSR guard: mixpanel-browser touches document/window during init; on the server
// we just skip — the singleton below is constructed but mixpanel itself is a no-op
// until the next client-side import re-evaluates this module.
if (typeof window !== 'undefined') {
  mixpanel.init('0e94331c8a6f9afeb0f0f199e00b2f16', {
    debug: true,
    track_pageview: 'url-with-path',
    persistence: 'localStorage',
    ignore_dnt: true,
    api_host: 'https://api.mixpanel.com'
  });
}

class ButtonAnalytics {
  private mixpanel: typeof mixpanel;
  private sessionId: string;

  constructor(mixpanelInstance: typeof mixpanel) {
    this.mixpanel = mixpanelInstance;
    this.sessionId = this._generateSessionId();
    this._registerCommonProperties();
  }

  private _generateSessionId(): string {
    return uuidv4();
  }

  private _captureCommonProperties() {
    // Capture dynamic properties for each event
    let currentUserId: string | undefined;
    let previousAuthUserId: string | undefined;

    try {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const auth = JSON.parse(authData);
        currentUserId = auth.user?.id;
      }

      const previousAuthData = localStorage.getItem('previous_auth');
      if (previousAuthData) {
        const previousAuth = JSON.parse(previousAuthData);
        previousAuthUserId = previousAuth.user?.id;
      }
    } catch (error) {
      console.error('Error reading auth data from localStorage for Mixpanel:', error);
    }


    return {
      page_url: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
      // Format timestamp to Indian Standard Time (IST)
      timestamp: dayjs().tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss [IST]'),
      client_id: currentUserId,
      previous_auth_client_id: previousAuthUserId,

      user_agent: navigator.userAgent,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      session_id: this.sessionId,
    };
  }

  private _registerCommonProperties() {
    // Skip on the server — mixpanel.init was gated to client-side, so register
    // would queue against an uninitialized instance.
    if (typeof window === 'undefined') return;
    // Register properties that should be sent with every event
    this.mixpanel.register({
      session_id: this.sessionId,
      app_version: '1.0.0',
      platform: 'web',
      environment: process.env.NODE_ENV || 'development',
    });
  }

  /**
   * Identifies the user in Mixpanel.
   * @param userId A unique identifier for the user.
   * @param properties Optional properties to set for the user.
   */
  identifyUser(userId: string, properties?: Record<string, any>) {
    this.mixpanel.identify(userId);
    if (properties) {
      this.mixpanel.people.set(properties);
    }
    console.log(`🔍 Mixpanel: User identified - ${userId}`, properties);
  }

  /**
   * Tracks a button click event.
   * @param buttonType The type of button clicked (e.g., 'create', 'delete', 'save').
   * @param context Additional context for the event (e.g., item_id, form_name).
   */
  trackButtonClick(buttonType: string, context?: Record<string, any>) {
    const commonProps = this._captureCommonProperties();
    const eventData = {
      button_type: buttonType,
      event_category: 'user_interaction',
      interaction_type: 'click',
      ...context,
      ...commonProps,
    };

    // Always track in Mixpanel regardless of environment for testing
    this.mixpanel.track('Button Clicked', eventData);
    console.log(`📊 Mixpanel: Button Clicked - ${buttonType}`, eventData);
    
    // Also log to verify the event is being called
    console.log('🔍 Mixpanel Debug: Event sent to Mixpanel', {
      eventName: 'Button Clicked',
      buttonType,
      timestamp: new Date().toISOString(),
      mixpanelReady: !!this.mixpanel,
      eventData
    });
  }

  /**
   * Tracks the successful completion of a button action.
   * @param buttonType The type of button whose action succeeded.
   * @param context Additional context for the event.
   */
  trackButtonSuccess(buttonType: string, context?: Record<string, any>) {
    const commonProps = this._captureCommonProperties();
    const eventData = {
      button_type: buttonType,
      event_category: 'user_interaction',
      interaction_type: 'success',
      outcome: 'success',
      ...context,
      ...commonProps,
    };

    this.mixpanel.track('Button Action Success', eventData);
    console.log(`✅ Mixpanel: Button Action Success - ${buttonType}`, eventData);
  }

  /**
   * Tracks the failure of a button action.
   * @param buttonType The type of button whose action failed.
   * @param error The error object or message.
   * @param context Additional context for the event.
   */
  trackButtonError(buttonType: string, error: any, context?: Record<string, any>) {
    const commonProps = this._captureCommonProperties();
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    const eventData = {
      button_type: buttonType,
      event_category: 'user_interaction',
      interaction_type: 'error',
      outcome: 'error',
      error_message: errorMessage,
      error_stack: errorStack,
      ...context,
      ...commonProps,
    };

    this.mixpanel.track('Button Action Error', eventData);
    console.error(`❌ Mixpanel: Button Action Error - ${buttonType}`, eventData);
  }

  /**
   * Tracks page views and navigation events.
   * @param pageName The name or path of the page.
   * @param context Additional context for the page view.
   */
  trackPageView(pageName: string, context?: Record<string, any>) {
    const commonProps = this._captureCommonProperties();
    const eventData = {
      page_name: pageName,
      event_category: 'navigation',
      ...context,
      ...commonProps,
    };

    this.mixpanel.track('Page View', eventData);
    console.log(`🔗 Mixpanel: Page View - ${pageName}`, eventData);
  }

  /**
   * Tracks form submissions.
   * @param formName The name of the form submitted.
   * @param context Additional context for the form submission.
   */
  trackFormSubmission(formName: string, context?: Record<string, any>) {
    const commonProps = this._captureCommonProperties();
    const eventData = {
      form_name: formName,
      event_category: 'form_interaction',
      interaction_type: 'submit',
      ...context,
      ...commonProps,
    };

    this.mixpanel.track('Form Submitted', eventData);
    console.log(`📝 Mixpanel: Form Submitted - ${formName}`, eventData);
  }

  /**
   * Resets the current session ID. Useful for new user sessions or after logout.
   */
  resetSession() {
    this.sessionId = this._generateSessionId();
    this.mixpanel.reset(); // Clears all current properties and generates a new distinct_id
    this._registerCommonProperties(); // Re-register common properties with new session ID
    console.log('🔄 Mixpanel: Session reset. New session ID:', this.sessionId);
  }

  /**
   * Sets user properties.
   * @param properties Properties to set for the current user.
   */
  setUserProperties(properties: Record<string, any>) {
    this.mixpanel.register(properties);
    console.log('👤 Mixpanel: User properties set', properties);
  }

  /**
   * Tracks custom events beyond button interactions.
   * @param eventName The name of the custom event.
   * @param properties Event properties.
   */
  trackCustomEvent(eventName: string, properties?: Record<string, any>) {
    const commonProps = this._captureCommonProperties();
    const eventData = {
      event_category: 'custom',
      ...properties,
      ...commonProps,
    };

    this.mixpanel.track(eventName, eventData);
    console.log(`🎯 Mixpanel: Custom Event - ${eventName}`, eventData);
    
    // Additional debug logging
    console.log('🔍 Mixpanel Debug: Custom event details', {
      eventName,
      properties,
      finalEventData: eventData,
      mixpanelInstance: !!this.mixpanel
    });
  }
  
  /**
   * Test function to verify Mixpanel is working
   */
  testMixpanel() {
    console.log('🧪 Testing Mixpanel connection...');
    console.log('🔍 Mixpanel instance:', this.mixpanel);
    console.log('🔍 Session ID:', this.sessionId);
    
    // Send a test event
    this.mixpanel.track('Mixpanel Test Event', {
      test: true,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId
    });
    
    console.log('✅ Test event sent to Mixpanel');
    return true;
  }
}

export const buttonAnalytics = new ButtonAnalytics(mixpanel);

// Helper function to wrap button click handlers with analytics
export const withButtonAnalytics = (
  buttonType: string,
  handler: () => void | Promise<void>,
  context?: Record<string, any>
) => {
  return async () => {
    try {
      buttonAnalytics.trackButtonClick(buttonType, context);
      const result = await handler();
      buttonAnalytics.trackButtonSuccess(buttonType, context);
      return result;
    } catch (error) {
      buttonAnalytics.trackButtonError(buttonType, error, context);
      throw error;
    }
         window.location.hostname.includes('webcontainer') ||
         window.location.hostname.includes('local-credentialless');
  };
}

// Export mixpanel instance for advanced usage
  // Allow tracking in development for testing
  // if (isDevelopment()) return;
  // if (isDevelopment()) return;
  // if (isDevelopment()) return;