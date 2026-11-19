import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma Client is generated for Workerd and imported from the bundled
  // `generated/prisma` output by the Cloudflare runtime.
};

// Initialize Wrangler bindings for `next dev`. By default they are local (`.wrangler/`).
// Only the explicit `npm run dev:remote` command sets PROCPX_DEV_REMOTE=true, which selects
// the wrangler.jsonc "remote" environment whose D1/R2 bindings are marked `"remote": true`
// and therefore read and write the deployed Cloudflare resources.
export default async function config(): Promise<NextConfig> {
  if (process.env.DATABASE_PROVIDER === "d1") {
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    if (process.env.PROCPX_DEV_REMOTE === "true") {
      await initOpenNextCloudflareForDev({ environment: "remote", remoteBindings: true });
    } else {
      await initOpenNextCloudflareForDev();
    }
  }
  return nextConfig;
}
