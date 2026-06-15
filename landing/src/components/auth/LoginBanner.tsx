import { Mic, Shield, Zap, Phone, type LucideIcon } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "../../utils/cn";
import SoftAurora from "../agents/SoftAurora";
import { v } from "./themeTokens";

export interface BannerFeatureConfig {
  icon: "phone" | "zap" | "shield" | "mic";
  title: string;
  text: string;
  /** Optional override for the card visual. If null/empty, defaults are used. */
  image?: string | null;
}

interface LoginBannerProps {
  customLogo?: string | null;
  isLoading?: boolean;
  companyName?: string;
  isTyping?: boolean;
  isTypingOtp?: boolean;
  loginResult?: "success" | "error" | null;
  homeConfig?: {
    bannerFeatures?: BannerFeatureConfig[];
    showAurora?: boolean;
    /** Optional background image URL for the left banner panel. */
    backgroundImage?: string | null;
    /** How the background image fills the panel. Default "cover". */
    backgroundFit?: "cover" | "contain";
    /** CSS background-position for the image. Default "center". */
    backgroundPosition?: string;
    /** Show the rotating feature-card carousel on the left banner. Default true. */
    showFeatureCards?: boolean;
  } | null;
}

const ICON_MAP: Record<BannerFeatureConfig["icon"], LucideIcon> = {
  mic: Mic,
  phone: Phone,
  zap: Zap,
  shield: Shield,
};

const DEFAULT_FEATURES: BannerFeatureConfig[] = [
  {
    icon: "zap",
    title: "Qualified Leads, On Autopilot",
    text: "LeadsIQ finds who to target and brings you ready-to-talk replies",
  },
  {
    icon: "phone",
    title: "Outreach That Writes Itself",
    text: "Personalized messages crafted for every prospect, automatically",
  },
  {
    icon: "shield",
    title: "Pay Only For Interest",
    text: "No contracts, no setup fees — you only pay for interested replies",
  },
];

const DEFAULT_VISUAL_IMAGES = [
  "https://res.cloudinary.com/serviceconnect/image/upload/v1774644301/ai_ask_zszjk6.jpg",
  "https://res.cloudinary.com/serviceconnect/image/upload/v1774644648/From_Main_Klickpin_CF-_glassnodecom_-_7Gg6ToiWc_bwvaxe.jpg",
  null, // index 2 falls back to cert-grid SecurityShield when no override
];

/* ── Generic image visual (used for cards 1 & 2, and as override for card 3) ── */
function ImageVisual({ src, alt, isActive }: { src: string; alt: string; isActive: boolean }) {
  return (
    <div className="flex items-center justify-center h-full p-6">
      <img
        src={src}
        alt={alt}
        className={cn(
          "w-full h-full object-contain rounded-xl transition-all duration-700",
          isActive ? "opacity-90 scale-100" : "opacity-0 scale-95"
        )}
      />
    </div>
  );
}

/* ── Security Certifications Animation ── */
const certLogos = [
  { src: "https://cdn.vocallabs.ai/landing_page/cbed390f-b274-44be-8ff1-89b519c10c71.png", label: "AICPA SOC" },
  { src: "https://cdn.vocallabs.ai/landing_page/e8aba454-1fa4-4401-8d73-03fc46d27a2f.png", label: "ISO 27001" },
  { src: "https://cdn.vocallabs.ai/landing_page/04065876-42fd-46a5-9c23-1fb7653b9bb0.png", label: "GDPR" },
  { src: "https://cdn.vocallabs.ai/landing_page/da0c8abe-8dde-42d3-a592-954ab51f9829.png", label: "VAPT" },
  { src: "https://cdn.vocallabs.ai/landing_page/44fd1312-c8f0-423a-a95c-da2063c858cc.png", label: "Certiport" },
  { src: "https://cdn.vocallabs.ai/landing_page/13a80d47-7833-419f-b88e-0ae83ebe04c2.png", label: "Joint Commission" },
  { src: "https://cdn.vocallabs.ai/landing_page/0ccd4bdb-d950-401d-acb4-0cd0867116c4.png", label: "AICPA" },
];

