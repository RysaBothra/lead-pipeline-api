import {
  getMessaging,
  getToken,
  onMessage,
  isSupported,
  deleteToken,
  Messaging
} from 'firebase/messaging';
import { app } from './firebaseConfig';
import { createGraphQLClient } from '../graphql/client';

interface FCMTokenData {
  platform: string;
  token: string;
  type: string;
  client_id: string;
  device_id: string;
}

const INSERT_FCM_TOKEN = `
  mutation InsertCallFcmToken($platform: String, $token: String, $type: String, $client_id: uuid, $device_id: String) {
    insert_vocallabs_call_fcm_token(
      objects: {
        platform: $platform, 
        token: $token, 
        type: $type, 
        client_id: $client_id,
        device_id: $device_id
      }, 
      on_conflict: {
        constraint: call_fcm_token_device_id_platform_client_id_token_key, 
        update_columns: [token, updated_at]
      }
    ) {
      affected_rows
      returning {
        id
        token
      }
    }
  }
`;

const DELETE_FCM_TOKEN = `
  mutation DeleteCallFcmToken($client_id: uuid, $device_id: String) {
    delete_vocallabs_call_fcm_token(
      where: {
        client_id: { _eq: $client_id },
        device_id: { _eq: $device_id }
      }
    ) {
      affected_rows
    }
  }
`;

class FCMService {
  private messaging: Messaging | null = null;
  private vapidKey: string = 'BFmpYHjacDmLhrVK0WiEMH4qK61lrm7sIS7MIB5qVP4sxOGLN1XOzUr0fbF61Y8K3cf1tuiQkyde1R-7PF-QSJ0';
  private deviceIdKey = 'fcm_device_id';

  getDeviceId(): string {
    if (typeof window === 'undefined') return 'server';

    let deviceId = localStorage.getItem(this.deviceIdKey);
    if (!deviceId) {
      deviceId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(this.deviceIdKey, deviceId);
      console.log('🆕 Generated new device ID:', deviceId);
    }
    return deviceId;
  }

  private isEnvironmentSupported(): boolean {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname;
    return !hostname.includes('webcontainer') && !hostname.includes('local-credentialless');
  }

  async initialize(): Promise<Messaging | null> {
    try {
      if (this.messaging) return this.messaging;

      if (!this.isEnvironmentSupported()) {
        console.warn('⚠️ FCM not supported in this environment');
        return null;
      }

      const supported = await isSupported();
      if (!supported) {
        console.warn('⚠️ FCM is not supported in this browser');
        return null;
      }

      this.messaging = getMessaging(app);
      console.log('✅ FCM Service Initialized');
      return this.messaging;
    } catch (error) {
      console.error('❌ Failed to initialize FCM service:', error);
      return null;
    }
  }

