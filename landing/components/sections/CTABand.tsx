export default function CTABand() {
  return (
    <section className="px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-5xl rounded-3xl bg-foreground px-8 py-16 text-center md:px-16">
        <h2 className="text-3xl font-bold tracking-tight text-background md:text-5xl">
          See your first leads
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-background/70">
          No contracts. No setup fees. Pay only for interested replies.
        </p>
        <a
          href="/app"
          className="mt-8 inline-flex rounded-lg bg-primary px-8 py-4 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 active:scale-[0.97]"
        >
          Try it for free
        </a>
      </div>
    </section>
  );
}
