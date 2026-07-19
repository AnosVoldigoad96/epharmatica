import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { Archivo, IBM_Plex_Mono, Instrument_Sans } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { ThemeProvider } from 'next-themes'
import './globals.css'

/*
 * Self-hosted fonts via next/font (dev-plan 0.C). The CSS variable names are
 * load-bearing: @epharmatica/tokens' @theme font stacks reference exactly
 * --font-archivo / --font-instrument-sans / --font-plex-mono.
 */
const archivo = Archivo({
  subsets: ['latin'],
  // Variable width axis — the EPHARMATICA wordmark renders at wdth 125 (STYLE §12)
  axes: ['wdth'],
  variable: '--font-archivo',
  display: 'swap',
})

const instrumentSans = Instrument_Sans({
  subsets: ['latin'],
  variable: '--font-instrument-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('common')
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://epharmatica.com'),
    title: {
      template: 'ePharmatica — %s',
      default: t('appName'),
    },
    description: t('tagline'),
  }
}

export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FBFBF9' },
    { media: '(prefers-color-scheme: dark)', color: '#0C1113' },
  ],
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale()

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${archivo.variable} ${instrumentSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
