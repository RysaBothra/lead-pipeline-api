import { v4 as uuidv4 } from "uuid";
import {
  createGrowClient,
  createSubspaceClient,
} from "../../api/graphqlClient";
import { createGraphQLClient } from "../../graphql/client";
import { VOCALLABS_GRAPHQL_ENDPOINT } from "../../api/config";
import {
  GET_USER_DATA,
  REGISTER_V5, // <-- V5: VocalLabs-owned auth (goFlash)
  VERIFY_OTP_V5, // <-- V5
  GET_COUNTRY_CODES,
  REFRESH_TOKEN,
  LOGOUT,
  GET_WHATSAPP_LINK,
  VERIFY_WHATSAPP_OTP_V3,
  LOGOUT_WITH_TOKEN,
} from "../queries/authQueries";
import {
  OtpVerificationData,
  LoginResponse,
  RegisterResponse,
  UserData,
} from "../types/authTypes";

// Declare window for CAP.js widget
declare global {
  interface Window {
    CapWidget: any;
  }
}

class AuthApi {
  private client;
  private vocallabsClient;

  // 🚀 CAP.js state logic
  private capWidgetReady: boolean = false;
  private capWidgetLoadPromise: Promise<void> | null = null;

  constructor() {
    this.client = createGrowClient();
    this.vocallabsClient = createGraphQLClient();
    this.initCapWidget(); // 🚀 Initialize CAP.js widget
  }

