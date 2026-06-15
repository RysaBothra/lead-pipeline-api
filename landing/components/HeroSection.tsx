export default function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 pt-36 pb-20 md:pt-44 md:pb-28">
      {/* soft brand glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[480px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--primary)/0.12),transparent)]" />

      <div className="relative mx-auto max-w-4xl text-center">
        <span className="inline-block rounded-full border border-border bg-secondary px-4 py-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          AI-powered outbound
        </span>

        <h1 className="mt-6 text-[clamp(2.5rem,6vw,4.5rem)] font-bold leading-[1.05] tracking-[-0.03em] text-foreground">
          The easiest way to get <span className="text-primary">qualified leads</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
          Drop in your website URL. LeadsIQ figures out who to target, writes the outreach, and
          brings you qualified replies. You only pay when someone is actually interested.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/app"
            className="rounded-lg bg-primary px-7 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97]"
          >
            Try it for free — no credit card required
          </a>
          <a
            href="/pricing"
            className="rounded-lg border border-border bg-background px-7 py-3.5 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
          >
            See pricing
          </a>
        </div>

        <p className="mt-5 text-xs text-muted-foreground">
          No contracts. No setup fees. Pay only for interested replies.
        </p>
      </div>
    </section>
  );
}
