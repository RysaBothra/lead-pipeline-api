'use client';

import { useEffect, useState } from 'react';
import { ToastContainer } from 'react-toastify';

import { AuthProvider } from '../services/auth/context/AuthContext';
import { TokenRefreshProvider } from '../services/auth/context/TokenRefreshProvider';
import { WhiteLabelingProvider } from '../context/WhiteLabelingContext';
import type { WhitelabelBrandingSnapshot } from '../services/whitelabel/serverFetch';
import { ThemeProvider } from './layout/ThemeContext';
import 'react-toastify/dist/ReactToastify.css';

export function Providers({
  children,
  initialBranding,
}: {
  children: React.ReactNode;
  initialBranding?: WhitelabelBrandingSnapshot;
}) {
  // Hydration gate: AuthProvider, ThemeProvider, WhiteLabelingProvider all read
  // localStorage on first render. Server-prerender produces "logged out / default
  // theme" HTML; client hydrate would produce different HTML and warn. Render
  // nothing until after first effect to keep server and first-paint identical.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <AuthProvider>
      <TokenRefreshProvider>
        <WhiteLabelingProvider initialBranding={initialBranding}>
          <ThemeProvider>
            {children}
            <ToastContainer
              position="bottom-left"
              autoClose={5000}
              hideProgressBar={false}
              newestOnTop
              closeOnClick
              rtl={false}
              pauseOnFocusLoss
              draggable
              pauseOnHover
              theme="dark"
              closeButton={true}
            />
          </ThemeProvider>
        </WhiteLabelingProvider>
      </TokenRefreshProvider>
    </AuthProvider>
  );
}