  // ============================================================================
  // 🚀 CAP.js Widget Functions
  // ============================================================================
  private initCapWidget(): void {
    // SSR guard: the AuthApi singleton is constructed at module-eval time
    // (export const authApi = new AuthApi()), which fires during SSR of any
    // 'use client' page that transitively imports this file. The setInterval
    // callback below references `window`, so we must short-circuit on the
    // server. The widget will initialize on the first client-side import.
    if (typeof window === "undefined") {
      this.capWidgetLoadPromise = Promise.resolve();
      return;
    }

    console.log("[AuthApi] Initializing CAP.js instance detection...");

    this.capWidgetLoadPromise = new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds

      const checkInterval = setInterval(() => {
        attempts++;

        // Check if CAP instance is available
        if ((window as any).capInstance && (window as any).capInstance.ready) {
          clearInterval(checkInterval);
          this.capWidgetReady = true;
          console.log("[AuthApi] ✅ CAP.js instance is ready");
          resolve();
          return;
        }

        // Timeout after max attempts
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          console.warn("[AuthApi] CAP.js instance not ready after 5s");
          resolve(); // Don't reject, allow retry
        }
      }, 100);
    });
  }

  private async getCapToken(): Promise<string> {
    try {
      // Try to ensure instance is ready
      if (this.capWidgetLoadPromise) {
        try {
          await this.capWidgetLoadPromise;
        } catch (e) {
          console.log("[AuthApi] Retrying CAP.js detection...");
        }
      }

      // Use the global CAP instance
      const capInstance = (window as any).capInstance;

      if (!capInstance || !capInstance.getToken) {
        throw new Error("CAP.js instance not loaded. Please refresh the page.");
      }

      console.log("[AuthApi] Getting CAP.js token from instance...");

      // Get token from CAP instance
      const token = await capInstance.getToken();

      if (!token) {
        throw new Error("Failed to get CAP.js token");
      }

      const tokenStr =
        typeof token === "string" ? token : JSON.stringify(token);
      console.log(
        `[AuthApi] CAP.js token obtained (length: ${tokenStr.length})`
      );
      return tokenStr;
    } catch (error) {
      console.error("[AuthApi] Error getting CAP.js token:", error);
      throw new Error(
        "Security verification failed. Please refresh the page and try again."
      );
    }
  }
  // ============================================================================
  // End of CAP.js Functions
  // ============================================================================

  async getCountryCodes() {
    try {
      const query = `
        query GetCountryCodes {
          vocallabs_exchange_rate {
            country_code
            phone_code
            country_name
          }
        }
      `;

      const response = await this.vocallabsClient.request(query);

      if (
        !response?.vocallabs_exchange_rate ||
        !Array.isArray(response.vocallabs_exchange_rate)
      ) {
        return this.getFallbackCountryCodes();
      }

      // Filter and sort valid country codes
      const uniqueCodes = response.vocallabs_exchange_rate
        .filter(
          (code: any) =>
            code &&
            typeof code === "object" &&
            code.country_code &&
            code.phone_code
        )
        .sort((a: any, b: any) => {
          const nameA = a.country_name || a.country_code;
          const nameB = b.country_name || b.country_code;
          return nameA.localeCompare(nameB);
        });

      if (uniqueCodes.length === 0) {
        return this.getFallbackCountryCodes();
      }

      return uniqueCodes;
    } catch (error) {
      return this.getFallbackCountryCodes();
    }
  }

  private getFallbackCountryCodes() {
    return [
      { country_code: "US", phone_code: "1", country_name: "United States" },
      { country_code: "IN", phone_code: "91", country_name: "India" },
      { country_code: "GB", phone_code: "44", country_name: "United Kingdom" },
      { country_code: "CA", phone_code: "1", country_name: "Canada" },
      { country_code: "AU", phone_code: "61", country_name: "Australia" },
      { country_code: "DE", phone_code: "49", country_name: "Germany" },
      { country_code: "FR", phone_code: "33", country_name: "France" },
      { country_code: "IT", phone_code: "39", country_name: "Italy" },
      { country_code: "ES", phone_code: "34", country_name: "Spain" },
      { country_code: "BR", phone_code: "55", country_name: "Brazil" },
    ];
  }

  async sendOTP(phone: string): Promise<RegisterResponse> {
    // Ensure phone number has + prefix
    const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;

    // 1. Get CAP.js token
    const capToken = await this.getCapToken();

    // 2. Call V5 mutation (goFlash)
    const response = (await this.client.request(REGISTER_V5, {
      phone: formattedPhone,
      recaptcha_token: capToken, // Pass the CAP.js token
    })) as any;

    return response.registerWithoutPassword_v5;
  }

  // 🚀 MODIFIED: This function now uses VERIFY_OTP_V3
  async verifyOTP(data: OtpVerificationData): Promise<LoginResponse> {
    // Ensure phone number has + prefix
    const formattedPhone = data.phone.startsWith("+")
      ? data.phone
      : `+${data.phone}`;

    try {
      const ipInfo = await this.getIpInfo();
      const deviceId = this.getOrCreateDeviceId();
      const deviceData = {
        ...this.getDeviceData(),
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

      const response = (await this.client.request(VERIFY_OTP_V5, {
        phone: formattedPhone,
        otp: data.otp,
        device_data: deviceData,
        device_id: deviceId,
        ip_address: ipInfo.ip || "",
        version: this.parseVersionToInt(process.env.NEXT_PUBLIC_APP_VERSION),
        lang: (typeof navigator !== "undefined" && navigator.language) || "en",
      })) as any;

      // Check for the correct response field
      if (!response?.verifyOTP_v5?.auth_token || !response?.verifyOTP_v5?.id) {
        throw new Error("Invalid verification response");
      }

      // Return formatted response
      return {
        auth_token: response.verifyOTP_v5.auth_token,
        refresh_token: response.verifyOTP_v5.refresh_token,
        id: response.verifyOTP_v5.id,
        status: response.verifyOTP_v5.status || "success",
        deviceInfoSaved: response.verifyOTP_v5.deviceInfoSaved,
      };
    } catch (error: any) {
      // Extract user-friendly message from GraphQL error
      const message = this.extractErrorMessage(error);
      throw new Error(message);
    }
  }

  // Helper to extract user-friendly error messages from GraphQL errors
  private extractErrorMessage(error: any): string {
    // Check if it's a GraphQL ClientError with response containing errors array
    if (error?.response?.errors && Array.isArray(error.response.errors)) {
      const firstError = error.response.errors[0];
      if (firstError?.message) {
        return firstError.message;
      }
    }

    // Check if there's a nested message in the error
    if (error?.message) {
      // Try to parse if message looks like JSON
      try {
        // Sometimes the error message itself contains JSON
        if (error.message.includes('"message"')) {
          const parsed = JSON.parse(error.message);
          if (parsed?.errors?.[0]?.message) {
            return parsed.errors[0].message;
          }
        }
      } catch {
        // Not JSON, use message as-is if it's a clean message
        // Avoid returning raw JSON/object strings
        if (!error.message.includes("{") && !error.message.includes("[")) {
          return error.message;
        }
      }
    }

    // Default fallback message
    return "OTP verification failed. Please try again.";
  }

  async refreshToken(userId: string, refreshToken: string) {
    try {
      const client = createGrowClient();

      const response = (await client.request(REFRESH_TOKEN, {
        user_id: userId,
        refresh_token: refreshToken,
      })) as any;

      // Validate the response (goFlash refreshToken_v5)
      if (!response?.refreshToken_v5?.auth_token) {
        throw new Error("Invalid refresh token response");
      }

      return {
        auth_token: response.refreshToken_v5.auth_token,
        refresh_token: response.refreshToken_v5.refresh_token,
        status: response.refreshToken_v5.status || "success",
      };
    } catch (error) {
      throw error;
    }
  }

  async logout(refreshToken: string) {
    try {
      // Direct GraphQL request using the client
      // Use a direct fetch with timeout to ensure it doesn't hang
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch(VOCALLABS_GRAPHQL_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
          },
          body: JSON.stringify({
            query: `
              mutation Logout($refreshToken: String!) {
                subspace {
                  logout(request: {refresh_token: $refreshToken}) {
                    success
                    message
                  }
                }
              }
            `,
            variables: { refreshToken },
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          return (
            result.data?.subspace?.logout || {
              success: true,
              message: "Logged out",
            }
          );
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
      }

      return { success: true, message: "Logged out" };
    } catch (error) {
      // Even if the API call fails, we should still consider it a success for local state
      return { success: true, message: "Logged out locally" };
    }
  }

  async logoutWithToken(authToken: string) {
    try {
      const client = createSubspaceClient(authToken);
      const response = await client.request(LOGOUT_WITH_TOKEN, {
        auth_token: authToken,
      });
      return response?.logout;
    } catch (error) {
      console.error("Error calling logout mutation with token:", error);
      return null;
    }
  }

  async getUserData(id: string, authToken: string): Promise<UserData | null> {
    const client = createSubspaceClient(authToken);
    const response = await client.request(GET_USER_DATA, { id });
    return (response as any)?.vocallabs_client?.[0] || null;
  }

  // ============================================================================
  // 🚀 WHATSAPP OTP METHODS
  // ============================================================================
  async getWhatsAppLink(): Promise<{ type: string; link: string }> {
    const response = await this.client.request(GET_WHATSAPP_LINK);

    if (!response?.getWhatsAppLink?.link) {
      throw new Error("Failed to get WhatsApp link");
    }

    return {
      type: response.getWhatsAppLink.type,
      link: response.getWhatsAppLink.link,
    };
  }

  async verifyWhatsAppOTP(data: {
    otp: string;
    device_id: string;
    lang?: string;
    version?: number;
  }): Promise<LoginResponse & { phone?: string }> {
    // Get browser and OS info
    const browser = this.getBrowserName();
    const os = this.getOSName();

    try {
      const response = await this.client.request(VERIFY_WHATSAPP_OTP_V3, {
        request: {
          otp: data.otp,
          device_data: {
            browser,
            os,
          },
          device_id: data.device_id,
          lang: data.lang || "en",
          version: data.version || 1,
        },
      });

      if (
        !response?.verifyWhatsAppOTP_v3?.auth_token ||
        !response?.verifyWhatsAppOTP_v3?.id
      ) {
        throw new Error("Invalid WhatsApp OTP verification response");
      }

      return {
        auth_token: response.verifyWhatsAppOTP_v3.auth_token,
        refresh_token: response.verifyWhatsAppOTP_v3.refresh_token,
        id: response.verifyWhatsAppOTP_v3.id,
        status: response.verifyWhatsAppOTP_v3.status || "success",
        deviceInfoSaved: response.verifyWhatsAppOTP_v3.deviceInfoSaved,
        phone: response.verifyWhatsAppOTP_v3.phone,
      };
    } catch (error: any) {
      // Extract user-friendly message from GraphQL error
      const message = this.extractErrorMessage(error);
      throw new Error(message);
    }
  }

  private getBrowserName(): string {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Edge")) return "Edge";
    if (ua.includes("Opera")) return "Opera";
    return "Unknown";
  }

  private getOSName(): string {
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad"))
      return "iOS";
    return "Unknown";
  }

  private async getIpInfo(): Promise<Record<string, any>> {
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (res.ok) {
        const data = await res.json();
        return data || {};
      }
    } catch {
      // fall through
    }
    try {
      const res = await fetch("https://api.ipify.org?format=json");
      const data = await res.json();
      return { ip: data.ip || "" };
    } catch {
      return {};
    }
  }

  private getDeviceData(): Record<string, unknown> {
    const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
    const scr = typeof screen !== "undefined" ? screen : ({} as Screen);
    return {
      browser: this.getBrowserName(),
      os: this.getOSName(),
      user_agent: nav.userAgent || "",
      platform: nav.platform || "",
      language: nav.language || "",
      languages: nav.languages || [],
      vendor: nav.vendor || "",
      hardware_concurrency: nav.hardwareConcurrency || 0,
      device_memory: (nav as any).deviceMemory || 0,
      screen: {
        width: scr.width || 0,
        height: scr.height || 0,
        color_depth: scr.colorDepth || 0,
        pixel_ratio: typeof window !== "undefined" ? window.devicePixelRatio : 1,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      timezone_offset: new Date().getTimezoneOffset(),
      referrer: typeof document !== "undefined" ? document.referrer : "",
      url: typeof window !== "undefined" ? window.location.href : "",
      device_type: /Mobi|Android|iPhone|iPad/i.test(nav.userAgent || "")
        ? "mobile"
        : "desktop",
    };
  }

  private parseVersionToInt(version: string): number {
    const parts = (version || "0.0.0").split(".").map((p) => parseInt(p, 10) || 0);
    const [major = 0, minor = 0, patch = 0] = parts;
    return major * 10000 + minor * 100 + patch;
  }

  private getOrCreateDeviceId(): string {
    if (typeof localStorage === "undefined") return uuidv4();
    let deviceId = localStorage.getItem("device_id");
    if (!deviceId) {
      deviceId = uuidv4();
      localStorage.setItem("device_id", deviceId);
    }
    return deviceId;
  }
}

export const authApi = new AuthApi();
