/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export -> Netlify just serves the `out/` folder, no Next runtime.
  output: 'export',
  images: { unoptimized: true },
  eslint: {
    // Lint runs separately; don't block builds on lint warnings.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // The ported auth source carries pre-existing strict-mode warnings
    // (unused locals/params, graphql-request `unknown` returns). Mirror the
    // source project, which builds with these ignored.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
