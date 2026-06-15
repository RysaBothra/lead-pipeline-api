import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { usePasskey } from "../../hooks/usePasskey";
import { useAuth } from "../../services/auth";
import { toast } from "react-toastify";
import { buttonAnalytics } from "../../services/analytics/analytics";
import { generatePasskeyName } from "../../utils/generatePasskeyName";

interface PasskeyUpsellBannerProps {
  phone: string;
  onDismiss: () => void;
}

export function PasskeyUpsellBanner({
  phone,
  onDismiss,
}: PasskeyUpsellBannerProps) {
  const { user, authToken } = useAuth();
  const { registerPasskey, loading } = usePasskey();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !user || !authToken) {
    return null;
  }

  const handleCreatePasskey = async () => {
    if (!user?.id || !authToken) {
      toast.error("User not authenticated. Please log in again.");
      return;
    }
    buttonAnalytics.trackButtonClick("Button Clicked", {
      button_name: "Create Passkey from Upsell Banner",
      page_name: "Post-Login Banner",
      feature_area: "Security",
      user_id: user.id,
    });
    const deviceName = await generatePasskeyName();
    const success = await registerPasskey(user.id, authToken, deviceName);
    if (success) {
      toast.success(
        "Passkey created successfully! You can now use it to sign in."
      );
      setDismissed(true);
      onDismiss();
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss();
  };

  return (
    <div className="w-full">
      <div className="relative bg-white/[0.03] dark:bg-white/[0.03] backdrop-blur-lg rounded-xl border border-gray-300/80 dark:border-white/20 shadow-2xl overflow-hidden">
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-white transition-colors z-20"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Video showcase area */}
        <div className="relative overflow-hidden h-44 bg-white/[0.03]">
          <video
            src="https://res.cloudinary.com/serviceconnect/video/upload/v1774555420/biometric-Picsart-BackgroundRemover_i5eqnq.webm"
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        </div>

        {/* Text + actions */}
        <div className="px-5 pb-5">
          <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
            Secure Your Account
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
            Enable passkey for faster, passwordless sign-in with biometric authentication.
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="flex-1 px-3 py-2.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white bg-gray-100/50 dark:bg-white/5 hover:bg-gray-200/50 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 rounded-none transition-colors"
            >
              Maybe Later
            </button>
            <button
              onClick={handleCreatePasskey}
              disabled={loading}
              className="flex-1 px-3 py-2.5 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-700 hover:to-primary-600 text-white text-xs font-semibold rounded-none transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              Enable Passkey
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
