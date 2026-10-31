import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma ships its own query engine; keep it out of the Next.js bundle.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

// DATABASE_PROVIDER=d1 makes `next dev` use the remote D1 database from
// wrangler.jsonc (through your `wrangler login`) instead of the local SQLite file.
// The connection is awaited so no request is served before D1 is ready.
export default async function config(): Promise<NextConfig> {
  if (process.env.DATABASE_PROVIDER === "d1") {
    const { initOpenNextCloudflareForDev } = await import("@opennextjs/cloudflare");
    await initOpenNextCloudflareForDev({ remoteBindings: true });
  }
  return nextConfig;
}
