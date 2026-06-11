/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static HTML export -> Netlify just serves the `out/` folder, no Next runtime.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
