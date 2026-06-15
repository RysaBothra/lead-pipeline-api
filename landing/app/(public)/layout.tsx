// Public route group: no auth required. Wraps children in the auth Providers
// so the login screen has access to AuthContext / WhiteLabeling / Theme.
import { Providers } from '../../src/components/Providers';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
