const rows = [
  { metric: 'Monthly cost', ads: '~$3,000', sdr: '~$6,500', us: '$499' },
  { metric: 'Qualified leads / mo', ads: '~4', sdr: '~8', us: '8' },
  { metric: 'Cost per qualified lead', ads: '~$750', sdr: '~$813', us: '$62' },
  { metric: 'Time to first lead', ads: '2–4 weeks', sdr: '2–3 months', us: '~48 hours' },
  { metric: 'Pay only for results', ads: 'No', sdr: 'No', us: 'Yes' },
  { metric: 'Scales instantly', ads: 'Partial', sdr: 'No', us: 'Yes' },
  { metric: 'Zero setup required', ads: 'No', sdr: 'No', us: 'Yes' },
];

export default function Comparison() {
  return (
    <section className="px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">Compare</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            How does LeadsIQ compare?
          </h2>
        </div>

        <div className="mt-12 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="py-4 pr-4" />
                <th className="px-4 py-4 text-sm font-semibold text-foreground">Google / Meta Ads</th>
                <th className="px-4 py-4 text-sm font-semibold text-foreground">Hiring an SDR</th>
                <th className="rounded-t-xl bg-primary/5 px-4 py-4 text-sm font-bold text-primary">LeadsIQ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.metric} className="border-b border-border">
                  <td className="py-4 pr-4 text-sm font-medium text-foreground">{r.metric}</td>
                  <td className="px-4 py-4 text-sm text-muted-foreground">{r.ads}</td>
                  <td className="px-4 py-4 text-sm text-muted-foreground">{r.sdr}</td>
                  <td className="bg-primary/5 px-4 py-4 text-sm font-semibold text-foreground">{r.us}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-8 text-center text-lg font-semibold text-foreground">
          Save <span className="text-primary">$6,001/month</span> vs. an SDR — up to{' '}
          <span className="text-primary">92%</span> cheaper.
        </p>
      </div>
    </section>
  );
}
