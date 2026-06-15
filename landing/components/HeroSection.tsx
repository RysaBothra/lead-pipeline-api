export default function HeroSection() {
  return (
    <section className="relative overflow-hidden bg-hero-bg px-6 pt-36 pb-24 md:pt-44 md:pb-32">
      {/* faint grid + pulsing purple glow backdrop */}
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div className="animate-glow-pulse pointer-events-none absolute left-1/2 top-[-120px] h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.22),transparent)] blur-2xl" />

      <div className="relative mx-auto max-w-4xl text-center">
        <span
          className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-border bg-secondary/60 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-muted-foreground opacity-0"
          style={{ animationDelay: '0.05s' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-primary" /> AI-powered outbound
        </span>

        <h1
          className="mt-6 animate-fade-up text-[clamp(2.5rem,6.5vw,5rem)] font-bold leading-[1.03] tracking-[-0.04em] text-foreground opacity-0"
          style={{ animationDelay: '0.15s' }}
        >
          The easiest way to get <span className="text-primary">qualified leads</span>
        </h1>

        <p
          className="mx-auto mt-6 max-w-2xl animate-fade-up text-lg text-muted-foreground opacity-0 md:text-xl"
          style={{ animationDelay: '0.3s' }}
        >
          Drop in your website URL. LeadsIQ figures out who to target, writes the outreach, and
          brings you qualified replies. You only pay when someone is actually interested.
        </p>

        <div
          className="mt-9 flex animate-fade-up flex-wrap items-center justify-center gap-3 opacity-0"
          style={{ animationDelay: '0.45s' }}
        >
          <a
            href="/app"
            className="rounded-lg bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.97]"
          >
            Try it for free — no credit card required
          </a>
          <a
            href="/pricing"
            className="rounded-lg border border-border bg-secondary/40 px-7 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            See pricing
          </a>
        </div>

        <p
          className="mt-6 animate-fade-up font-mono text-xs uppercase tracking-widest text-muted-foreground/70 opacity-0"
          style={{ animationDelay: '0.6s' }}
        >
          No contracts · No setup fees · Pay only for interested replies
        </p>
      </div>
    </section>
  );
}
