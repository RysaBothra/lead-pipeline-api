'use client';

// Client-only login screen: the auth Providers + the Login UI. Imported with
// next/dynamic({ ssr: false }) from the /login route so nothing in this subtree
// is statically prerendered (avoids the blank/not-found export output and any
// hydration mismatch from the localStorage-backed auth state).

import { Providers } from '../../components/Providers';
import { Login } from './Login';

export default function LoginScreen() {
  return (
    <Providers>
      <Login />
    </Providers>
  );
}
