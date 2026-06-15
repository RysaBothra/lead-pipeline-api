'use client';

// The actual login popup contents. Loaded lazily (next/dynamic) by LoginModal
// only when the popup opens, so the heavy auth bundle (three.js, firebase,
// webauthn, …) never weighs down the marketing pages.

import { useEffect } from 'react';
import { Providers } from '../src/components/Providers';
import { Login } from '../src/views/auth/Login';
import { useAuth } from '../src/services/auth/hooks/useAuth';

// Closes the overlay as soon as an authenticated session exists. Lives inside
// the Providers tree so it can read the auth context.
function AuthWatcher({ onAuthed }: { onAuthed: () => void }) {
  const { isAuthenticated } = useAuth();
  useEffect(() => {
    if (isAuthenticated) onAuthed();
  }, [isAuthenticated, onAuthed]);
  return null;
}

export default function LoginOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close login"
        className="fixed right-4 top-4 z-[110] flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition-colors hover:bg-white/20"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <Providers>
        <AuthWatcher onAuthed={onClose} />
        <Login />
      </Providers>
    </div>
  );
}
