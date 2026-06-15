import React, { useState, useRef } from "react";
import { useNavigate } from '@/src/utils/router-compat';
import { useAuth } from "../../services/auth/hooks/useAuth";
import { authApi } from "../../services/auth/api/authApi";
import { LoginForm } from "../../components/auth/LoginForm";
import { OtpForm } from "../../components/auth/OtpForm";
import { CompanyForm } from "../../components/auth/CompanyForm";
import { LoginBanner } from "../../components/auth/LoginBanner";
import { ThemeToggle } from "../../components/auth/ThemeToggle";
import { createGraphQLClient } from "../../services/graphql/client";
import { UserDetailsModal } from "../../components/auth/UserDetailsModal";
import { buttonAnalytics } from "../../services/analytics/analytics";
import { usePasskey } from "../../hooks/usePasskey";
import { PasskeyUpsellBanner } from "../../components/auth/PasskeyUpsellBanner";
import type { LoginFormHandle } from "../../components/auth/LoginForm";
import { useWhiteLabeling } from "../../hooks/useWhiteLabeling";
import { CanvasRevealEffect } from "../../components/ui/CanvasRevealEffect";
import { cn } from "../../utils/cn";
import { resolveThemeColors, themeCssVars, v } from "../../components/auth/themeTokens";
const UPDATE_COMPANY = `
  mutation UpdateCompany($id: uuid!, $company_name: String!) {
    insert_vocallabs_client_one(
      object: { id: $id, company_name: $company_name }
      on_conflict: { 
        constraint: client_pkey,
        update_columns: [company_name]
      }
    ) {
      id
      company_name
    }
  }
`;
const COUNTRY_CODES = [
  { code: "+91", country: "India", iso: "IN" },
  { code: "+1", country: "USA", iso: "US" },
  { code: "+44", country: "UK", iso: "GB" },
  { code: "+61", country: "Australia", iso: "AU" },
  { code: "+86", country: "China", iso: "CN" },
  { code: "+81", country: "Japan", iso: "JP" },
  { code: "+49", country: "Germany", iso: "DE" },
  { code: "+33", country: "France", iso: "FR" },
  { code: "+7", country: "Russia", iso: "RU" },
  { code: "+971", country: "UAE", iso: "AE" },
  { code: "+65", country: "Singapore", iso: "SG" },
  { code: "+60", country: "Malaysia", iso: "MY" },
  { code: "+66", country: "Thailand", iso: "TH" },
  { code: "+82", country: "South Korea", iso: "KR" },
  { code: "+852", country: "Hong Kong", iso: "HK" },
];

