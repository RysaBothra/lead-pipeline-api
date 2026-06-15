'use client';

import dynamic from 'next/dynamic';

// ssr:false keeps the whole login subtree out of the static export, so the
// page never ships an empty/not-found body. A visible spinner renders into the
// static HTML until the login chunk loads on the client.
const LoginScreen = dynamic(() => import('../../../src/views/auth/LoginScreen'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-white/70" />
    </div>
  ),
});

export default function Page() {
  return <LoginScreen />;
}
