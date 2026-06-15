import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";
import { Globe, ChevronDown, Loader2, Search, X } from "lucide-react";
import { authApi } from "../../services/auth/api/authApi";
import { buttonAnalytics } from "../../services/analytics/analytics";
import "flag-icons/css/flag-icons.min.css";

interface CountryCode {
  country_code: string;
  phone_code: string;
  country_name?: string;
}

interface CountrySelectProps {
  value: string;
  onChange: (dialCode: string) => void;
  className?: string;
  disabled?: boolean;
}

const POPULAR_COUNTRIES: CountryCode[] = [
  { country_code: "IN", phone_code: "91", country_name: "India" },
  { country_code: "US", phone_code: "1", country_name: "United States" },
  { country_code: "GB", phone_code: "44", country_name: "United Kingdom" },
  { country_code: "CA", phone_code: "1", country_name: "Canada" },
  { country_code: "AU", phone_code: "61", country_name: "Australia" },
];

export function CountrySelect({
  value,
  onChange,
  className,
  disabled = false,
}: CountrySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [countries, setCountries] = useState<CountryCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The dropdown renders in a portal with fixed positioning so it's never
  // clipped by an ancestor's overflow (e.g. the modal's scroll container).
  const [coords, setCoords] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 320 });

  const updateCoords = useCallback(() => {
    const el = buttonRef.current;
    if (!el || typeof window === "undefined") return;
    const r = el.getBoundingClientRect();
    const width = 320;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setCoords({ top: r.bottom + 4, left, width });
  }, []);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        setLoading(true);
        setError(null);
        const codes = await authApi.getCountryCodes();
        // Normalize: backend returns phone_code as a number, but POPULAR_COUNTRIES
        // and the `value` prop are strings — coerce so equality checks line up.
        const normalized: CountryCode[] = (codes ?? []).map((c: CountryCode) => ({
          ...c,
          country_code: String(c.country_code ?? "").trim().toUpperCase(),
          phone_code: String(c.phone_code ?? "").replace(/^\+/, "").trim(),
        }));
        setCountries(normalized);
        setRetryCount(0); // Reset retry count on successful fetch
      } catch (err) {
        console.error("Error fetching country codes:", err);
        setError("Failed to load country codes");

        // Implement retry with exponential backoff
        if (retryCount < 3) {
          // Maximum 3 retries
          const timeout = Math.pow(2, retryCount) * 1000; // Exponential backoff: 1s, 2s, 4s
          setTimeout(() => {
            setRetryCount((prev) => prev + 1);
          }, timeout);
        }

        // Use popular countries as fallback
        setCountries(POPULAR_COUNTRIES);
      } finally {
        setLoading(false);
      }
    };

    fetchCountries();
  }, [retryCount]);

  const selectedCountry =
    countries.find((c) => c.phone_code === value) ||
    POPULAR_COUNTRIES.find((c) => c.phone_code === value);

  // Rank-based filter: exact > prefix > substring matches across name/code/phone.
  const filterCountries = (countryList: CountryCode[], term: string) => {
    if (!term) return countryList;

    const lower = term.toLowerCase();
    const phoneTerm = term.replace(/^\+/, "").replace(/\s/g, "");
    const hasPhoneTerm = /^\d+$/.test(phoneTerm);

    const scored: { country: CountryCode; score: number }[] = [];
    for (const country of countryList) {
      const name = country.country_name?.toLowerCase() ?? "";
      const code = country.country_code.toLowerCase();
      const phone = String(country.phone_code);

      let score = -1;
      if (code === lower) score = 0;
      else if (name === lower) score = 1;
      else if (hasPhoneTerm && phone === phoneTerm) score = 2;
      else if (name.startsWith(lower)) score = 3;
      else if (code.startsWith(lower)) score = 4;
      else if (hasPhoneTerm && phone.startsWith(phoneTerm)) score = 5;
      else if (name.includes(lower)) score = 6;
      else if (hasPhoneTerm && phone.includes(phoneTerm)) score = 7;

      if (score >= 0) scored.push({ country, score });
    }

    scored.sort((a, b) => a.score - b.score);
    return scored.map((s) => s.country);
  };

  const trimmedSearch = searchTerm.trim();

  const filteredPopularCountries = useMemo(
    () => filterCountries(POPULAR_COUNTRIES, trimmedSearch),
    [trimmedSearch]
  );

  const filteredOtherCountries = useMemo(() => {
    const seen = new Set<string>();
    const others: CountryCode[] = [];
    for (const country of countries) {
      const isPopular = POPULAR_COUNTRIES.some(
        (popular) =>
          popular.country_code === country.country_code &&
          popular.phone_code === country.phone_code
      );
      if (isPopular) continue;

      const key = `${country.country_code}-${country.phone_code}`;
      if (seen.has(key)) continue;
      seen.add(key);
      others.push(country);
    }
    return filterCountries(others, trimmedSearch);
  }, [countries, trimmedSearch]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (buttonRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setIsOpen(false);
      setSearchTerm("");
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep the portal dropdown anchored to the trigger while open (covers modal
  // scroll + window resize). Capture-phase scroll catches inner scroll containers.
  useEffect(() => {
    if (!isOpen) return;
    updateCoords();
    const onMove = () => updateCoords();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [isOpen, updateCoords]);

  // Function to render SVG flag using flag-icons
  const renderFlag = (countryCode: string) => {
    if (!countryCode) return <Globe className="w-5 h-5 text-gray-400" />;

    return (
      <span
        className={`fi fi-${countryCode.toLowerCase()} w-5 h-5 rounded-sm`}
        style={{
          width: "20px",
          height: "15px",
          display: "inline-block",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        title={countryCode}
      />
    );
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (!disabled) {
            buttonAnalytics.trackButtonClick("Button Clicked", {
              button_name: "Toggle Country Select",
              page_name: "Country Select",
              feature_area: "UI",
              current_value: value,
              is_open: !isOpen,
            });
            setIsOpen(!isOpen);
          }
        }}
        disabled={disabled}
        className={cn(
          "w-full h-full flex items-center justify-between px-3 py-2 text-sm rounded-none",
          "border border-gray-300 dark:border-gray-600",
          "focus:outline-none focus:ring-0 focus:ring-offset-0 focus:border-primary-600",
          "transition-colors duration-150",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        style={{
          backgroundColor: "var(--lp-input-bg)",
          borderColor: "var(--lp-input-border)",
          color: "var(--lp-input-text)",
        }}
      >
        <div className="flex items-center space-x-2">
          {selectedCountry ? (
            renderFlag(selectedCountry.country_code)
          ) : (
            <Globe className="w-5 h-5" style={{ color: "var(--lp-input-text)" }} />
          )}
          <span className="font-medium" style={{ color: "var(--lp-input-text)" }}>+{value}</span>
        </div>
        <ChevronDown className="w-4 h-4 ml-1" style={{ color: "var(--lp-input-text)" }} />
      </button>

      {isOpen && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: coords.top, left: coords.left, width: coords.width, zIndex: 70 }}
          className={cn(
            "rounded-none shadow-lg",
            "bg-white dark:bg-dark-secondary",
            "border border-gray-200 dark:border-gray-700",
            "text-gray-800 dark:text-gray-100"
          )}
        >
          {/* Search Input */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={cn(
                  "block w-full pl-9 pr-8 py-2 text-sm rounded-none border",
                  "border-gray-300 dark:border-gray-600",
                  "focus:ring-0 focus:ring-offset-0 focus:outline-none focus:border-primary-600",
                  "bg-white dark:bg-dark-tertiary text-gray-800 dark:text-white",
                  "placeholder-gray-500 dark:placeholder-gray-400"
                )}
                placeholder="Search countries..."
                autoFocus
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
            </div>
          ) : error ? (
            <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 text-center">
              Using fallback country list
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {/* Popular Countries Section - only show if there are matching popular countries */}
              {filteredPopularCountries.length > 0 && !searchTerm && (
                <>
                  <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-dark-border border-b border-gray-300 dark:border-gray-600">
                    Popular Countries
                  </div>
                  {filteredPopularCountries.map((country) => (
                    <button
                      key={`popular-${country.country_code}-${country.phone_code}`}
                      onClick={() => {
                        buttonAnalytics.trackButtonClick("Button Clicked", {
                          button_name: "Select Country",
                          page_name: "Country Select",
                          feature_area: "UI",
                          country_code: country.country_code,
                          phone_code: country.phone_code,
                          country_name: country.country_name,
                        });
                        onChange(country.phone_code);
                        setIsOpen(false);
                        setSearchTerm("");
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 flex items-center space-x-3",
                        "hover:bg-gray-100 dark:hover:bg-dark-tertiary",
                        "transition-colors duration-150"
                      )}
                    >
                      {renderFlag(country.country_code)}
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">
                        {country.country_name}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        +{country.phone_code}
                      </span>
                    </button>
                  ))}
                </>
              )}

              {/* All Countries Section */}
              {(filteredOtherCountries.length > 0 || searchTerm) && (
                <>
                  {!searchTerm && filteredPopularCountries.length > 0 && (
                    <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-dark-border border-b border-gray-300 dark:border-gray-600">
                      All Countries
                    </div>
                  )}

                  {/* Show popular countries in search results */}
                  {searchTerm &&
                    filteredPopularCountries.map((country) => (
                      <button
                        key={`search-popular-${country.country_code}-${country.phone_code}`}
                        onClick={() => {
                          buttonAnalytics.trackButtonClick("Button Clicked", {
                            button_name: "Select Country",
                            page_name: "Country Select",
                            feature_area: "UI",
                            country_code: country.country_code,
                            phone_code: country.phone_code,
                            country_name: country.country_name,
                            search_term: searchTerm,
                          });
                          onChange(country.phone_code);
                          setIsOpen(false);
                          setSearchTerm("");
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 flex items-center space-x-3",
                          "hover:bg-light-secondary dark:hover:bg-dark-tertiary",
                          "transition-colors duration-150"
                        )}
                      >
                        {renderFlag(country.country_code)}
                        <span className="flex-1 text-sm" style={{ color: "var(--lp-dropdown-text)" }}>
                          {country.country_name}
                        </span>
                        <span className="text-sm text-white">
                          +{country.phone_code}
                        </span>
                      </button>
                    ))}

                  {/* Show filtered other countries */}
                  {filteredOtherCountries.map((country) => (
                    <button
                      key={`${country.country_code}-${country.phone_code}`}
                      onClick={() => {
                        buttonAnalytics.trackButtonClick("Button Clicked", {
                          button_name: "Select Country",
                          page_name: "Country Select",
                          feature_area: "UI",
                          country_code: country.country_code,
                          phone_code: country.phone_code,
                          country_name: country.country_name,
                          search_term: searchTerm,
                        });
                        onChange(country.phone_code);
                        setIsOpen(false);
                        setSearchTerm("");
                      }}
                      className={cn(
                        "w-full text-left px-3 py-2 flex items-center space-x-3",
                        "hover:bg-gray-100 dark:hover:bg-dark-tertiary",
                        "transition-colors duration-150"
                      )}
                    >
                      {renderFlag(country.country_code)}
                      <span className="flex-1 text-sm text-gray-800 dark:text-gray-100">
                        {country.country_name || country.country_code}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        +{country.phone_code}
                      </span>
                    </button>
                  ))}
                </>
              )}

              {/* No results message */}
              {searchTerm &&
                filteredPopularCountries.length === 0 &&
                filteredOtherCountries.length === 0 && (
                  <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    No countries found matching "{searchTerm}"
                  </div>
                )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
