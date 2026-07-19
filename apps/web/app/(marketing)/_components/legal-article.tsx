import fs from 'node:fs'
import path from 'node:path'
import Markdown from 'react-markdown'
import { MonographLabel } from '@epharmatica/ui'

/*
 * Renders a legal/policy markdown draft from docs/ inside the monograph
 * reading column (68ch, S6-underlined content links). Static: the file is
 * read with node:fs at build time and the page prerenders.
 *
 * TODO(dev-plan 0.E): the drafts still contain bracketed operational fields
 * and "DRAFT — pending review" headers. Before go-live: fill the brackets
 * (effective dates, legal entity + registered address, jurisdiction city,
 * liability cap, R2-vs-B2 and Resend-vs-Brevo picks) and remove the DRAFT
 * headers. Counsel review itself is complete (founder confirmation,
 * 19 Jul 2026). Rendered as-is until then.
 */

function readDoc(fileName: string): string {
  // Turbo runs `next build` with cwd = apps/web; also tolerate a repo-root cwd.
  // The repo-root docs/ copies are listed in next.config.ts
  // outputFileTracingIncludes so they exist in the standalone output too.
  // The repo-root-relative read makes Turbopack's NFT tracer include docs/ in
  // the standalone output (~1MB) and print a whole-project-trace warning at
  // build. Accepted: the pages are prerendered, and the traced docs/ copy is
  // exactly what a runtime re-render on the VPS would need.
  const candidates = [
    path.join(process.cwd(), '..', '..', 'docs', fileName),
    path.join(process.cwd(), 'docs', fileName),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8')
  }
  throw new Error(`Legal source document not found: ${fileName}`)
}

const CONTENT_LINK_CLASSES =
  'text-primary underline decoration-primary decoration-1 underline-offset-4 hover:text-primary-strong hover:decoration-2'

export function LegalArticle({ fileName }: { fileName: string }) {
  const markdown = readDoc(fileName)

  return (
    <div className="mx-auto w-full max-w-content px-5 sm:px-6 md:px-8">
      <article className="mx-auto w-full max-w-reading py-10 md:py-14">
        <Markdown
          components={{
            h1: ({ children }) => (
              <h1 className="mb-6 font-display text-[clamp(25px,1.5rem+1.6vw,32px)] font-bold leading-[1.15] tracking-[-0.01em]">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <MonographLabel as="h2" rule="hard" className="mb-4 mt-10">
                {children}
              </MonographLabel>
            ),
            h3: ({ children }) => (
              <MonographLabel as="h3" size="sm" className="mb-3 mt-8">
                {children}
              </MonographLabel>
            ),
            p: ({ children }) => <p className="my-4">{children}</p>,
            a: ({ href, children }) => (
              <a href={href} className={CONTENT_LINK_CLASSES}>
                {children}
              </a>
            ),
            ul: ({ children }) => <ul className="my-4 list-[square] ps-5">{children}</ul>,
            ol: ({ children }) => <ol className="my-4 list-decimal ps-5">{children}</ol>,
            li: ({ children }) => <li className="my-1.5">{children}</li>,
            blockquote: ({ children }) => (
              <blockquote className="my-6 border-s-2 border-primary ps-4 text-ink-2">
                {children}
              </blockquote>
            ),
            hr: () => <hr className="my-8 border-0 border-t border-line" />,
            code: ({ children }) => (
              <code className="border border-line bg-paper px-1 font-mono text-[13px]">
                {children}
              </code>
            ),
          }}
        >
          {markdown}
        </Markdown>
      </article>
    </div>
  )
}
