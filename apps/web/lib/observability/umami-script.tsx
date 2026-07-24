import Script from 'next/script'

/**
 * Self-hosted, cookieless Umami loader (PRD observability · privacy
 * policy §cookies). Renders nothing unless BOTH env vars are present, so
 * dev/CI builds without an analytics stack stay script-free. Mounted in the
 * PUBLIC group layouts only — rules.md §11.3: no analytics in /admin (the
 * audit log is the record) or the WhatsApp module. Events fire declaratively
 * via data-umami-event attributes carrying constants from ./events (no
 * ad-hoc strings, no client JS).
 */
export function UmamiScript() {
  const src = process.env.NEXT_PUBLIC_UMAMI_SCRIPT_URL
  const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  if (!src || !websiteId) return null
  return <Script src={src} data-website-id={websiteId} strategy="afterInteractive" />
}
