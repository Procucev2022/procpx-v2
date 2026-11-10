import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma Client is generated for Workerd and imported from the bundled
  // `generated/prisma` output by the Cloudflare runtime.
};

// Initialize local Wrangler bindings for `next dev`; remote D1 access is reserved
// for explicit Wrangler commands and is never enabled by the dev config.
export default async function config(): Promise<NextConfig> {
  if (process.env.DATABASE_PROVIDER === "d1") {
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    await initOpenNextCloudflareForDev();
  }
  return nextConfig;
}
