// passkeyApi.ts - FIXED VERSION

import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { VOCALLABS_GRAPHQL_ENDPOINT } from '../../api/config';
import {
  GENERATE_AUTHENTICATION_OPTIONS,
  VERIFY_AUTHENTICATION,
  GENERATE_REGISTRATION_OPTIONS,
  VERIFY_REGISTRATION,
  DELETE_PASSKEY,
  LIST_PASSKEY_DEVICES,
  DELETE_PASSKEY_DEVICE,
  type PasskeyDevice
} from '../queries/passkeyQueries';

import { getDeviceId } from '../utils/deviceId';

// Passkey now runs on goFlash, exposed via Hasura ACTIONS on the VocalLabs
// GraphQL endpoint (consistent with OTP/refresh/email; synced to prod via
// metadata). This shim keeps the existing `.request(QUERY, vars)` call sites
// unchanged: each frontend query constant maps to its action mutation (or a
// table query for list), and the result is returned under the same key the
// call sites already read (e.g. `data.verifyAuthentication`, and the generate
// ops return the raw options object the browser ceremony expects).
type PkOp = { gql: string; key: string; unwrap: (d: any) => any };
const PASSKEY_OPS = new Map<string, PkOp>([
  [GENERATE_REGISTRATION_OPTIONS, {
    gql: `mutation($user_id:uuid!,$device_id:String,$device_data:jsonb,$device_name:String,$origin:String!){ generateRegistrationOptions(user_id:$user_id,device_id:$device_id,device_data:$device_data,device_name:$device_name,origin:$origin){ options } }`,
    key: 'generateRegistrationOptions', unwrap: (d) => d?.generateRegistrationOptions?.options,
  }],
  [GENERATE_AUTHENTICATION_OPTIONS, {
    gql: `mutation($phone:String!,$recaptcha_token:String,$device_id:String,$device_data:jsonb,$origin:String!){ generateAuthenticationOptions_v2(phone:$phone,recaptcha_token:$recaptcha_token,device_id:$device_id,device_data:$device_data,origin:$origin){ options } }`,
    key: 'generateAuthenticationOptions_v2', unwrap: (d) => d?.generateAuthenticationOptions_v2?.options,
  }],
  [VERIFY_REGISTRATION, {
    gql: `mutation($user_id:uuid!,$credential:jsonb!,$device_id:String,$device_data:jsonb,$device_name:String,$origin:String!){ verifyRegistration(user_id:$user_id,credential:$credential,device_id:$device_id,device_data:$device_data,device_name:$device_name,origin:$origin){ verified message } }`,
    key: 'verifyRegistration', unwrap: (d) => d?.verifyRegistration,
  }],
  [VERIFY_AUTHENTICATION, {
    gql: `mutation($phone:String,$credential:jsonb!,$recaptcha_token:String,$device_id:String,$device_data:jsonb,$lang:String,$version:Int,$origin:String!){ verifyAuthentication(phone:$phone,credential:$credential,recaptcha_token:$recaptcha_token,device_id:$device_id,device_data:$device_data,lang:$lang,version:$version,origin:$origin){ status auth_token refresh_token id deviceInfoSaved } }`,
    key: 'verifyAuthentication', unwrap: (d) => d?.verifyAuthentication,
  }],
  [DELETE_PASSKEY, {
    gql: `mutation($user_id:uuid!,$origin:String!){ deletePasskey(user_id:$user_id,origin:$origin){ status deleted_count message } }`,
    key: 'deletePasskey', unwrap: (d) => d?.deletePasskey,
  }],
  [DELETE_PASSKEY_DEVICE, {
    gql: `mutation($user_id:uuid!,$device_id:String,$origin:String!){ deletePasskey(user_id:$user_id,device_id:$device_id,origin:$origin){ status deleted_count message } }`,
    key: 'deletePasskey', unwrap: (d) => d?.deletePasskey,
  }],
  [LIST_PASSKEY_DEVICES, {
    gql: `query($user_id:uuid!,$rp_id:String!){ vocallabs_passkey_authenticators(where:{user_id:{_eq:$user_id},rp_id:{_eq:$rp_id}}){ id credential_id device_id device_name created_at last_used_at transports rp_id } }`,
    key: 'passkey_authenticators', unwrap: (d) => d?.vocallabs_passkey_authenticators,
  }],
]);