function SecurityShield({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
      <div className="flex items-center justify-center gap-5 flex-wrap">
        {certLogos.map((cert, i) => (
          <div
            key={i}
            className={cn(
              "w-14 h-14 rounded-xl flex items-center justify-center transition-all p-2",
              isActive
                ? "bg-white/[0.07] border border-white/10 opacity-100 scale-100"
                : "bg-white/[0.02] border border-white/[0.03] opacity-0 scale-75"
            )}
            style={{
              transitionDuration: `${500 + i * 120}ms`,
              transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          >
            <img
              src={cert.src}
              alt={cert.label}
              className={cn(
                "w-full h-full object-contain transition-all duration-700",
                isActive ? "opacity-80 grayscale-0" : "opacity-0 grayscale"
              )}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Pad/truncate config features to exactly 3 cards, falling back to defaults. */
function resolveFeatures(configured?: BannerFeatureConfig[]): BannerFeatureConfig[] {
  const out: BannerFeatureConfig[] = [];
  for (let i = 0; i < 3; i++) {
    const c = configured?.[i];
    if (c && c.title && c.text) {
      out.push(c);
    } else {
      out.push(DEFAULT_FEATURES[i]);
    }
  }
  return out;
}

export function LoginBanner({
  customLogo,
  isLoading,
  companyName = "LeadsIQ",
  homeConfig,
}: LoginBannerProps) {
  const features = resolveFeatures(homeConfig?.bannerFeatures);
  const [activeCard, setActiveCard] = useState(0);
  const [entered, setEntered] = useState([false, false, false]);

  useEffect(() => {
    const timers = features.map((_, i) =>
      setTimeout(() => {
        setEntered((prev) => {
          const next = [...prev];
          next[i] = true;
          return next;
        });
      }, 400 + i * 300)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCard((prev) => (prev + 1) % features.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [features.length]);

  return (
    <div
      className="hidden md:flex md:w-[60%] flex-col justify-between relative overflow-hidden"
      style={{ backgroundColor: v("leftPanelBg") }}
    >
      {/* Custom background image — sits above the base color, below aurora & content */}
      {homeConfig?.backgroundImage && homeConfig.backgroundImage.trim() && (
        <div
          className="absolute inset-0 z-0 bg-no-repeat"
          style={{
            backgroundImage: `url(${homeConfig.backgroundImage})`,
            backgroundSize: homeConfig.backgroundFit === "contain" ? "contain" : "cover",
            backgroundPosition: homeConfig.backgroundPosition || "center",
          }}
        />
      )}

      {/* SoftAurora background — togglable via homeConfig.showAurora */}
      {homeConfig?.showAurora !== false && (
        <div
          className="absolute inset-0 z-0 opacity-50"
          style={{
            maskImage:
              "radial-gradient(ellipse 90% 60% at 50% 50%, black 20%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 60% at 50% 50%, black 20%, transparent 80%)",
          }}
        >
          <SoftAurora
            speed={0.4}
            scale={2.5}
            brightness={1.3}
            color1="#7c3aed"
            color2="#c026d3"
            noiseFrequency={2}
            noiseAmplitude={1}
            bandHeight={0.5}
            bandSpread={1.2}
            octaveDecay={0.1}
            layerOffset={0}
            colorSpeed={0.8}
            enableMouseInteraction={false}
            mouseInfluence={0}
          />
        </div>
      )}

      {/* Logo */}
      <div className="relative z-10 px-10 pt-10">
        <div className="flex items-center min-h-[48px]">
          {isLoading ? (
            <div className="h-9 w-36 bg-white/10 rounded animate-pulse" />
          ) : customLogo ? (
            <img src={customLogo} alt="Company Logo" className="h-9" />
          ) : (
            <span className="text-2xl font-semibold tracking-tight text-white">
              LeadsIQ
            </span>
          )}
        </div>
      </div>

      {/* Cards (feature carousel) — togglable via homeConfig.showFeatureCards */}
      {homeConfig?.showFeatureCards !== false && (
      <div className="relative z-10 flex-1 flex items-center justify-center px-10">
        <div className="w-full max-w-[420px] relative" style={{ height: 440 }}>
          {features.map((feature, idx) => {
            const Icon = ICON_MAP[feature.icon] || Shield;
            const isActive = activeCard === idx;
            const overrideImage = feature.image && feature.image.trim() ? feature.image : null;
            const defaultImage = DEFAULT_VISUAL_IMAGES[idx];
            const visualImage = overrideImage || defaultImage;

            return (
              <div
                key={idx}
                onClick={() => setActiveCard(idx)}
                className={cn(
                  "absolute inset-0 rounded-2xl overflow-hidden cursor-pointer transition-all duration-700 ease-out flex flex-col",
                  entered[idx] ? "opacity-100" : "opacity-0 translate-y-12",
                  isActive
                    ? "opacity-100 scale-100 z-20"
                    : "opacity-0 scale-95 z-10 pointer-events-none"
                )}
                style={{
                  backgroundColor: v("cardBg"),
                  border: isActive
                    ? "1px solid rgba(255,255,255,0.08)"
                    : "1px solid rgba(255,255,255,0.03)",
                  boxShadow: isActive
                    ? "0 25px 50px -12px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)"
                    : "none",
                }}
              >
                <div className="flex-1 relative overflow-hidden">
                  <div
                    className="absolute bottom-0 left-0 right-0 h-1/4 z-10 pointer-events-none"
                    style={{
                      backgroundImage: `linear-gradient(to bottom, transparent, ${v("cardBg")})`,
                    }}
                  />
                  {visualImage ? (
                    <ImageVisual src={visualImage} alt={feature.title} isActive={isActive} />
                  ) : (
                    <SecurityShield isActive={isActive} />
                  )}
                </div>

                <div className="relative z-10 px-6 pb-6">
                  <h3
                    className="text-lg font-semibold mb-2 transition-colors duration-500 flex items-center gap-2"
                    style={{
                      color: v("cardTitleText"),
                      opacity: isActive ? 1 : 0.4,
                    }}
                  >
                    <Icon className="w-4 h-4 opacity-70" />
                    {feature.title}
                  </h3>
                  <p
                    className="text-sm leading-relaxed transition-colors duration-500"
                    style={{
                      color: v("cardBodyText"),
                      opacity: isActive ? 1 : 0.4,
                    }}
                  >
                    {feature.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Progress dots — hidden alongside the carousel */}
      {homeConfig?.showFeatureCards !== false && (
      <div className="relative z-10 flex items-center justify-center gap-3 pb-6">
        {features.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setActiveCard(idx)}
            className={cn(
              "rounded-full transition-all duration-500",
              activeCard === idx
                ? "w-8 h-2 bg-white"
                : "w-2 h-2 bg-white/15 hover:bg-white/30"
            )}
          />
        ))}
      </div>
      )}

      {/* Footer */}
      <div
        className="relative z-10 px-10 py-6 border-t"
        style={{ borderColor: v("inputBorder") }}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs" style={{ color: v("footerText") }}>
            © {new Date().getFullYear()} {companyName}. All rights reserved.
          </p>
          <div
            className="flex items-center space-x-6 text-xs"
            style={{ color: v("footerText") }}
          >
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-100 transition-opacity"
            >
              Privacy Policy
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
