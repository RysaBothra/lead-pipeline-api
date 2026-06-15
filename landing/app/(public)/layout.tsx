// Public route group: no auth required. The login page mounts its own auth
// Providers client-side (via LoginScreen + dynamic ssr:false), so this layout
// is just a pass-through.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
