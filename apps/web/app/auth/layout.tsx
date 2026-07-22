import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { BrandMark, BrandWordmark } from '@/app/(marketing)/_components/brand-mark'

/*
 * Auth shell (wireframes §1–3): a single centered card (~440px) on the paper
 * background — no topnav, just the brand row (logo mark + EPHARMATICA
 * wordmark, linking home) inside the card, margin-bottom 22px. Every auth
 * page inherits robots noindex from here (PLAN: auth pages noindex).
 */
export const metadata: Metadata = {
  robots: { index: false },
}

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center px-5 py-8 sm:items-start sm:py-14">
      <div className="h-fit w-full max-w-[440px] border border-ink bg-surface px-6 pb-9 pt-8 sm:px-10">
        <Link href="/" className="mb-[22px] inline-flex items-center gap-2.5">
          <BrandMark size={24} />
          <BrandWordmark />
        </Link>
        {children}
      </div>
    </main>
  )
}
