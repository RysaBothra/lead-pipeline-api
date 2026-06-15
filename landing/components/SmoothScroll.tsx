'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Lenis from 'lenis';

// Momentum smooth scrolling, site-wide. Plain `new Lenis()` uses the default
// smooth-wheel + lerp easing. We also intercept same-page #anchor clicks and
// hand them to lenis.scrollTo so they glide (with an offset for the fixed nav)
// instead of jumping — Lenis disables native CSS smooth scrolling.
export default function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis();

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>('a[href*="#"]');
      if (!anchor) return;
      const href = anchor.getAttribute('href') || '';
      const id = href.split('#')[1];
      if (!id) return;
      const el = document.getElementById(id);
      // Only hijack when the target exists on the current page; otherwise let
      // the browser navigate (e.g. "/#features" from the pricing page).
      if (el) {
        e.preventDefault();
        lenis.scrollTo(el, { offset: -90 });
        history.replaceState(null, '', `#${id}`);
      }
    };
    document.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('click', onClick);
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
