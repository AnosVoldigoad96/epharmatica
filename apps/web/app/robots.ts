import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://epharmatica.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/dev', '/api', '/auth', '/settings'],
      },
    ],
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
  }
}
