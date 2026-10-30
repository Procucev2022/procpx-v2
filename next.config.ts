import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma ships its own query engine; keep it out of the Next.js bundle.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
