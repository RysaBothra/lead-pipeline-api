export default function Footer() {
  return (
    <footer className="border-t border-border bg-background px-6 py-14 md:px-10">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.6fr_1fr_1fr]">
        <div>
          <a href="/" className="flex items-center gap-[3px]">
            <span className="text-lg font-semibold tracking-tight text-foreground">Leads</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mark.png" alt="iQ" className="h-5 w-auto" />
          </a>
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            AI-powered outbound that delivers qualified leads. Pay only for interested replies.
          </p>
        </div>

        <div>
          <h4 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Product
          </h4>
          <ul className="mt-4 space-y-3 text-sm">
            <li><a href="/#how-it-works" className="text-foreground/80 transition-colors hover:text-foreground">How it works</a></li>
            <li><a href="/#features" className="text-foreground/80 transition-colors hover:text-foreground">Features</a></li>
            <li><a href="/pricing" className="text-foreground/80 transition-colors hover:text-foreground">Pricing</a></li>
          </ul>
        </div>

        <div>
          <h4 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Legal
          </h4>
          <ul className="mt-4 space-y-3 text-sm">
            <li><a href="/privacy" className="text-foreground/80 transition-colors hover:text-foreground">Privacy</a></li>
            <li><a href="/terms" className="text-foreground/80 transition-colors hover:text-foreground">Terms</a></li>
            <li><a href="mailto:hello@leadsiq.app" className="text-foreground/80 transition-colors hover:text-foreground">hello@leadsiq.app</a></li>
          </ul>
        </div>
      </div>

      <div className="mx-auto mt-10 max-w-6xl border-t border-border pt-6 font-mono text-xs text-muted-foreground">
        © 2026 LeadsIQ. All rights reserved.
      </div>
    </footer>
  );
}
