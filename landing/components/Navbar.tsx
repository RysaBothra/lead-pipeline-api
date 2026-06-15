const navLinks = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Features', href: '/#features' },
  { label: 'Pricing', href: '/pricing' },
];

export default function Navbar() {
  return (
    <nav className="fixed left-0 right-0 top-0 z-50 flex items-center justify-between px-8 py-5 lg:px-16">
      {/* Logo lockup */}
      <a href="/" className="flex items-center gap-[3px]">
        <span className="text-xl font-semibold tracking-tight text-foreground">Leads</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark.png" alt="iQ" className="h-6 w-auto" />
      </a>

      {/* Nav links (hidden on mobile) */}
      <div className="hidden items-center gap-8 md:flex">
        {navLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-sm uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* CTA */}
      <a
        href="/app"
        className="hidden rounded-lg bg-nav-button px-6 py-3 text-xs uppercase tracking-widest text-foreground transition-all hover:bg-nav-button/80 active:scale-[0.97] md:inline-flex"
      >
        Start for free
      </a>
    </nav>
  );
}
