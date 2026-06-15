'use client';

/**
 * react-router-dom -> next/navigation compatibility shim.
 *
 * The codebase has ~485 imports from '@/src/utils/router-compat' across ~120 files.
 * Rewriting each call site is risky; instead, we re-export next/navigation
 * primitives under React Router's API surface so the codemod is just an
 * import-path swap: 'react-router-dom' -> '@/src/utils/router-compat'.
 *
 * What's covered: useNavigate, useLocation, useParams, useSearchParams,
 * Link, NavLink, Navigate. Anything else (BrowserRouter, Routes, Route,
 * Outlet, useMatch, ...) is intentionally not exported — those only
 * appeared in src/App.tsx / src/main.tsx, which are deleted.
 *
 * Limitations:
 * - useLocation().state is always null. React Router stored arbitrary
 *   payloads via navigate(to, { state }). The auth flow used this for
 *   "remember intended path"; we already store that in localStorage
 *   (PrivateRoute pattern), so dropping state is safe in practice.
 * - useLocation().key is a stable placeholder, not a navigation token.
 * - Navigate triggers redirect() at render time and returns null.
 */

import { ReactNode } from 'react';
import {
  useRouter,
  usePathname,
  useSearchParams as useNextSearchParams,
  useParams as useNextParams,
  redirect,
} from 'next/navigation';
import NextLink, { LinkProps as NextLinkProps } from 'next/link';

// ---- useNavigate -----------------------------------------------------------
// React Router: navigate('/x'), navigate('/x', { replace: true }), navigate(-1)
type NavigateOptions = { replace?: boolean; state?: unknown };
type NavigateFn = ((to: string, options?: NavigateOptions) => void) &
  ((delta: number) => void);

export function useNavigate(): NavigateFn {
  const router = useRouter();
  return ((to: string | number, options?: NavigateOptions) => {
    if (typeof to === 'number') {
      if (to < 0) router.back();
      else router.forward();
      return;
    }
    if (options?.replace) router.replace(to);
    else router.push(to);
  }) as NavigateFn;
}

// ---- useLocation -----------------------------------------------------------
export interface CompatLocation {
  pathname: string;
  search: string;
  hash: string;
  state: unknown;
  key: string;
}

export function useLocation(): CompatLocation {
  const pathname = usePathname() ?? '/';
  const sp = useNextSearchParams();
  const search = sp ? sp.toString() : '';
  return {
    pathname,
    search: search ? `?${search}` : '',
    // hash is only meaningful client-side; reading window directly is fine here
    // because all consumers run inside 'use client' boundaries.
    hash: typeof window !== 'undefined' ? window.location.hash : '',
    state: null,
    key: 'default',
  };
}

// ---- useParams -------------------------------------------------------------
// next/navigation's useParams returns Record<string, string | string[]>.
// React Router's signature is Readonly<Params<Key>>. The shape is compatible
// for the call sites in this codebase (they read string params like :id, :groupId).
export function useParams<T extends Record<string, string | string[] | undefined> = Record<string, string | undefined>>(): Readonly<T> {
  return useNextParams() as Readonly<T>;
}

// ---- useSearchParams -------------------------------------------------------
// React Router returns [URLSearchParams, setSearchParams]. next returns
// just URLSearchParams (read-only). Provide a setter that pushes a new URL.
type SearchParamsInput = URLSearchParams | string | Record<string, string> | string[][];
type SetSearchParams = (next: SearchParamsInput, options?: { replace?: boolean }) => void;

export function useSearchParams(): [URLSearchParams, SetSearchParams] {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const sp = useNextSearchParams();
  // Wrap in a fresh URLSearchParams so callers get a mutable copy
  const params = new URLSearchParams(sp ? sp.toString() : '');

  const set: SetSearchParams = (next, options) => {
    let qs: string;
    if (next instanceof URLSearchParams) qs = next.toString();
    else if (typeof next === 'string') qs = next;
    else qs = new URLSearchParams(next as Record<string, string>).toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    if (options?.replace) router.replace(url);
    else router.push(url);
  };

  return [params, set];
}

// ---- Link ------------------------------------------------------------------
// React Router: <Link to="/x">  ->  next/link: <Link href="/x">
type LinkPropsCompat = Omit<NextLinkProps, 'href'> & {
  to: NextLinkProps['href'];
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  target?: string;
  rel?: string;
  title?: string;
  'aria-label'?: string;
  role?: string;
  // Catch-all for the rest of the props consumers pass through
  [key: string]: unknown;
};

export function Link({ to, children, ...rest }: LinkPropsCompat) {
  return (
    <NextLink href={to} {...(rest as Record<string, unknown>)}>
      {children}
    </NextLink>
  );
}

// ---- NavLink ---------------------------------------------------------------
// React Router's NavLink supports:
//   - className as string OR ({ isActive, isPending }) => string
//   - children as node OR ({ isActive }) => node
//   - `end` prop for exact match
type NavLinkRenderArgs = { isActive: boolean; isPending: boolean; isTransitioning: boolean };
type NavLinkProps = Omit<LinkPropsCompat, 'className' | 'children'> & {
  className?: string | ((args: NavLinkRenderArgs) => string);
  children?: ReactNode | ((args: NavLinkRenderArgs) => ReactNode);
  end?: boolean;
  caseSensitive?: boolean;
};

export function NavLink({ to, className, children, end, caseSensitive, ...rest }: NavLinkProps) {
  const pathname = usePathname() ?? '/';
  const target = String(to);
  const cmp = caseSensitive ? (a: string, b: string) => a === b : (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const startsWith = caseSensitive
    ? (a: string, prefix: string) => a.startsWith(prefix)
    : (a: string, prefix: string) => a.toLowerCase().startsWith(prefix.toLowerCase());

  const isActive = end
    ? cmp(pathname, target)
    : cmp(pathname, target) || startsWith(pathname, target.endsWith('/') ? target : target + '/');

  const renderArgs: NavLinkRenderArgs = { isActive, isPending: false, isTransitioning: false };
  const resolvedClassName = typeof className === 'function' ? className(renderArgs) : className;
  const resolvedChildren = typeof children === 'function' ? children(renderArgs) : children;

  return (
    <NextLink href={to} className={resolvedClassName} {...(rest as Record<string, unknown>)}>
      {resolvedChildren}
    </NextLink>
  );
}

// ---- Navigate --------------------------------------------------------------
// React Router's <Navigate to="/x" replace /> renders a redirect. In Next
// App Router, `redirect()` throws to perform the redirect; calling it during
// render of a client component triggers a router.replace effectively.
export function Navigate({ to }: { to: string; replace?: boolean; state?: unknown }) {
  redirect(to);
  // unreachable
  return null;
}
