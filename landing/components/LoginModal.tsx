'use client';

// Login popup controller for the landing page.
//
// Mounted once in the root layout. Lightweight: it only holds open/close state
// and a delegated interceptor. The heavy login UI lives in LoginOverlay, which
// is code-split via next/dynamic and fetched only when the popup first opens —
// so the marketing pages stay light.
//
// What triggers the popup:
//  - a click on any <a href="/login"> (every "Get started" / "Login" CTA)
//  - submit of a <form action="/login"> (the hero domain form — the entered
//    domain is stashed in localStorage as `leadsiq_domain`)
//  - a `leadsiq:open-login` window event (programmatic)
//
// With JS disabled the CTAs fall back to navigating to the real /login route.

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const LoginOverlay = dynamic(() => import('./LoginOverlay'), { ssr: false });

function isLoginTarget(href: string | null | undefined): boolean {
  if (!href) return false;
  try {
    const url = new URL(href, window.location.origin);
    return url.pathname.replace(/\/$/, '') === '/login';
  } catch {
    return href.replace(/\/$/, '').endsWith('/login');
  }
}

export default function LoginModal() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const openModal = () => setOpen(true);

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const anchor = (e.target as HTMLElement)?.closest?.('a');
      if (!anchor) return;
      if (!isLoginTarget(anchor.getAttribute('href'))) return;
      e.preventDefault();
      openModal();
    };

    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (!form || form.tagName !== 'FORM') return;
      if (!isLoginTarget(form.getAttribute('action'))) return;
      e.preventDefault();
      try {
        const domain = new FormData(form).get('domain');
        if (typeof domain === 'string' && domain.trim()) {
          localStorage.setItem('leadsiq_domain', domain.trim());
        }
      } catch {
        // ignore storage failures
      }
      openModal();
    };

    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    window.addEventListener('leadsiq:open-login', openModal as EventListener);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('submit', onSubmit);
      window.removeEventListener('leadsiq:open-login', openModal as EventListener);
    };
  }, []);

  // Lock background scroll + allow Esc to close while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!open) return null;
  return <LoginOverlay onClose={close} />;
}