class PasskeyActionClient {
  constructor(private endpoint: string, private authToken?: string) {}

  // Mirrors GraphQLClient.request(query, variables): runs the mapped action and
  // returns { [key]: <result> } in the call-site-expected shape. Throws an
  // error shaped like graphql-request's so existing catch blocks still work.
  async request(query: string, variables: Record<string, any> = {}): Promise<any> {
    const op = PASSKEY_OPS.get(query);
    if (!op) throw new Error('[PasskeyApi] Unmapped passkey operation');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.authToken) headers['Authorization'] = `Bearer ${this.authToken}`;
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: op.gql, variables }),
    });
    const json: any = await res.json().catch(() => null);
    if (json?.errors?.length) {
      const message = json.errors[0]?.message || 'Passkey request failed';
      const err: any = new Error(message);
      err.response = { errors: json.errors };
      throw err;
    }
    return { [op.key]: op.unwrap(json?.data || {}) };
  }
}

export interface AuthenticationOptions {
  challenge: string;
  rpId: string;
  allowCredentials: Array<{
    type: 'public-key';
    id: string;
    transports?: string[];
  }>;
  userVerification: 'preferred' | 'required' | 'discouraged';
  timeout: number;
}

export interface RegistrationOptions {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: any[];
  authenticatorSelection: any;
  excludeCredentials?: any[];
  attestation?: string;
  timeout?: number;
}

export interface PasskeyLoginResponse {
  status: string;
  auth_token: string;
  refresh_token: string;
  id: string;
  deviceInfoSaved: boolean;
}

export interface PasskeyDeleteResponse {
  status: string;
  deleted_count: number;
  message: string;
}

class PasskeyApi {
  private graphqlClient: PasskeyActionClient;
  private capWidgetReady: boolean = false;
  private capWidgetLoadPromise: Promise<void> | null = null;

  constructor() {
    this.graphqlClient = new PasskeyActionClient(VOCALLABS_GRAPHQL_ENDPOINT);

    console.log(`[PasskeyApi] Using passkey actions on: ${VOCALLABS_GRAPHQL_ENDPOINT}`);
    // SSR guard: this singleton is constructed at module-eval time (export
    // default new PasskeyApi()), which fires during static prerender where
    // `window` is undefined. Skip browser-only work on the server.
    if (typeof window === 'undefined') {
      this.capWidgetLoadPromise = Promise.resolve();
      return;
    }
    console.log(`[PasskeyApi] Origin: ${window.location.origin}`);
    this.initCapWidget();
  }