export function Login() {
  // VERSION MARKER - If you see this, you have the NEW code with loggingIn fix
  console.log(
    "🚀🚀🚀 LOGIN COMPONENT VERSION 2.0 - WITH LOGGING_IN FIX 🚀🚀🚀",
  );

  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const otpRef = useRef("");
  const handleOtpChange = (value: string) => {
    otpRef.current = value;
    setOtp(value);
  };
  const [companyName, setCompanyName] = useState("");
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [needsCompanyName, setNeedsCompanyName] = useState(false);
  const [showUserDetails, setShowUserDetails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasskeyUpsell, setShowPasskeyUpsell] = useState(false);
  const [loggedInViaOtp, setLoggedInViaOtp] = useState(false);
  const loginFormRef = useRef<LoginFormHandle>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const navigate = useNavigate();
  const { login, authToken, user } = useAuth();
  const { loginWithPasskey } = usePasskey();
  const [initialCheckDone, setInitialCheckDone] = React.useState(false);
  const [isQuickLogin, setIsQuickLogin] = React.useState(false);

  // Helper to convert hex to RGB array
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
      : [0, 0, 0];
  };
  const {
    logoRect,
    logoRectDark,
    companyName: wlCompanyName,
    homeConfig,
    isLoading: checkingWhitelisting,
    refresh: refreshWhiteLabeling,
  } = useWhiteLabeling();

  // Re-fetch the latest whitelabel config whenever /login is reached.
  // This ensures that after the admin saves customisation changes, the next
  // visit to /login (e.g. after sign-out) renders the new config without a
  // hard refresh — the WhiteLabelingProvider would otherwise keep stale state
  // because it only fetches once on app mount.
  React.useEffect(() => {
    refreshWhiteLabeling();
  }, [refreshWhiteLabeling]);

  // WhatsApp OTP state
  const [isWhatsAppOTP, setIsWhatsAppOTP] = useState(false);
  const [whatsAppLoading, setWhatsAppLoading] = useState(false);

  // Animated characters state
  const [isTyping, setIsTyping] = useState(false);
  const [loginResult, setLoginResult] = useState<"success" | "error" | null>(
    null,
  );

  // Use ref to track state for async callbacks to avoid stale closures
  const stateRef = useRef({ isQuickLogin, isOtpSent });
  stateRef.current = { isQuickLogin, isOtpSent };

  // Clear any previously stored phone numbers from localStorage (security hardening).
  React.useEffect(() => {
    try {
      localStorage.removeItem("previous_accounts");
    } catch { /* empty */ }
  }, []);

  // Redirect if user is already logged in (only on initial mount)
  React.useEffect(() => {
    // Only run when we're on the login page
    if (window.location.pathname !== "/login") {
      console.log("[Login useEffect] Not on login page, skipping");
      return;
    }

    // Skip if actively logging in (prevents race condition with passkey)
    if (loggingIn) {
      console.log("[Login useEffect] Login in progress, skipping");
      return;
    }

    if (!initialCheckDone && user?.id && !isOtpSent && !needsCompanyName) {
      setInitialCheckDone(true);
      const redirectPath = localStorage.getItem("redirectAfterLogin");
      console.log(
        "[Login useEffect] User already logged in, redirect path:",
        redirectPath,
      );
      console.log(
        "[Login useEffect] Current location:",
        window.location.pathname,
      );
      if (redirectPath) {
        localStorage.removeItem("redirectAfterLogin");
        console.log(
          "[Login useEffect] Navigating to stored path:",
          redirectPath,
        );
        setTimeout(() => {
          navigate(redirectPath, { replace: true });
        }, 100);
      } else {
        console.log("[Login useEffect] No redirect path, going to home");
        setTimeout(() => {
          navigate("/", { replace: true });
        }, 100);
      }
    }
  }, [
    user,
    navigate,
    initialCheckDone,
    isOtpSent,
    needsCompanyName,
    loggingIn,
  ]);

  const handleUserDetailsComplete = () => {
    // Check if there's a stored redirect path
    const redirectPath = localStorage.getItem("redirectAfterLogin");
    if (redirectPath) {
      localStorage.removeItem("redirectAfterLogin");
      navigate(redirectPath, { replace: true });
    } else {
      navigate("/", { replace: true });
    }
  };

  const checkUserDetails = async (userId: string, token: string) => {
    const client = createGraphQLClient(
      token,
      "https://db.subspace.money/v1/graphql",
    );
    const { auth } = await client.request(
      `
      query CheckUserDetails($id: uuid!) {
        auth(where: {id: {_eq: $id}}) {
          fullname
          email
          username
          email_verified
        }
      }
    `,
      { id: userId },
    );

    const user = auth[0];
    return !user?.fullname || !user?.email || !user?.username;
  };

  const handleSendOTP = async (e?: React.FormEvent, phoneOverride?: string) => {
    e?.preventDefault();

    buttonAnalytics.trackButtonClick("Button Clicked", {
      button_name: "Send OTP",
      page_name: "Login",
      feature_area: "Authentication",
      phone_number: phone.startsWith("+") ? phone : `+${phone}`,
    });

    setLoading(true);
    setError(null);

    try {
      // Ensure phone has + prefix
      const p = phoneOverride || phone;
      const formattedPhone = p.startsWith("+") ? p : `+${p}`;
      const response = await authApi.sendOTP(formattedPhone);
      if (response.status === "success") {
        setIsOtpSent(true);
        setIsQuickLogin(false); // Reset quick login flag
      } else {
        setError("Failed to send OTP. Please try again.");
      }
    } catch (err) {
      setError("Failed to send OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Handle WhatsApp OTP request
  const handleWhatsAppOTP = async () => {
    buttonAnalytics.trackButtonClick("Button Clicked", {
      button_name: "WhatsApp OTP",
      page_name: "Login",
      feature_area: "Authentication",
      phone_number: phone.startsWith("+") ? phone : `+${phone}`,
    });

    setWhatsAppLoading(true);
    setError(null);

    try {
      // Get WhatsApp link
      const response = await authApi.getWhatsAppLink();

      if (response.link) {
        // Open WhatsApp link in new tab
        window.open(response.link, "_blank");

        // Set state to show OTP form for WhatsApp
        setIsWhatsAppOTP(true);
        setIsOtpSent(true);
        setIsQuickLogin(false);
      } else {
        setError("Failed to get WhatsApp link. Please try again.");
      }
    } catch (err) {
      console.error("Error getting WhatsApp link:", err);
      setError("Failed to get WhatsApp link. Please try again.");
    } finally {
      setWhatsAppLoading(false);
    }
  };

  const checkCompanyName = async (userId: string, token: string) => {
    const client = createGraphQLClient(token);
    const { vocallabs_client } = await client.request(
      `
      query CheckCompany($id: uuid!) {
        vocallabs_client(where: {id: {_eq: $id}}) {
          company_name
        }
      }
    `,
      { id: userId },
    );

    return vocallabs_client.length === 0 || !vocallabs_client[0]?.company_name;
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    // If this is a WhatsApp OTP verification, use the WhatsApp verification flow
    if (isWhatsAppOTP) {
      return handleVerifyWhatsAppOTP(e);
    }

    buttonAnalytics.trackButtonClick("Button Clicked", {
      button_name: "Verify OTP",
      page_name: "Login",
      feature_area: "Authentication",
      phone_number: phone.startsWith("+") ? phone : `+${phone}`,
      otp_length: otpRef.current.length,
    });

    setLoading(true);
    setError(null);

    try {
      // Ensure phone has + prefix
      const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;

      const response = await authApi.verifyOTP({
        phone: formattedPhone,
        otp: otpRef.current,
      });

      // Check if response indicates success
      if (response.status !== "success") {
        throw new Error("OTP verification failed");
      }

      // Store auth data first
      login(
        response.auth_token,
        { id: response.id, phone: formattedPhone },
        response.refresh_token,
      );

      // --- FETCH USER DATA ---
      const userData = await authApi.getUserData(
        response.id,
        response.auth_token,
      );
      // Check if company name is needed
      setLoggedInViaOtp(true);
      const needsCompany = await checkCompanyName(
        response.id,
        response.auth_token,
      );

      // Invited members must NOT go through company setup — they're joining an
      // existing admin's account. Skip the gate and let the /invite claim run.
      const hasPendingInvite =
        typeof window !== "undefined" && !!localStorage.getItem("rbac_invite_token");

      if (needsCompany && !hasPendingInvite) {
        setNeedsCompanyName(true);
      } else {
        // Show success animation
        setLoginResult("success");
        setTimeout(() => setLoginResult(null), 3000);
        // Check if there's a stored redirect path
        localStorage.setItem("showPasskeyUpsell", "true");
        const redirectPath = localStorage.getItem("redirectAfterLogin");
        console.log("[Login] Redirect after OTP verification:", redirectPath);
        console.log("[Login] Current location:", window.location.pathname);
        if (redirectPath) {
          localStorage.removeItem("redirectAfterLogin");
          console.log("[Login] Navigating to stored path:", redirectPath);
          // Use setTimeout to ensure auth state is fully updated
          setTimeout(() => {
            navigate(redirectPath, { replace: true });
          }, 100);
        } else {
          console.log("[Login] No redirect path, going to home");
          setTimeout(() => {
            navigate("/", { replace: true });
          }, 100);
        }
      }
    } catch (err) {
      console.error("Error during verification:", err);
      // Show error animation
      setLoginResult("error");
      setTimeout(() => setLoginResult(null), 3000);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to verify OTP. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  // Handle WhatsApp OTP verification
  const handleVerifyWhatsAppOTP = async (e: React.FormEvent) => {
    e.preventDefault();

    buttonAnalytics.trackButtonClick("Button Clicked", {
      button_name: "Verify WhatsApp OTP",
      page_name: "Login",
      feature_area: "Authentication",
      otp_length: otpRef.current.length,
    });

    setLoading(true);
    setError(null);

    try {
      // Generate or get device ID
      let deviceId = localStorage.getItem("device_id");
      if (!deviceId) {
        deviceId = `web-${Date.now()}-${Math.random()
          .toString(36)
          .substr(2, 9)}`;
        localStorage.setItem("device_id", deviceId);
      }

      const response = await authApi.verifyWhatsAppOTP({
        otp: otpRef.current,
        device_id: deviceId,
        lang: "en",
        version: 1,
      });

      // Check if response indicates success
      if (response.status !== "success") {
        throw new Error("WhatsApp OTP verification failed");
      }

      // Get phone from response
      const userPhone = response.phone || "";

      // Store auth data first
      login(
        response.auth_token,
        { id: response.id, phone: userPhone },
        response.refresh_token,
      );

      // --- FETCH USER DATA ---
      await authApi.getUserData(
        response.id,
        response.auth_token,
      );

      // Check if company name is needed
      setLoggedInViaOtp(true);
      const needsCompany = await checkCompanyName(
        response.id,
        response.auth_token,
      );

      // Invited members must NOT go through company setup — they're joining an
      // existing admin's account. Skip the gate and let the /invite claim run.
      const hasPendingInvite =
        typeof window !== "undefined" && !!localStorage.getItem("rbac_invite_token");

      if (needsCompany && !hasPendingInvite) {
        setNeedsCompanyName(true);
      } else {
        // Show success animation
        setLoginResult("success");
        setTimeout(() => setLoginResult(null), 3000);
        // Check if there's a stored redirect path
        localStorage.setItem("showPasskeyUpsell", "true");
        const redirectPath = localStorage.getItem("redirectAfterLogin");
        console.log(
          "[Login] Redirect after WhatsApp OTP verification:",
          redirectPath,
        );
        if (redirectPath) {
          localStorage.removeItem("redirectAfterLogin");
          setTimeout(() => {
            navigate(redirectPath, { replace: true });
          }, 100);
        } else {
          setTimeout(() => {
            navigate("/", { replace: true });
          }, 100);
        }
      }
    } catch (err) {
      console.error("Error during WhatsApp OTP verification:", err);
      // Show error animation
      setLoginResult("error");
      setTimeout(() => setLoginResult(null), 3000);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to verify WhatsApp OTP. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async (phoneNumber: string) => {
    console.log("[handlePasskeyLogin] Starting passkey login");
    setLoggingIn(true);

    buttonAnalytics.trackButtonClick("Button Clicked", {
      button_name: "Passkey Login",
      page_name: "Login",
      feature_area: "Authentication",
      phone_number: phoneNumber,
    });

    setLoading(true);
    setError(null);

    try {
      const response = await loginWithPasskey(phoneNumber);
      if (!response) throw new Error("Passkey login failed");

      login(
        response.auth_token,
        { id: response.id, phone: phoneNumber },
        response.refresh_token,
      );

      // --- FETCH USER DATA ---
      await authApi.getUserData(
        response.id,
        response.auth_token,
      );

      const needsCompany = await checkCompanyName(
        response.id,
        response.auth_token,
      );

      if (needsCompany) {
        console.log("[handlePasskeyLogin] Company name needed");
        setNeedsCompanyName(true);
        setLoggingIn(false);
      } else {
        const redirectPath = localStorage.getItem("redirectAfterLogin");
        console.log("[handlePasskeyLogin] Redirect path:", redirectPath);
        if (redirectPath) {
          localStorage.removeItem("redirectAfterLogin");
          console.log("[handlePasskeyLogin] Navigating to:", redirectPath);
          // Don't reset loggingIn - let component unmount naturally
          setTimeout(() => {
            navigate(redirectPath, { replace: true });
          }, 100);
        } else {
          console.log("[handlePasskeyLogin] No redirect, going to home");
          // Don't reset loggingIn - let component unmount naturally
          setTimeout(() => {
            navigate("/", { replace: true });
          }, 100);
        }
      }
    } catch (err) {
      console.error("[handlePasskeyLogin] Error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to login with passkey. Please try again.",
      );
      setLoggingIn(false);
    } finally {
      setLoading(false);
    }
  };

  // Auto-send OTP/Passkey on quick login
  const handlePasskeyCheckComplete = (
    hasPasskey: boolean,
    checkedPhone: string,
  ) => {
    // Check FRESH state from ref
    if (!stateRef.current.isQuickLogin || stateRef.current.isOtpSent) return;

    if (hasPasskey) {
      console.log("[Quick Login] Passkey found, starting passkey login");
      handlePasskeyLogin(checkedPhone);
    } else {
      console.log("[Quick Login] No passkey found, auto-sending OTP");
      handleSendOTP(undefined, checkedPhone);
    }
  };

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;

    buttonAnalytics.trackButtonClick("Button Clicked", {
      button_name: "Submit Company Name",
      page_name: "Login",
      feature_area: "Authentication",
      phone_number: companyName.trim(),
    });

    setLoading(true);
    setError(null);

    try {
      const client = createGraphQLClient(authToken);
      await client.request(UPDATE_COMPANY, {
        id: JSON.parse(localStorage.getItem("auth") || "{}").user?.id,
        company_name: companyName.trim(),
      });

      // Check if there's a stored redirect path
      if (loggedInViaOtp) {
        localStorage.setItem("showPasskeyUpsell", "true");
      }
      const redirectPath = localStorage.getItem("redirectAfterLogin");
      console.log("[Login] Redirect after company name:", redirectPath);
      console.log("[Login] Current location:", window.location.pathname);
      if (redirectPath) {
        localStorage.removeItem("redirectAfterLogin");
        console.log("[Login] Navigating to stored path:", redirectPath);
        // Use setTimeout to ensure company data is saved
        setTimeout(() => {
          navigate(redirectPath, { replace: true });
        }, 100);
      } else {
        console.log("[Login] No redirect path, going to home");
        setTimeout(() => {
          navigate("/", { replace: true });
        }, 100);
      }
    } catch (err) {
      setError("Failed to update company name. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const themeColors = resolveThemeColors(homeConfig?.colors);
  const wrapperVars = themeCssVars(themeColors);

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row relative"
      style={{
        ...wrapperVars,
        backgroundColor: themeColors.rightPanelBg,
      }}
    >
      {/* Theme toggle removed from login page */}
      <LoginBanner
        customLogo={logoRectDark || logoRect}
        companyName={wlCompanyName}
        isLoading={checkingWhitelisting}
        isTyping={isTyping}
        isTypingOtp={isOtpSent && isTyping}
        loginResult={loginResult}
        homeConfig={homeConfig}
      />

      <div
        className="flex-1 flex items-center justify-center p-6 relative overflow-hidden z-20 transition-all duration-500 border-l border-white/10"
        style={{ backgroundColor: v("rightPanelBg") }}
      >
        {/* Headline - top left on desktop, hidden on mobile (banner covers it on md+) */}
        <div className="hidden lg:block absolute top-8 left-8 right-8 z-10">
          <p
            className="text-xs font-medium tracking-widest uppercase mb-3"
            style={{ color: v("headlineText"), opacity: 0.6 }}
          >
            {homeConfig?.bannerEyebrow || "AI-Powered Outbound"}
          </p>
          <h1
            className="text-3xl xl:text-4xl font-bold leading-tight mb-2 whitespace-pre-line"
            style={{ color: v("headlineText") }}
          >
            {homeConfig?.bannerHeadline || "The easiest way to get qualified leads"}
          </h1>
          <p
            className="text-sm leading-relaxed max-w-lg"
            style={{ color: v("headlineText"), opacity: 0.55 }}
          >
            {homeConfig?.bannerSubtext ||
              "Drop in your website URL. LeadsIQ figures out who to target, writes the outreach, and brings you qualified replies — you only pay when someone is actually interested."}
          </p>
        </div>

        {/* Form content with higher z-index */}
        <div className="w-full max-w-md space-y-4 relative z-10 scale-[0.95] origin-center mt-0 2xl:mt-24">

          <div className="flex flex-col items-center mb-8">
            <div className="md:hidden mb-4 min-h-[32px]">
              {checkingWhitelisting ? (
                // Placeholder while checking
                <div className="h-8 w-8"></div>
              ) : logoRect ? (
                <img src={logoRect} alt="Logo" className="h-8 mx-auto block" />
              ) : (
                <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-white">
                  LeadsIQ
                </span>
              )}
            </div>
            {(needsCompanyName || isOtpSent) && (
              <h2
                className="text-2xl font-bold text-center text-gray-900 dark:text-white"
                style={homeConfig?.textColor ? { color: homeConfig.textColor } : {}}
              >
                {needsCompanyName ? "Complete Your Profile" : "Enter Verification Code"}
              </h2>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/50 border-l-4 border-red-400 p-4 rounded">
              <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
            </div>
          )}

          {needsCompanyName ? (
            <CompanyForm
              companyName={companyName}
              loading={loading}
              onCompanyNameChange={setCompanyName}
              onSubmit={handleCompanySubmit}
            />
          ) : !isOtpSent ? (
            <>
              <LoginForm
                ref={loginFormRef}
                phone={phone}
                loading={loading}
                onPhoneChange={setPhone}
                onOtpSubmit={handleSendOTP}
                onPasskeyLogin={handlePasskeyLogin}
                onPasskeyCheckComplete={handlePasskeyCheckComplete}
                onManualPhoneInput={() => setIsQuickLogin(false)}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
              />

              {/* HIDDEN: "OR" divider + Continue with WhatsApp button */}
              {false && (<>
              <div className="grid grid-cols-[1fr_max-content_1fr] items-center text-gray-500 dark:text-gray-500">
                <div className="h-px bg-gray-200 dark:bg-dark-tertiary"></div>
                <div className="mx-6 text-[13px] font-medium uppercase">OR</div>
                <div className="h-px bg-gray-200 dark:bg-dark-tertiary"></div>
              </div>

              <button
                type="button"
                onClick={handleWhatsAppOTP}
                disabled={loading || whatsAppLoading}
                className="mt-4 w-full flex items-center justify-center gap-3 px-4 py-3 border rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: v("secondaryButtonBg"),
                  color: v("secondaryButtonText"),
                  borderColor: v("inputBorder"),
                }}
              >
                {whatsAppLoading ? (
                  <>
                    <svg
                      className="animate-spin h-5 w-5 text-gray-500"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    <span className="font-medium">
                      Connecting...
                    </span>
                  </>
                ) : (
                  <>
                    <svg
                      className="h-5 w-5 text-green-500"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    <span className="font-medium">
                      Continue with WhatsApp
                    </span>
                  </>
                )}
              </button>
              </>)}
            </>
          ) : (
            <OtpForm
              otp={otp}
              loading={loading}
              onOtpChange={handleOtpChange}
              onSubmit={handleVerifyOTP}
              onBack={() => {
                setIsOtpSent(false);
                handleOtpChange("");
                setError(null);
                setIsWhatsAppOTP(false); // Reset WhatsApp OTP state
              }}
              onFocus={() => setIsTyping(true)}
              onBlur={() => setIsTyping(false)}
            />
          )}

          {/* Privacy Policy Note - Footer style */}
          {!needsCompanyName && (
            <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                <span className="inline-flex align-text-bottom mr-1">
                  <svg
                    className="h-4 w-4 text-gray-500 dark:text-gray-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
                By continuing, you allow {wlCompanyName} to contact you for
                scheduling and marketing, as per our{" "}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary-600 dark:hover:text-primary-400 transition-colors underline underline-offset-2"
                >
                  Privacy Policy
                </a>
                .
              </p>
              <p className="text-[10px] text-center text-gray-400 dark:text-gray-500 mt-2">
                v{process.env.NEXT_PUBLIC_APP_VERSION}
              </p>
            </div>
          )}
        </div>
      </div>
    </div >
  );
}
