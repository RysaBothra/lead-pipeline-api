'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Lenis from 'lenis';

// Momentum smooth scrolling. Runs a single requestAnimationFrame loop driving
// Lenis; `anchors` makes in-page #links glide too (offset clears the fixed nav).
export default function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.1, anchors: { offset: -90 } });
    let rafId: number;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