  async requestNotificationPermission(): Promise<NotificationPermission> {
    try {
      console.log('🔔 Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('📊 Permission result:', permission);
      return permission;
    } catch (error) {
      console.error('❌ Error requesting notification permission:', error);
      return 'denied';
    }
  }

  async getFCMToken(): Promise<string | null> {
    try {
      const messaging = await this.initialize();
      if (!messaging) {
        console.warn('⚠️ Cannot get token: Messaging not initialized');
        return null;
      }

      if (!('serviceWorker' in navigator)) {
        console.warn('⚠️ Service Workers not supported');
        return null;
      }

      try {
        console.log('📍 Checking Service Worker registration...');
        await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        console.log('✅ Service Worker ready');
      } catch (swError) {
        console.error('❌ Service worker registration failed:', swError);
        return null;
      }

      console.log('🔑 Fetching FCM token from Firebase...');
      const token = await getToken(messaging, {
        vapidKey: this.vapidKey
      });

      if (!token) {
        console.warn('⚠️ Failed to get FCM token: Received empty/null token');
      } else {
        console.log('🎫 Received FCM token (length:', token.length, ')');
      }

      return token || null;
    } catch (error) {
      console.error('❌ Error getting FCM token:', error);
      return null;
    }
  }

  async saveTokenToDatabase(token: string, clientId: string, authToken: string): Promise<boolean> {
    const deviceId = this.getDeviceId();
    const storageKey = `last_fcm_token_${clientId}`;

    console.group('🧬 FCM Token Sync Process');
    console.log('👤 Client ID:', clientId);
    console.log('📱 Device ID:', deviceId);
    console.log('🎫 Token:', token.substring(0, 10) + '...');

    try {
      // Check if we already synced this exact token for this user
      const lastSyncedToken = localStorage.getItem(storageKey);
      if (lastSyncedToken === token) {
        console.log('ℹ️ Skip: Token already matches local cache');
        console.groupEnd();
        return true;
      }

      console.log('🚀 Sending UPSERT mutation to backend...');
      const client = createGraphQLClient(authToken);
      const variables: FCMTokenData = {
        platform: 'app.vocallabs.ai',
        token,
        type: 'website',
        client_id: clientId,
        device_id: deviceId
      };

      console.log('📋 Mutation variables:', JSON.stringify(variables, null, 2));

      const result = await client.request(INSERT_FCM_TOKEN, variables as any) as any;
      console.log('✨ Backend response:', result);

      const affectedRows = result?.insert_vocallabs_call_fcm_token?.affected_rows;
      if (typeof affectedRows === 'number' && affectedRows > 0) {
        console.log('✅ Success: Token synced. Affected rows:', affectedRows);
        localStorage.setItem(storageKey, token);
        console.groupEnd();
        return true;
      }

      console.warn('⚠️ Warning: Mutation returned 0 affected rows. Possible constraint issue or no change needed.');
      console.groupEnd();
      return false;
    } catch (error: any) {
      console.error('❌ Critical Error in Token Sync:');
      if (error.response?.errors) {
        console.error('GraphQL Errors:', JSON.stringify(error.response.errors, null, 2));
      } else {
        console.error('Network/Internal Error:', error.message || error);
      }
      console.groupEnd();
      return false;
    }
  }

  setupForegroundListener(callback: (payload: any) => void): (() => void) | undefined {
    if (!this.messaging) {
      console.warn('⚠️ Messaging not initialized for listener');
      return undefined;
    }

    return onMessage(this.messaging, (payload) => {
      console.log('📱 Foreground message received:', payload);
      callback(payload);
    });
  }

  async clearToken(clientId: string, authToken: string): Promise<boolean> {
    const deviceId = this.getDeviceId();
    const storageKey = `last_fcm_token_${clientId}`;

    console.group('🧹 FCM Token Cleanup Process');
    console.log('👤 Client ID:', clientId);
    console.log('📱 Device ID:', deviceId);

    try {
      if (this.messaging) {
        console.log('🔥 Deleting token from Firebase...');
        await deleteToken(this.messaging);
        console.log('✅ Firebase token invalidated');
      }

      const client = createGraphQLClient(authToken);
      const variables = {
        client_id: clientId,
        device_id: deviceId
      };

      console.log('🚀 Sending DELETE mutation to backend...');
      const result = await client.request(DELETE_FCM_TOKEN, variables) as any;
      console.log('✨ Backend response:', result);

      // Clear the token cache for this specific client
      localStorage.removeItem(storageKey);

      // CRITICAL: Clear the device ID to force a new one on next login
      // This ensures a new user gets a fresh device ID and token
      localStorage.removeItem(this.deviceIdKey);
      console.log('🆔 Device ID cleared from localStorage');

      // Clear all FCM-related storage keys to ensure clean state
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('last_fcm_token_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log(`🧹 Cleared ${keysToRemove.length} FCM token cache entries`);

      console.log('✅ Success: Token cleared from local cache and backend');
      console.groupEnd();
      return true;
    } catch (error: any) {
      console.error('❌ Error clearing FCM token:', error);
      if (error.response?.errors) {
        console.error('GraphQL Errors:', JSON.stringify(error.response.errors, null, 2));
      }
      console.groupEnd();
      return false;
    }
  }

  /**
   * Main entry point to ensure user has a valid token and it's saved to backend.
   */
  async syncToken(clientId: string, authToken: string): Promise<string | null> {
    console.log('🔄 syncToken manual trigger for:', clientId);

    if (Notification.permission !== 'granted') {
      console.warn('🔕 Cannot sync: Notification permission is', Notification.permission);
      return null;
    }

    try {
      const token = await this.getFCMToken();
      if (!token) {
        console.warn('⚠️ Cannot sync: No FCM token returned from Firebase');
        return null;
      }

      const success = await this.saveTokenToDatabase(token, clientId, authToken);
      if (!success) {
        console.error('❌ Token sync to database failed');
      }
      return token;
    } catch (err) {
      console.error('❌ syncToken failed:', err);
      return null;
    }
  }
}

export const fcmService = new FCMService();