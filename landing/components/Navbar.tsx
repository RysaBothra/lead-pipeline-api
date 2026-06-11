import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Single-screen hero: there are no separate pages/sections yet, so every link
// routes to the product (/app). Swap these hrefs once real pages exist.
const navLinks = [
  { label: 'Platform', href: '/app' },
  { label: 'How it Works', href: '/app' },
  { label: 'Pricing', href: '/app' },
  { label: 'About', href: '/app' },
  { label: 'Contact', href: '/app' },
];

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 lg:px-16 py-5">
      {/* Left: the LeadsIQ logo lockup */}
      <a href="/" className="flex items-center gap-[3px]">
        <span className="text-foreground text-xl font-semibold tracking-tight">Leads</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mark.png" alt="iQ" className="h-6 w-auto" />
      </a>

      {/* Center: nav links (hidden on mobile) */}
      <div className="hidden md:flex items-center gap-8">
        {navLinks.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors uppercase tracking-widest"
          >
            {link.label}
          </a>
        ))}
      </div>

      {/* Right: CTA */}
      <a
        href="/app"
        className={cn(
          buttonVariants({ variant: 'navCta', size: 'lg' }),
          'hidden md:inline-flex rounded-lg uppercase text-xs tracking-widest px-6'
        )}
      >
        Get Started
      </a>
    </nav>
  );
}
