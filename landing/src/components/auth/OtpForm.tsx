import React from "react";
import { Loader2 } from "lucide-react";

interface OtpFormProps {
  otp: string;
  loading: boolean;
  onOtpChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onBack: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function OtpForm({
  otp,
  loading,
  onOtpChange,
  onSubmit,
  onBack,
  onFocus,
  onBlur,
}: OtpFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="otp"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Verification Code
        </label>
        <input
          id="otp"
          type="text"
          required
          autoFocus
          autoComplete="one-time-code"
          value={otp}
          onChange={(e) => onOtpChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className="block w-full px-3 py-2 border-0 rounded-md leading-5 placeholder-gray-500 focus:outline-none focus:ring-0 sm:text-sm"
          style={{
            backgroundColor: "var(--lp-input-bg)",
            borderColor: "var(--lp-input-border)",
            color: "var(--lp-input-text)",
          }}
          placeholder="Enter verification code"
        />
      </div>

      <div className="space-y-3">
        <button
          type="submit"
          disabled={loading}
          className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-0 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            "Verify & Sign In"
          )}
        </button>

        <button
          type="button"
          onClick={onBack}
          className="w-full flex justify-center py-2.5 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-secondary hover:bg-gray-50 dark:hover:bg-dark-tertiary focus:outline-none focus:ring-0 focus:ring-offset-0 transition-colors duration-200"
        >
          Change Phone Number
        </button>
      </div>
    </form>
  );
}
