import React, {
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from "react";
import { Phone, Fingerprint, Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";
import { CountrySelect } from "../shared/CountrySelect";
import { usePasskey } from "../../hooks/usePasskey";
import { showErrorToast } from "../../utils/toast";
import "flag-icons/css/flag-icons.min.css";

interface LoginFormWithPasskeyProps {
  phone: string;
  loading: boolean;
  onPhoneChange: (phone: string) => void;
  onOtpSubmit: (e: React.FormEvent) => void;
  onPasskeyLogin: (phone: string) => Promise<void>;
  onPasskeyCheckComplete?: (hasPasskey: boolean, phone: string) => void;
  onManualPhoneInput?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface LoginFormHandle {
  setCountryAndPhone: (code: string, number: string) => void;
  triggerValidation: () => void;
}

const COUNTRY_CODES = [
  { code: "+91", country: "India" },
  { code: "+1", country: "USA" },
  { code: "+44", country: "UK" },
  { code: "+61", country: "Australia" },
  { code: "+86", country: "China" },
  { code: "+81", country: "Japan" },
  { code: "+49", country: "Germany" },
  { code: "+33", country: "France" },
  { code: "+7", country: "Russia" },
  { code: "+971", country: "UAE" },
  { code: "+65", country: "Singapore" },
  { code: "+60", country: "Malaysia" },
  { code: "+66", country: "Thailand" },
  { code: "+82", country: "South Korea" },
  { code: "+852", country: "Hong Kong" },
];
export const LoginForm = forwardRef<LoginFormHandle, LoginFormWithPasskeyProps>(
  (
    {
      phone,
      loading,
      onPhoneChange,
      onOtpSubmit,
      onPasskeyLogin,
      onPasskeyCheckComplete,
      onManualPhoneInput,
      onFocus,
      onBlur,
    },
    ref,
  ) => {
    const { checkPasskeyAvailability } = usePasskey();
    const [selectedCode, setSelectedCode] = useState("91");
    const [localPhone, setLocalPhone] = useState("");
    const [passkeyAvailable, setPasskeyAvailable] = useState(false);
    const [checkingPasskey, setCheckingPasskey] = useState(false);
    const [phoneError, setPhoneError] = useState<string | null>(null);
    const [passkeyCheckComplete, setPasskeyCheckComplete] = useState(false); // NEW: Track if check is done
    // Add iso state
    const [selectedIso, setSelectedIso] = useState("IN");

    // Rate limiting for passkey checks
    const [passkeyCache, setPasskeyCache] = useState<Map<string, boolean>>(
      new Map(),
    );
    const [passkeyCheckCount, setPasskeyCheckCount] = useState(0);
    const [rateLimitResetTime, setRateLimitResetTime] = useState<number | null>(
      null,
    );
    const [isRateLimited, setIsRateLimited] = useState(false);
    const MAX_PASSKEY_CHECKS = 10; // Max unique checks per window
    const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds

    // Reset rate limit after time window
    useEffect(() => {
      if (rateLimitResetTime && Date.now() >= rateLimitResetTime) {
        setPasskeyCheckCount(0);
        setRateLimitResetTime(null);
        setIsRateLimited(false);
        setPasskeyCache(new Map()); // Clear cache on reset
      }

      if (rateLimitResetTime) {
        const timer = setInterval(() => {
          if (Date.now() >= rateLimitResetTime) {
            setPasskeyCheckCount(0);
            setRateLimitResetTime(null);
            setIsRateLimited(false);
            setPasskeyCache(new Map());
          }
        }, 1000);
        return () => clearInterval(timer);
      }
    }, [rateLimitResetTime]);

    // handle phone input
    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digitsOnly = e.target.value.replace(/\D/g, "");
      setLocalPhone(digitsOnly);
      onPhoneChange(`+${selectedCode}${digitsOnly}`);

      // Notify parent that user is manually typing (to reset quick login state)
      if (onManualPhoneInput) {
        onManualPhoneInput();
      }

      // Remove strict length validation for international numbers
      if (digitsOnly.length < 1) {
        setPhoneError("Enter Valid Phone Number");
      } else {
        setPhoneError(null);
      }

      setPasskeyAvailable(false);
      setPasskeyCheckComplete(false); // NEW: Reset check status when phone changes
    };

    // debounce passkey check
    useEffect(() => {
      const debounceTimer = setTimeout(async () => {
        // Only require at least 1 digit for passkey check
        if (localPhone.length >= 1) {
          const formattedPhone = `+${selectedCode}${localPhone}`;

          // Check if we already have this result cached
          if (passkeyCache.has(formattedPhone)) {
            const cachedResult = passkeyCache.get(formattedPhone)!;
            setPasskeyAvailable(cachedResult);
            setPasskeyCheckComplete(true); // NEW: Mark as complete
            console.log(
              `Using cached result for ${formattedPhone}: ${cachedResult}`,
            );
            return;
          }

          // Check rate limit for NEW checks only
          if (isRateLimited) {
            console.log("Rate limited: Too many passkey checks");
            setPasskeyAvailable(false);
            setPasskeyCheckComplete(true); // NEW: Mark as complete even if rate limited
            return;
          }

          setCheckingPasskey(true);
          setPasskeyCheckComplete(false); // NEW: Mark as checking

          let hasPasskeyResult = false;

          try {
            // Check if we need to reset the counter (after time window)
            if (rateLimitResetTime && Date.now() >= rateLimitResetTime) {
              setPasskeyCheckCount(0);
              setRateLimitResetTime(null);
              setIsRateLimited(false);
              setPasskeyCache(new Map());
            }

            const currentCount = passkeyCheckCount;

            // Set rate limit if exceeded
            if (currentCount >= MAX_PASSKEY_CHECKS) {
              setIsRateLimited(true);
              const resetTime = Date.now() + RATE_LIMIT_WINDOW;
              setRateLimitResetTime(resetTime);
              showErrorToast(
                `Too many attempts. Please wait ${Math.ceil(
                  RATE_LIMIT_WINDOW / 1000,
                )} seconds.`,
              );
              setPasskeyAvailable(false);
              setCheckingPasskey(false);
              setPasskeyCheckComplete(true); // NEW: Mark as complete
              return;
            }

            // Make the actual API call for new phone number
            const result = await checkPasskeyAvailability(formattedPhone);
            hasPasskeyResult = result.hasPasskey;
            setPasskeyAvailable(result.hasPasskey);

            // Cache the result
            setPasskeyCache((prev) => {
              const newCache = new Map(prev);
              newCache.set(formattedPhone, result.hasPasskey);
              return newCache;
            });

            // Increment check count AFTER successful check
            const newCount = currentCount + 1;
            setPasskeyCheckCount(newCount);

            // Start timer for first check in window
            if (newCount === 1 && !rateLimitResetTime) {
              setRateLimitResetTime(Date.now() + RATE_LIMIT_WINDOW);
            }

            console.log(
              `New check for ${formattedPhone}: ${result.hasPasskey} (${newCount}/${MAX_PASSKEY_CHECKS})`,
            );
          } catch (error: any) {
            console.error("Error checking passkey:", error);

            // Show user-friendly error for reCAPTCHA failures
            if (error.message?.includes("Security verification")) {
              showErrorToast(error.message);
            } else if (error.message?.includes("CAP.js instance not loaded")) {
              showErrorToast(
                "Security verification not ready. Please refresh the page.",
              );
            }

            setPasskeyAvailable(false);
          } finally {
            setCheckingPasskey(false);
            setPasskeyCheckComplete(true); // NEW: Always mark as complete

            // Notify parent about passkey check result
            if (onPasskeyCheckComplete) {
              onPasskeyCheckComplete(hasPasskeyResult, formattedPhone);
            }
          }
        } else {
          setPasskeyAvailable(false);
          setPasskeyCheckComplete(false); // NEW: Reset if phone is too short
          // Notify parent - no passkey (phone too short)
          if (onPasskeyCheckComplete) {
            onPasskeyCheckComplete(false, localPhone);
          }
        }
      }, 500);

      return () => clearTimeout(debounceTimer);
    }, [
      localPhone,
      selectedCode,
      checkPasskeyAvailability,
      passkeyCheckCount,
      rateLimitResetTime,
      isRateLimited,
      passkeyCache,
    ]);

    const handlePasskeyClick = async () => {
      if (localPhone.length < 1) {
        showErrorToast("Please enter a valid phone number");
        return;
      }

      const formattedPhone = `+${selectedCode}${localPhone}`;
      await onPasskeyLogin(formattedPhone);
    };

    // Update validation logic
    const isPhoneValid = localPhone.length >= 1 && !phoneError;
    const canProceed = isPhoneValid && passkeyCheckComplete; // NEW: Can only proceed after check is done

    // Expose setCountryAndPhone to parent via ref
    useImperativeHandle(ref, () => ({
      setCountryAndPhone: (code: string, number: string) => {
        setSelectedCode(code);
        setLocalPhone(number);
        // Find the ISO code for the selected code
        const found = COUNTRY_CODES.find(
          (c) => c.code.replace("+", "") === code,
        );
        setSelectedIso(found?.code || "IN");
        onPhoneChange(`+${code}${number}`);
        // NEW: Trigger validation and passkey check
        setPhoneError(null);
        setPasskeyAvailable(false);
        setPasskeyCheckComplete(false);
      },
      // NEW: Expose a trigger for validation/passkey check
      triggerValidation: () => {
        // This will re-run the validation and passkey check
        setPasskeyAvailable(false);
        setPasskeyCheckComplete(false);
        // This will trigger the useEffect for passkey check
        setLocalPhone((prev) => prev);
      },
    }));

    // If parent clears phone, also clear localPhone
    useEffect(() => {
      if (phone === "") {
        setLocalPhone("");
      }
    }, [phone]);

    return (
      <form onSubmit={onOtpSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="phone"
            className="block text-sm font-medium mb-2"
            style={{ color: "var(--lp-input-label)" }}
          >
            Phone Number
          </label>
          <div className="flex">
            <CountrySelect
              value={selectedCode}
              onChange={(value) => {
                setSelectedCode(value);
                // Find the ISO code for the selected code
                const found = COUNTRY_CODES.find(
                  (c) => c.code.replace("+", "") === value,
                );
                setSelectedIso(found?.code || "IN");
                onPhoneChange(`+${value}${localPhone}`);
                setPasskeyAvailable(false);
                setPasskeyCheckComplete(false); // NEW: Reset on country change
              }}
              disabled={loading || checkingPasskey}
              // iso={selectedIso} // Pass iso to CountrySelect
            />
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Phone className="h-5 w-5 text-gray-400" />
              </div>
              <input
                name="phone"
                type="tel"
                id="phone"
                required
                autoFocus
                autoComplete="off"
                value={localPhone}
                onChange={handlePhoneChange}
                onFocus={onFocus}
                onBlur={onBlur}
                className={cn(
                  "block w-full pl-10 pr-3 py-2.5 border border-l-0 rounded-l-none rounded-r-lg shadow-sm",
                  "placeholder-gray-400 dark:placeholder-gray-500",
                  "focus:outline-none focus:ring-0",
                  "transition-colors duration-200",
                  phoneError ? "border-red-500 dark:border-red-500" : "",
                )}
                style={{
                  backgroundColor: "var(--lp-input-bg)",
                  borderColor: phoneError ? undefined : "var(--lp-input-border)",
                  color: "var(--lp-input-text)",
                }}
                placeholder="Enter your phone number"
              />
              {checkingPasskey && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                  <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {phoneError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">
              {phoneError}
            </p>
          )}

          {/* NEW: Show checking message more prominently */}

          {/* Show passkey available message */}
          {isPhoneValid && passkeyCheckComplete && passkeyAvailable && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <Fingerprint className="h-3 w-3" />
              Passkey available for this number
            </p>
          )}

          {isRateLimited && rateLimitResetTime && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
              ⚠️ Too many attempts. Try again in{" "}
              {Math.ceil((rateLimitResetTime - Date.now()) / 1000)}s
            </p>
          )}

        </div>

        <div className="space-y-3">
          {/* Passkey button - Only show when passkey is available */}
          {isPhoneValid && passkeyAvailable && passkeyCheckComplete && (
            <>
              <button
                type="button"
                onClick={handlePasskeyClick}
                disabled={loading}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2.5 text-white font-medium rounded-lg",
                  "focus:outline-none focus:ring-2 focus:ring-offset-0focus:ring-gray-600 transition-all duration-200 shadow-sm",
                  loading
                    ? "bg-gray-300 dark:bg-dark-tertiary cursor-not-allowed opacity-60"
                    : "bg-primary-600 hover:bg-primary-700 cursor-pointer",
                )}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-5 w-5" />
                    <span>Sign in with Passkey</span>
                  </>
                )}
              </button>

              {/* Divider - Only show when passkey button is visible */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-gray-50 dark:bg-dark-primary text-gray-500 dark:text-gray-400">
                    Or continue with OTP
                  </span>
                </div>
              </div>
            </>
          )}

          {/* OTP Button - Disabled until passkey check is complete */}
          <button
            type="submit"
            disabled={loading || !canProceed || checkingPasskey}
            className={cn(
              "w-full px-4 py-2.5 border font-medium rounded-lg",
              "focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-gray-600 transition-all duration-200 shadow-sm",
              canProceed && !loading && !checkingPasskey
                ? "cursor-pointer"
                : "cursor-not-allowed opacity-60",
            )}
            style={{
              backgroundColor: "var(--lp-btn-primary-bg)",
              borderColor: "var(--lp-input-border)",
              color: "var(--lp-btn-primary-text)",
            }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Sending...
              </span>
            ) : checkingPasskey ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin" />
                Checking for passkey...
              </span>
            ) : (
              "Send OTP"
            )}
          </button>
        </div>

        {/* Helper text - UPDATED */}
        {/* {!isPhoneValid && (
          <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
            Enter your phone number to continue
          </p>
        )} */}
      </form>
    );
  },
);
