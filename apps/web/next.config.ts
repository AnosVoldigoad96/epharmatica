import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

/**
 * Framework pin: Next.js 16, Turbopack default — no custom webpack config is
 * permitted in this repo (docs/rules.md §4.7).
 */
const nextConfig: NextConfig = {
  output: 'standalone',
  // "use cache" directive only (1.C-3 cacheTag wiring). Deliberately NOT
  // cacheComponents: that mode rejects the route segment configs
  // (force-static/revalidate) the static /learn shells depend on.
  experimental: {
    useCache: true,
    serverActions: {
      // Media uploads travel as server-action FormData; the default 1 MB
      // body cap rejected any real image (prod-observed). 26 MB = the
      // documented MAX_INPUT_BYTES pre-compression cap (media actions §8)
      // plus form overhead — every action stays auth-gated + zod-validated,
      // and Cloudflare fronts the outer rate limits.
      bodySizeLimit: '26mb',
    },
  },
  transpilePackages: [
    '@epharmatica/ui',
    '@epharmatica/tokens',
    '@epharmatica/database',
    '@epharmatica/editor',
  ],
  // Legal pages read their markdown source from repo-root docs/ with node:fs;
  // include those files in the standalone trace so runtime re-renders on the
  // VPS can find them (they live outside apps/web).
  outputFileTracingIncludes: {
    '/terms': ['../../docs/terms-of-service.md'],
    '/privacy': ['../../docs/privacy-policy.md'],
    '/content-policy': ['../../docs/content-policy.md'],
    '/medical-disclaimer': ['../../docs/medical-disclaimer.md'],
  },
}

export default withNextIntl(nextConfig)
