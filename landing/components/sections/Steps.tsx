const steps = [
  { n: '01', title: 'We learn your business', desc: 'From one URL, we know where to start.' },
  { n: '02', title: 'We find the right people', desc: 'Best-fit buyers, ranked by signal and intent.' },
  { n: '03', title: 'We do the writing', desc: 'Personal, relevant, and ready to send at scale.' },
  { n: '04', title: 'You only pay later', desc: 'Pay when qualified buyers actually respond.' },
];

export default function Steps() {
  return (
    <section id="how-it-works" className="px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            How it works
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Website in. Leads out.
          </h2>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border border-border bg-secondary p-6">
              <div className="text-sm font-bold text-primary">{s.n}</div>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{s.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
