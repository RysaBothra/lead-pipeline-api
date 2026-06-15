'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

// Lightweight scroll-reveal: fades + lifts its children in when they enter the
// viewport (then disconnects). Pure IntersectionObserver — no scroll listeners,
// so it never causes scroll jank.
export default function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        shown ? 'opacity-100 translate-y-0 blur-0' : 'translate-y-6 opacity-0 blur-[2px]'
      } ${className}`}
    >
      {children}
    </div>
  );
}
