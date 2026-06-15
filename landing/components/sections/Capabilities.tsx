const features = [
  { title: 'Enterprise infra', desc: 'Reliable sending infrastructure, built to run at scale.' },
  { title: 'Smart ICP detection', desc: 'Finds your best-fit buyers using signals and intent.' },
  { title: '30+ data sources', desc: 'Pulls from deep data sources to improve targeting.' },
  { title: 'Learns and improves', desc: 'Gets smarter from replies and optimizes automatically.' },
  { title: 'AI sales insights', desc: 'Helps you pitch better with sharper context and angles.' },
  { title: 'CRM sync', desc: 'Pushes qualified leads straight into your CRM.' },
];

export default function Capabilities() {
  return (
    <section id="features" className="px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">
            Capabilities
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Everything, done-for-you
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            All the moving parts, without the manual work.
          </p>
        </div>
        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-secondary p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                ✓
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
