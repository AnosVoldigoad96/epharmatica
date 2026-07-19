import type { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://epharmatica.com'

/** Landing + the six legal/info routes (dev-plan 0.E). */
const ROUTES = [
  '/',
  '/about',
  '/contact',
  '/terms',
  '/privacy',
  '/content-policy',
  '/medical-disclaimer',
] as const

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return ROUTES.map((route) => ({
    url: new URL(route, SITE_URL).toString(),
    lastModified,
    changeFrequency: route === '/' ? 'weekly' : 'monthly',
    priority: route === '/' ? 1 : 0.4,
  }))
}
