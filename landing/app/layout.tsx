import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Script from 'next/script';
import { VOCALLABS_API_BASE_URL, GOFLASH_BASE_URL } from '../src/services/api/config';

export const metadata: Metadata = {
  title: 'LeadsIQ — the easiest way to get qualified leads',
  description:
    'Drop in your website URL. LeadsIQ figures out who to target, writes the outreach, and brings you qualified replies. You only pay when someone is actually interested.',
};

// Runtime config — resolved server-side by config.ts (reads process.env at
// module load). Injected into window.__ENV__ so the client bundle reads the
// same value via that config module without a NEXT_PUBLIC_* build-time inline.
const RUNTIME_ENV_INLINE = `window.__ENV__ = ${JSON.stringify({
  VOCALLABS_API_BASE_URL,
  GOFLASH_BASE_URL,
})};`;

// CAP.js (captcha) widget bootstrap + token pre-warm. The login flow reads
// window.capInstance.getToken() when requesting an OTP.
const CAP_INIT_INLINE = `
(function () {
  var capSolver = null;
  var initPromise = null;

  function ensureInit() {
    if (capSolver) return Promise.resolve();
    if (initPromise) return initPromise;
    initPromise = new Promise(function (resolve) {
      function doInit() {
        capSolver = new Cap({
          apiEndpoint: 'https://cap.subspace.money/0a4042c7c7/'
        });
        resolve();
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', doInit);
      } else {
        doInit();
      }
    });
    return initPromise;
  }

  var cachedTokenPromise = null;

  function solveOne() {
    cachedTokenPromise = new Promise(function (resolve, reject) {
      ensureInit().then(function () {
        var widget = capSolver.widget;

        var timeout = setTimeout(function () {
          widget.removeEventListener('solve', onSolve);
          widget.removeEventListener('error', onError);
          cachedTokenPromise = null;
          reject(new Error('CAP.js solve timed out'));
        }, 30000);

        function onSolve(e) {
          clearTimeout(timeout);
          widget.removeEventListener('solve', onSolve);
          widget.removeEventListener('error', onError);
          var token = e.detail.token || capSolver.token;
          resolve(token);
        }

        function onError() {
          clearTimeout(timeout);
          widget.removeEventListener('solve', onSolve);
          widget.removeEventListener('error', onError);
          cachedTokenPromise = null;
          reject(new Error('CAP.js solve error'));
        }

        widget.addEventListener('solve', onSolve);
        widget.addEventListener('error', onError);
        capSolver.solve();
      }).catch(function (err) {
        cachedTokenPromise = null;
        reject(err);
      });
    });
    return cachedTokenPromise;
  }

  ensureInit().then(function () { solveOne(); });

  window.capInstance = {
    getToken: function () {
      var promise = cachedTokenPromise || solveOne();
      return promise.then(function (token) {
        capSolver.reset();
        cachedTokenPromise = null;
        setTimeout(function () { solveOne(); }, 100);
        return token;
      });
    },
    ready: true
  };
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runtime env — must run before any client bundle reads window.__ENV__ */}
        <Script id="runtime-env" strategy="beforeInteractive">{RUNTIME_ENV_INLINE}</Script>
        {/* CAP.js widget + pre-warm — must load before the login screen mounts */}
        <Script src="https://cdn.jsdelivr.net/npm/@cap.js/widget" strategy="beforeInteractive" />
        <Script id="cap-init" strategy="beforeInteractive">{CAP_INIT_INLINE}</Script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
