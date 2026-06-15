import React from "react";
import { Building2, Loader2 } from "lucide-react";
import { cn } from "../../utils/cn";

interface CompanyFormProps {
  companyName: string;
  loading: boolean;
  onCompanyNameChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
}

export function CompanyForm({
  companyName,
  loading,
  onCompanyNameChange,
  onSubmit,
}: CompanyFormProps) {
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="companyName"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Company Name
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Building2 className="h-5 w-5 text-gray-400" />
          </div>
          <input
            id="companyName"
            type="text"
            required
            value={companyName}
            onChange={(e) => onCompanyNameChange(e.target.value)}
            className={cn(
              "block w-full pl-10 pr-3 py-2 border-0 rounded-md leading-5",
              "placeholder-gray-500 focus:outline-none focus:ring-0 sm:text-sm"
            )}
            style={{
              backgroundColor: "var(--lp-input-bg)",
              borderColor: "var(--lp-input-border)",
              color: "var(--lp-input-text)",
            }}
            placeholder="Enter your company name"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading || !companyName.trim()}
        className={cn(
          "w-full flex justify-center items-center py-2.5 px-4",
          "border border-transparent rounded-md shadow-sm text-sm font-medium",
          "text-white bg-primary-600 hover:bg-primary-700",
          "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "transition-colors duration-200"
        )}
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          "Complete Setup"
        )}
      </button>
    </form>
  );
}
