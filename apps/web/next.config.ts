import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/**
 * The Content-Security-Policy.
 *
 * HANDOFF-04 section 6 asks the security review to check `connect-src`, which
 * presupposes a policy. There was none; this is it. The point is not
 * defence-in-depth in the abstract - it is that the site's loudest promise,
 * that a viewing key never leaves the browser, is currently a property
 * maintained by care. `RevealKey` has no fetch in it, is not inside a form, and
 * writes nothing to storage, and a reviewer can confirm all three by reading
 * it. A policy makes the browser refuse rather than the author remember.
 *
 * The three directives that carry that promise:
 *
 *   connect-src  - in fixture mode this is `'self'` and nothing else, so a
 *                  fetch to any origin fails at the browser. It widens to
 *                  exactly the gateway when NEXT_PUBLIC_API_URL and
 *                  NEXT_PUBLIC_WS_URL are set, which is the HANDOFF-11 cutover
 *                  and an operator's env change, not an agent's.
 *   form-action  - `'none'`. This site has no form that submits anywhere; the
 *                  key field is deliberately not inside one, and this makes
 *                  that unforgeable rather than conventional.
 *   base-uri     - `'none'`, so an injected <base> cannot re-point a relative
 *                  request.
 *
 * `'unsafe-inline'` on script-src is a real weakness and is stated rather than
 * hidden. Next.js carries its flight payload and its bootstrap in inline
 * script tags, and the alternative - a per-request nonce - needs middleware,
 * which makes every route dynamic. That would undo the work that took /reveal
 * from 92 to 97 by making it static, and would cost the whole site its
 * prerendering, to defend against an injection vector a site with no user
 * input, no database and no third-party script does not have. Recorded in the
 * section 8 ledger as a deferred assumption for whoever adds a server.
 */
function contentSecurityPolicy(): string {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "";
  const ws = process.env.NEXT_PUBLIC_WS_URL ?? "";
  const snapshot = process.env.NEXT_PUBLIC_SNAPSHOT_URL ?? "";
  const connect = ["'self'", api, ws, snapshot].filter((s) => s !== "").join(" ");

  return [
    "default-src 'self'",
    `connect-src ${connect}`,
    // Next.js inlines its bootstrap and its flight payload. See the note above.
    "script-src 'self' 'unsafe-inline'",
    // Tailwind's layer output and the handful of structural inline styles the
    // components use for grid and list geometry.
    "style-src 'self' 'unsafe-inline'",
    // The fonts are vendored under src/fonts and served from this origin. There
    // is no Google Fonts fetch and this directive is what keeps it that way.
    "font-src 'self'",
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

const nextConfig: NextConfig = {
  /*
   * `ioredis` IS A SERVER PACKAGE AND IS NOT BUNDLED.
   *
   * The `redis` rung of the SnapshotStore opens a TCP socket, which only the
   * Node runtime has an API for. Leaving it in webpack's graph makes the
   * bundler try to resolve its optional native transports and its `dns` and
   * `net` imports for an environment that has neither, which fails the build
   * for a rung most deployments never take - on Vercel the REST pair is
   * injected alongside the TCP URL, so rung 1 answers and this one never runs.
   *
   * The import in `lib/snapshot/store.ts` is dynamic for the same reason from
   * the other side: it is evaluated only when the TCP URL is configured AND the
   * REST rung did not answer, so the module is not loaded on the common path at
   * all. Externalising it is what makes that dynamic import resolve to the real
   * package at run time rather than to a bundled copy.
   */
  serverExternalPackages: ["ioredis"],
  /**
   * `Referrer-Policy: no-referrer` is not routine hardening here; it is the
   * other half of the argument `TrackSearch` makes when it refuses to navigate
   * with a viewing key. A URL is sent as the referrer of the next request, so a
   * secret in one has left the browser. The field refuses to put one there, and
   * this makes sure that no URL this site produces is transmitted anywhere at
   * all - including the shielded address that /reveal legitimately does carry.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy() },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
  /**
   * apps/web is a workspace package inside a pnpm monorepo; Vercel's Root
   * Directory is `apps/web` (see docs/2.0/DEPLOY-2.0.md). This points the trace
   * at the repository root so it follows workspace symlinks instead of stopping
   * at the app directory.
   *
   * fileURLToPath, not .pathname: the latter is percent-encoded, so any
   * checkout directory containing a space or a non-ASCII character would root
   * the trace at a path that does not exist.
   */
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
