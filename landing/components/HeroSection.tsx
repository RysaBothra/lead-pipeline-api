// Spline's /next entry is a Server Component that internally lazy-loads the
// client-side 3D runtime, so it's imported directly (no next/dynamic — that
// forces a require() resolution the ESM-only package doesn't expose).
import Spline from '@splinetool/react-spline/next';

export default function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-end bg-hero-bg overflow-hidden">
      {/* Spline 3D background */}
      <div className="absolute inset-0">
        <Spline
          scene="https://prod.spline.design/Slk6b8kz3LRlKiyk/scene.splinecode"
          className="w-full h-full"
        />
      </div>

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/30 z-[1] pointer-events-none" />

      {/* Content — anchored bottom-left, clicks pass through except on buttons */}
      <div className="relative z-10 pointer-events-none w-full max-w-[90%] sm:max-w-md lg:max-w-2xl px-6 md:px-10 pb-10 md:pb-10 pt-32">
        <h1
          className="opacity-0 animate-fade-up text-[clamp(3rem,8vw,6rem)] font-bold leading-[1.05] tracking-[-0.05em] text-foreground mb-2 md:mb-4 uppercase"
          style={{ animationDelay: '0.2s' }}
        >
          Leads<span className="text-primary">iq</span>
        </h1>

        <p
          className="opacity-0 animate-fade-up text-foreground/80 text-[clamp(1.125rem,2.5vw,1.875rem)] font-light mb-3 md:mb-6"
          style={{ animationDelay: '0.4s' }}
        >
          We do outbound, correctly.
        </p>

        <p
          className="opacity-0 animate-fade-up text-muted-foreground text-[clamp(0.875rem,1.5vw,1.25rem)] font-light mb-4 md:mb-8"
          style={{ animationDelay: '0.55s' }}
        >
          Enterprise outbound built in days. AI-powered prospecting that finds your real buyers.
          Personalized outreach sent and followed up across your entire market. All of it done
          right, not just fast.
        </p>

        <div
          className="opacity-0 animate-fade-up flex flex-wrap gap-3 font-bold"
          style={{ animationDelay: '0.7s' }}
        >
          <a
            href="/app"
            className="pointer-events-auto bg-primary text-primary-foreground px-6 py-3 md:px-8 md:py-4 text-sm rounded-sm cursor-pointer hover:brightness-110 transition-all active:scale-[0.97]"
          >
            Get Started
          </a>
          <a
            href="/app"
            className="pointer-events-auto bg-white text-background px-6 py-3 md:px-8 md:py-4 text-sm rounded-sm cursor-pointer hover:brightness-90 transition-all active:scale-[0.97]"
          >
            Book a Call
          </a>
        </div>

        <p
          className="opacity-0 animate-fade-up text-muted-foreground/60 text-xs font-light mt-4 md:mt-6"
          style={{ animationDelay: '0.85s' }}
        >
          Automated outbound, end to end. Real buyers. Real replies.
        </p>
      </div>
    </section>
  );
}