  private initCapWidget(): void {
    console.log('[PasskeyApi] Initializing CAP.js instance detection...');

    this.capWidgetLoadPromise = new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds

      const checkInterval = setInterval(() => {
        attempts++;

        // Check if CAP instance is available
        if ((window as any).capInstance && (window as any).capInstance.ready) {
          clearInterval(checkInterval);
          this.capWidgetReady = true;
          console.log('[PasskeyApi] ✅ CAP.js instance is ready');
          resolve();
          return;
        }

        // Timeout after max attempts
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.warn('[PasskeyApi] CAP.js instance not ready after 5s');
          resolve(); // Don't reject, allow retry
        }
      }, 100);
    });
  }

  private createAuthenticatedClient(authToken: string): PasskeyActionClient {
    return new PasskeyActionClient(VOCALLABS_GRAPHQL_ENDPOINT, authToken);
  }

  // ============================================================================
  // LOGIN: Check if passkeys exist for a phone number (unauthenticated)
  // ============================================================================

  private async getCapToken(): Promise<string> {
    try {
      // Try to ensure instance is ready
      if (this.capWidgetLoadPromise) {
        try {
          await this.capWidgetLoadPromise;
        } catch (e) {
          console.log('[PasskeyApi] Retrying CAP.js detection...');
        }
      }

      // Use the global CAP instance
      const capInstance = (window as any).capInstance;

      if (!capInstance || !capInstance.getToken) {
        throw new Error('CAP.js instance not loaded. Please refresh the page.');
      }

      console.log('[PasskeyApi] Getting CAP.js token from instance...');

      // Get token from CAP instance
      const token = await capInstance.getToken();

      if (!token) {
        throw new Error('Failed to get CAP.js token');
      }

      const tokenStr = typeof token === 'string' ? token : JSON.stringify(token);
      console.log(`[PasskeyApi] CAP.js token obtained (length: ${tokenStr.length})`);
      return tokenStr;
    } catch (error) {
      console.error('[PasskeyApi] Error getting CAP.js token:', error);
      throw new Error('Security verification failed. Please refresh the page and try again.');
    }
  }

  // Helper to get current origin
  private getCurrentOrigin(): string {
    return window.location.origin;
  }

  private async getIpInfo(): Promise<Record<string, any>> {
    try {
      const res = await fetch('https://ipapi.co/json/');
      if (res.ok) {
        const data = await res.json();
        return data || {};
      }
    } catch {
      // fall through
    }
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      return { ip: data.ip || '' };
    } catch {
      return {};
    }
  }

  private getBrowserName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    if (ua.includes('Opera')) return 'Opera';
    return 'Unknown';
  }

  private getOSName(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return 'Windows';
    if (ua.includes('Mac')) return 'macOS';
    if (ua.includes('Linux')) return 'Linux';
    if (ua.includes('Android')) return 'Android';
    if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
    return 'Unknown';
  }

  private async buildDeviceData(): Promise<Record<string, any>> {
    const ipInfo = await this.getIpInfo();
    const nav = typeof navigator !== 'undefined' ? navigator : ({} as Navigator);
    const scr = typeof screen !== 'undefined' ? screen : ({} as Screen);
    return {
      browser: this.getBrowserName(),
      os: this.getOSName(),
      user_agent: nav.userAgent || '',
      platform: nav.platform || '',
      language: nav.language || '',
      languages: nav.languages || [],
      vendor: nav.vendor || '',
      hardware_concurrency: nav.hardwareConcurrency || 0,
      device_memory: (nav as any).deviceMemory || 0,
      screen: {
        width: scr.width || 0,
        height: scr.height || 0,
        color_depth: scr.colorDepth || 0,
        pixel_ratio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      timezone_offset: new Date().getTimezoneOffset(),
      referrer: typeof document !== 'undefined' ? document.referrer : '',
      url: typeof window !== 'undefined' ? window.location.href : '',
      device_type: /Mobi|Android|iPhone|iPad/i.test(nav.userAgent || '') ? 'mobile' : 'desktop',
      location: {
        ip: ipInfo.ip,
        city: ipInfo.city,
        region: ipInfo.region,
        country: ipInfo.country,
        country_name: ipInfo.country_name,
        postal: ipInfo.postal,
        latitude: ipInfo.latitude,
        longitude: ipInfo.longitude,
        timezone: ipInfo.timezone,
        org: ipInfo.org,
        asn: ipInfo.asn,
      },
    };
  }

  private parseVersionToInt(version: string): number {
    const parts = (version || '0.0.0').split('.').map((p) => parseInt(p, 10) || 0);
    const [major = 0, minor = 0, patch = 0] = parts;
    return major * 10000 + minor * 100 + patch;
  }

  // Check if passkeys exist for a phone number
  async checkPasskeyAvailability(phone: string): Promise<{ hasPasskey: boolean; options?: AuthenticationOptions }> {
    const deviceId = getDeviceId();
    const origin = this.getCurrentOrigin(); // 🚀 GET ORIGIN
    console.log(`[PasskeyApi] checkPasskeyAvailability for phone:`, phone);
    console.log(`[PasskeyApi] Origin:`, origin);

    try {
      const capToken = await this.getCapToken();

      const deviceData = await this.buildDeviceData();
      const data: any = await this.graphqlClient.request(
        GENERATE_AUTHENTICATION_OPTIONS,
        {
          phone,
          recaptcha_token: capToken,
          device_id: deviceId,
          device_data: deviceData,
          origin: origin // 🚀 SEND ORIGIN
        }
      );

      const authOptions: AuthenticationOptions = data.generateAuthenticationOptions_v2;

      return {
        hasPasskey: authOptions.allowCredentials && authOptions.allowCredentials.length > 0,
        options: authOptions
      };
    } catch (error: any) {
      // Handle "No passkey found" gracefully - move this UP to avoid console.error noise
      if (error.response?.errors?.[0]?.message?.includes('No passkey') ||
        error.response?.errors?.[0]?.message?.includes('not found') ||
        error.response?.status === 404) {
        console.log(`[PasskeyApi] No passkeys found for phone ${phone}`);
        return { hasPasskey: false };
      }

      // checkPasskeyAvailability is a background auto-check — gracefully return false
      // instead of throwing for any captcha/security/network errors
      console.warn('[PasskeyApi] Passkey availability check failed, skipping:', error.message || error);
      return { hasPasskey: false };
    }
  }

  // ============================================================================
  // LOGIN: Perform passkey login (unauthenticated)
  // ============================================================================
  async loginWithPasskey(
    phone: string,
    authOptions: AuthenticationOptions,
    deviceData?: {
      device_id?: string;
      device_data?: any;
      lang?: string;
      version?: number;
    }
  ): Promise<PasskeyLoginResponse> {
    const deviceId = getDeviceId();
    const origin = this.getCurrentOrigin(); // 🚀 GET ORIGIN
    console.log(`[PasskeyApi] loginWithPasskey for phone:`, phone);
    console.log(`[PasskeyApi] Origin:`, origin);

    try {
      // Step 1: Get credential from browser
      console.log('[PasskeyApi] Starting browser authentication...');
      const authResult = await startAuthentication(authOptions);
      console.log('[PasskeyApi] Browser authentication complete');

      // Step 2: Verify with backend

      const capToken = await this.getCapToken();

      console.log('[PasskeyApi] Verifying with backend...');
      const builtDeviceData = await this.buildDeviceData();
      const data: any = await this.graphqlClient.request(
        VERIFY_AUTHENTICATION,
        {
          phone,
          credential: authResult,
          recaptcha_token: capToken,
          device_id: deviceId,
          device_data: deviceData?.device_data ?? builtDeviceData,
          lang: deviceData?.lang || (typeof navigator !== 'undefined' && navigator.language) || 'en',
          version: deviceData?.version ?? this.parseVersionToInt(process.env.NEXT_PUBLIC_APP_VERSION),
          origin: origin // 🚀 SEND ORIGIN
        }
      );

      const verificationData: PasskeyLoginResponse = data.verifyAuthentication;

      if (verificationData.status !== 'success') {
        throw new Error('Passkey verification failed');
      }

      console.log('[PasskeyApi] ✅ Passkey login successful');
      return verificationData;
    } catch (error: any) {
      console.error('[PasskeyApi] Error during passkey login:', error);

      if (error.message?.includes('CAP.js') || error.message?.includes('Security verification')) {
        throw error;
      }

      if (error.response?.errors?.[0]?.extensions?.code === 'RECAPTCHA_FAILED') {
        throw new Error('Security verification failed. Please refresh and try again.');
      }

      // 🚀 NEW: Handle invalid origin
      if (error.response?.errors?.[0]?.extensions?.code === 'INVALID_ORIGIN') {
        throw new Error('This application is not authorized for passkey authentication.');
      }

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Passkey authentication was cancelled');
        }
        if (error.name === 'InvalidStateError') {
          throw new Error('Passkey is not registered or invalid');
        }
        if (error.name === 'SecurityError') {
          throw new Error('Security error: Make sure you are on a secure connection (HTTPS)');
        }
      }

      if (error.response?.errors) {
        const errorMessage = error.response.errors[0]?.message;
        if (errorMessage?.includes('Challenge not found')) {
          throw new Error('Session expired. Please try again.');
        }
        throw new Error(errorMessage || 'Passkey verification failed');
      }

      throw error;
    }
  }

  // ============================================================================
  // REGISTER: Register a new passkey (authenticated)
  // ============================================================================
  async registerPasskey(userId: string, authToken: string, deviceName?: string): Promise<boolean> {
    try {
      const deviceId = getDeviceId();
      const origin = this.getCurrentOrigin(); // 🚀 GET ORIGIN
      console.log('[PasskeyApi] Starting registration for user:', userId);
      console.log('[PasskeyApi] Origin:', origin);

      // Create authenticated client
      const authenticatedClient = this.createAuthenticatedClient(authToken);

      // Step 1: Get registration options from backend
      console.log('[PasskeyApi] Requesting registration options...');
      const regDeviceData = await this.buildDeviceData();
      const optionsData: any = await authenticatedClient.request(
        GENERATE_REGISTRATION_OPTIONS,
        {
          user_id: userId,
          device_id: deviceId,
          device_data: regDeviceData,
          device_name: deviceName,
          origin: origin // 🚀 SEND ORIGIN
        }
      );
      console.log('[PasskeyApi] Registration options received');

      // FIX: assign registrationOptions from response
      const registrationOptions = optionsData.generateRegistrationOptions;

      console.log('[PasskeyApi] Starting browser registration...');
      const registrationResult = await startRegistration(registrationOptions);
      console.log('[PasskeyApi] Browser registration complete');

      // Step 3: Verify registration with backend
      console.log('[PasskeyApi] Sending verification request...');

      try {
        // When verifying registration, also send device_name if needed by backend
        const verificationData: any = await authenticatedClient.request(
          VERIFY_REGISTRATION,
          {
            user_id: userId,
            credential: registrationResult,
            device_id: deviceId,
            device_data: regDeviceData,
            device_name: deviceName,
            origin: origin // 🚀 SEND ORIGIN
          }
        );

        console.log('[PasskeyApi] Verification response:', verificationData);

        const result = verificationData.verifyRegistration;

        if (result.verified === true) {
          console.log('[PasskeyApi] ✅ Passkey registration successful');
          return true;
        }

        throw new Error(result.message || 'Verification failed');
      } catch (verificationError: any) {
        console.error('[PasskeyApi] Verification error details:', {
          message: verificationError.message,
          response: verificationError.response,
          request: verificationError.request
        });

        // 🚀 NEW: Handle invalid origin
        if (verificationError.response?.errors?.[0]?.extensions?.code === 'INVALID_ORIGIN') {
          throw new Error('This application is not authorized for passkey registration.');
        }

        if (verificationError.message?.includes('not a valid json response from webhook')) {
          throw new Error('Backend service temporarily unavailable. Please try again later or contact support.');
        }

        if (verificationError.response?.errors?.[0]?.extensions?.code === 'unexpected') {
          throw new Error('Server configuration error. Please contact support with error code: WEBHOOK_ERROR');
        }

        throw verificationError;
      }
    } catch (error: any) {
      console.error('[PasskeyApi] Error during passkey registration:', error);

      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          throw new Error('Passkey registration was cancelled');
        }
        if (error.name === 'InvalidStateError') {
          throw new Error('This passkey is already registered');
        }
        if (error.name === 'SecurityError') {
          throw new Error('Security error: Make sure you are on a secure connection (HTTPS)');
        }
      }

      if (error.response?.errors) {
        const errorMessage = error.response.errors[0]?.message;
        if (errorMessage?.includes('Challenge not found')) {
          throw new Error('Session expired. Please try again.');
        }
        throw new Error(errorMessage || 'Passkey registration failed');
      }

      throw error;
    }
  }

  // ============================================================================
  // DELETE: Delete all passkeys for current domain (authenticated)
  // ============================================================================
  async deletePasskey(userId: string, authToken: string): Promise<PasskeyDeleteResponse> {
    const origin = this.getCurrentOrigin();
    console.log('[PasskeyApi] Deleting ALL passkeys for user:', userId);
    console.log('[PasskeyApi] Current origin:', origin);

    try {
      const authenticatedClient = this.createAuthenticatedClient(authToken);

      // Send origin to backend so it can filter by rp_id
      const data: any = await authenticatedClient.request(
        DELETE_PASSKEY,
        {
          user_id: userId,
          origin: origin // Backend will extract rpID from this
        }
      );

      const result: PasskeyDeleteResponse = data.deletePasskey;

      if (result.status !== 'success') {
        throw new Error(result.message || 'Failed to delete passkeys');
      }

      console.log(`[PasskeyApi] ✅ Deleted ${result.deleted_count} passkey(s) for domain: ${origin}`);
      return result;
    } catch (error: any) {
      console.error('[PasskeyApi] Error deleting passkey:', error);

      if (error.response?.errors?.[0]?.extensions?.code === 'INVALID_ORIGIN') {
        throw new Error('This application is not authorized to delete passkeys.');
      }

      if (error.response?.errors) {
        const errorMessage = error.response.errors[0]?.message;
        if (errorMessage?.includes('not found')) {
          throw new Error('Passkey not found or already deleted');
        }
        throw new Error(errorMessage || 'Failed to delete passkey');
      }

      throw error;
    }
  }

  // ============================================================================
  // LIST DEVICES: Get all passkey devices for a user (authenticated)
  // ============================================================================
  async listPasskeyDevices(userId: string, authToken: string): Promise<PasskeyDevice[]> {
    const rpId = window.location.hostname;
    console.log('[PasskeyApi] Listing passkey devices for user:', userId);
    console.log('[PasskeyApi] Filtering by rpId:', rpId);

    try {
      const authenticatedClient = this.createAuthenticatedClient(authToken);

      // Filter by both user_id and rp_id
      const data: any = await authenticatedClient.request(
        LIST_PASSKEY_DEVICES,
        {
          user_id: userId,
          rp_id: rpId // Pass rpId to filter by domain
        }
      );

      console.log('[PasskeyApi] Devices received for this domain:', data.passkey_authenticators?.length || 0);
      return data.passkey_authenticators || [];
    } catch (error: any) {
      console.error('[PasskeyApi] Error listing passkey devices:', error);

      if (error.response?.errors?.[0]?.extensions?.code === 'INVALID_ORIGIN') {
        throw new Error('This application is not authorized to list passkey devices.');
      }

      throw new Error(error.response?.errors?.[0]?.message || 'Failed to list passkey devices');
    }
  }

  // ============================================================================
  // DELETE DEVICE: Delete a specific passkey device for current domain (authenticated)
  // ============================================================================
  async deletePasskeyDevice(userId: string, deviceId: string, authToken: string): Promise<boolean> {
    const origin = this.getCurrentOrigin();
    console.log('[PasskeyApi] Deleting passkey device:', deviceId, 'for user:', userId);
    console.log('[PasskeyApi] Current origin:', origin);

    try {
      const authenticatedClient = this.createAuthenticatedClient(authToken);

      // Send origin so backend can filter by rp_id
      const data: any = await authenticatedClient.request(
        DELETE_PASSKEY_DEVICE,
        {
          user_id: userId,
          device_id: deviceId,
          origin: origin // Backend will extract rpID from this
        }
      );

      const result = data.deletePasskey;

      if (result.status !== 'success') {
        throw new Error(result.message || 'Failed to delete device');
      }

      if (result.deleted_count === 0) {
        throw new Error('Device not found or already deleted for this domain');
      }

      console.log('[PasskeyApi] ✅ Device deleted successfully from domain:', origin);
      return true;
    } catch (error: any) {
      console.error('[PasskeyApi] Error deleting passkey device:', error);

      if (error.response?.errors?.[0]?.extensions?.code === 'INVALID_ORIGIN') {
        throw new Error('This application is not authorized to delete passkey devices.');
      }

      throw new Error(error.response?.errors?.[0]?.message || 'Failed to delete device');
    }
  }
}

export default new PasskeyApi();