// Spline's /next entry is a Server Component that internally lazy-loads the
// client-side 3D runtime, so it's imported directly (no next/dynamic — that
// forces a require() resolution the ESM-only package doesn't expose).
import Spline from '@splinetool/react-spline/next';

export default function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-end overflow-hidden bg-hero-bg">
      {/* Spline 3D background. The scene's built-in accents are green and can't
          be edited from here (it's a hosted asset), so hue-rotate shifts them to
          the brand purple. Tune the degrees to taste. */}
      <div className="absolute inset-0" style={{ filter: 'hue-rotate(150deg)' }}>
        <Spline
          scene="https://prod.spline.design/Slk6b8kz3LRlKiyk/scene.splinecode"
          className="h-full w-full"
        />
      </div>

      {/* Dark overlay */}
      <div className="absolute inset-0 z-[1] bg-black/40 pointer-events-none" />

      {/* Content — anchored bottom-left, clicks pass through except on buttons */}
      <div className="relative z-10 w-full max-w-[90%] px-6 pt-32 pb-12 pointer-events-none sm:max-w-xl md:px-10 md:pb-16 lg:max-w-3xl">
        <h1
          className="mb-4 text-[clamp(2.5rem,6.5vw,5rem)] font-bold uppercase leading-[1.05] tracking-[-0.04em] text-foreground opacity-0 animate-fade-up md:mb-6"
          style={{ animationDelay: '0.2s' }}
        >
          The easiest way to get <span className="text-primary">qualified leads</span>
        </h1>

        <p
          className="mb-3 max-w-2xl text-[clamp(1.125rem,2.5vw,1.875rem)] font-light text-foreground/80 opacity-0 animate-fade-up md:mb-6"
          style={{ animationDelay: '0.4s' }}
        >
          Drop in your website URL. We figure out who to target.
        </p>

        <p
          className="mb-4 max-w-2xl text-[clamp(0.875rem,1.5vw,1.25rem)] font-light text-muted-foreground opacity-0 animate-fade-up md:mb-8"
          style={{ animationDelay: '0.55s' }}
        >
          LeadsIQ figures out who to target, writes the outreach, and brings you qualified replies.
          You only pay when someone is actually interested — not for opens, not for clicks.
        </p>

        <div
          className="flex flex-wrap gap-3 font-bold opacity-0 animate-fade-up"
          style={{ animationDelay: '0.7s' }}
        >
          <a
            href="/app"
            className="pointer-events-auto cursor-pointer rounded-sm bg-primary px-6 py-3 text-sm text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97] md:px-8 md:py-4"
          >
            Try it for free
          </a>
          <a
            href="/pricing"
            className="pointer-events-auto cursor-pointer rounded-sm bg-white px-6 py-3 text-sm text-background transition-all hover:brightness-90 active:scale-[0.97] md:px-8 md:py-4"
          >
            See pricing
          </a>
        </div>

        <p
          className="mt-4 text-xs font-light text-muted-foreground/60 opacity-0 animate-fade-up md:mt-6"
          style={{ animationDelay: '0.85s' }}
        >
          No contracts. No setup fees. Pay only for interested replies.
        </p>
      </div>
    </section>
  );
}
