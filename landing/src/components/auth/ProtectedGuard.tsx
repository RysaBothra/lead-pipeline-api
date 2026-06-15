'use client';

// Auth guard for the protected route group. Mirrors the vocallabsui
// (protected)/layout behaviour: if there's no authenticated session, remember
// the intended path and redirect to /login.
import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../services/auth/hooks/useAuth';

export function ProtectedGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isAuthenticated) {
      try {
        const search = typeof window !== 'undefined' ? window.location.search : '';
        localStorage.setItem('redirectAfterLogin', (pathname || '/') + search);
      } catch {
        // ignore
      }
      router.replace('/login');
    }
  }, [isAuthenticated, pathname, router]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}
