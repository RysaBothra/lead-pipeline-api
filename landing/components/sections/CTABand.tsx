import Reveal from '@/components/Reveal';

export default function CTABand() {
  return (
    <section className="px-6 py-24 md:px-10 md:py-32">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-secondary/60 px-8 py-16 text-center md:px-16">
          <div className="pointer-events-none absolute left-1/2 top-0 h-64 w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,hsl(var(--primary)/0.28),transparent)] blur-2xl" />
          <h2 className="relative text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            See your first leads
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-muted-foreground">
            No contracts. No setup fees. Pay only for interested replies.
          </p>
          <a
            href="/login"
            className="relative mt-8 inline-flex rounded-lg bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:brightness-110 active:scale-[0.97]"
          >
            Try it for free
          </a>
        </div>
      </Reveal>
    </section>
  );
}
