import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/**
 * apps/web is a workspace package inside a pnpm monorepo; Vercel's Root
 * Directory is `apps/web` (see docs/2.0/DEPLOY-2.0.md). `outputFileTracingRoot`
 * points at the repository root so the trace follows workspace symlinks
 * instead of stopping at the app directory.
 */
const nextConfig: NextConfig = {
  // fileURLToPath, not .pathname: the latter is percent-encoded, so any
  // checkout directory containing a space or a non-ASCII character would root
  // the trace at a path that does not exist.
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  reactStrictMode: true,
  poweredByHeader: false,
  eslint: {
    // Linting is a workspace-level concern: the flat config at the repository
    // root owns every package, and `pnpm lint` runs it. Next's own lint pass
    // during `next build` would apply a second, different rule set.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
