const plans = [
  {
    name: 'Pay As You Go',
    price: '$99',
    unit: '/per qualified lead',
    features: [
      'No monthly commitment',
      'AI-powered personalization',
      'Full campaign analytics',
      'Email support',
    ],
    highlight: false,
  },
  {
    name: 'Starter',
    price: '$299',
    unit: '/per month',
    features: [
      '4 qualified leads included',
      'Additional leads at $79/each',
      'AI-powered personalization',
      'Priority email support',
    ],
    highlight: false,
  },
  {
    name: 'Growth',
    price: '$499',
    unit: '/per month',
    features: [
      '8 qualified leads included',
      'Additional leads at $69/each',
      'Dedicated campaign strategist',
      'Priority Slack support',
    ],
    highlight: true,
  },
  {
    name: 'Pro',
    price: '$999',
    unit: '/per month',
    features: [
      '20 qualified leads included',
      'Additional leads at $59/each',
      'White-glove onboarding',
      'Custom AI training',
    ],
    highlight: false,
  },
];

export default function PricingPlans() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {plans.map((plan) => (
        <div
          key={plan.name}
          className={`relative flex flex-col rounded-2xl border bg-background p-6 ${
            plan.highlight ? 'border-primary shadow-lg shadow-primary/10' : 'border-border'
          }`}
        >
          {plan.highlight && (
            <span className="absolute -top-3 left-6 rounded-full bg-primary px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary-foreground">
              Most popular
            </span>
          )}
          <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {plan.name}
          </h3>
          <div className="mt-4 flex items-baseline gap-1">
            <span className="text-4xl font-bold tracking-tight text-foreground">{plan.price}</span>
            <span className="text-sm text-muted-foreground">{plan.unit}</span>
          </div>
          <ul className="mt-6 flex flex-1 flex-col gap-3">
            {plan.features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-foreground/80">
                <span className="mt-0.5 text-primary">✓</span>
                {f}
              </li>
            ))}
          </ul>
          <a
            href="/app"
            className={`mt-8 inline-flex items-center justify-center rounded-lg px-5 py-3 text-sm font-semibold transition-all active:scale-[0.97] ${
              plan.highlight
                ? 'bg-primary text-primary-foreground hover:brightness-110'
                : 'border border-border text-foreground hover:border-primary hover:text-primary'
            }`}
          >
            Get started
          </a>
        </div>
      ))}
    </div>
  );
}
