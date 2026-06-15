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

        {/* Drop-in URL — plain GET form, lands on /app?domain=... (no JS needed) */}
        <form
          action="/app"
          method="get"
          className="mx-auto mt-9 flex w-full max-w-xl animate-fade-up flex-col gap-3 opacity-0 sm:flex-row"
          style={{ animationDelay: '0.45s' }}
        >
          <div className="flex flex-1 items-center rounded-lg border border-border bg-secondary/60 px-4 transition-colors focus-within:border-primary/60">
            <span className="select-none font-mono text-sm text-muted-foreground">https://</span>
            <input
              name="domain"
              type="text"
              required
              placeholder="yourcompany.com"
              aria-label="Your website URL"
              className="w-full bg-transparent px-2 py-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="shrink-0 rounded-lg bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.97]"
          >
            Get qualified leads
          </button>
        </form>

        <div className="mt-4 animate-fade-up opacity-0" style={{ animationDelay: '0.55s' }}>
          <a
            href="/pricing"
            className="font-mono text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            or see pricing →
          </a>
        </div>

        <p
          className="mt-6 animate-fade-up font-mono text-xs uppercase tracking-widest text-muted-foreground/70 opacity-0"
          style={{ animationDelay: '0.65s' }}
        >
          No contracts · No setup fees · Pay only for interested replies
        </p>
      </div>
    </section>
  );
}
