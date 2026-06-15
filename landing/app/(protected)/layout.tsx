// Protected route group: auth required. Wraps children in the auth Providers
// and gates them behind ProtectedGuard (redirects to /login when unauthed).
import { Providers } from '../../src/components/Providers';
import { ProtectedGuard } from '../../src/components/auth/ProtectedGuard';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <ProtectedGuard>{children}</ProtectedGuard>
    </Providers>
  );
}
