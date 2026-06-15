const navLinks = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', href: '/pricing' },
];

export default function Navbar() {
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-10">
        {/* Logo lockup */}
        <a href="/" className="flex items-center gap-[3px]">
          <span className="text-xl font-semibold tracking-tight text-foreground">Leads</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mark.png" alt="iQ" className="h-6 w-auto" />
        </a>

        {/* Nav links */}
        <div className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* CTAs */}
        <div className="flex items-center gap-2">
          <a
            href="/app"
            className="hidden px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground md:inline-flex"
          >
            Login
          </a>
          <a
            href="/app"
            className="inline-flex rounded-lg bg-nav-button px-5 py-2.5 text-sm font-semibold text-background transition-all hover:bg-nav-button/90 active:scale-[0.97]"
          >
            Start for free
          </a>
        </div>
      </div>
    </nav>
  );
}
