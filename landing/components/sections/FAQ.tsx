const faqs = [
  {
    q: 'What exactly is a qualified lead?',
    a: 'A qualified lead is a real person at a best-fit company who replies to your outreach with genuine interest — not an open, not a click. You only pay when that actually happens.',
  },
  {
    q: 'Can I control what is sent on my behalf?',
    a: 'Yes. You approve your messaging and templates, and nothing goes out without your sign-off, so you stay in full control of your brand voice.',
  },
  {
    q: "What happens if I don't get any leads?",
    a: 'You only pay when qualified buyers actually respond. No replies means no cost — the risk is on us, not you.',
  },
  {
    q: 'How does LeadsIQ compare to hiring an SDR?',
    a: 'A fraction of the cost, live in about 48 hours instead of months, and you only pay for results — not salary, tools, and ramp time.',
  },
  {
    q: 'Do I need any technical setup?',
    a: 'None. Drop in your website URL and LeadsIQ handles targeting, writing, sending, and follow-ups end to end.',
  },
];

export default function FAQ() {
  return (
    <section className="bg-muted px-6 py-20 md:px-10 md:py-28">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-primary">FAQ</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-foreground md:text-5xl">
            Questions, answered
          </h2>
        </div>
        <div className="mt-12 space-y-3">
          {faqs.map((f) => (
            <details key={f.q} className="group rounded-xl border border-border bg-background p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-foreground">
                {f.q}
                <span className="ml-4 text-xl text-primary transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
