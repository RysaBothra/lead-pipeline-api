declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_APP_VERSION: string;
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: string;
    /** Runtime-injected (not NEXT_PUBLIC_) — read server-side and forwarded
     *  to the browser via window.__ENV__ in app/layout.tsx. */
    VOCALLABS_API_BASE_URL?: string;
    GOFLASH_BASE_URL?: string;
  }
}

// Runtime config injected by app/layout.tsx via an inline <script> tag in <head>.
// Lets the client read deploy-time env vars without rebuilding the bundle.
interface Window {
  __ENV__?: {
    VOCALLABS_API_BASE_URL?: string;
    GOFLASH_BASE_URL?: string;
  };
  capInstance?: any;
  CapWidget?: any;
}
