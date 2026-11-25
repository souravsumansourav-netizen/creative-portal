/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };
export default nextConfig;

// Only emulate Cloudflare bindings in `next dev` when asked (CLOUDFLARE_DEV=1). The app doesn't use any
// bindings in dev, and the emulator (workerd) can't run on older macOS versions, which crashed `npm run dev`.
if (process.env.CLOUDFLARE_DEV === "1") {
  import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
}
