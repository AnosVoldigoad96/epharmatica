'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { MonographLabel } from '@epharmatica/ui'
import type { ContentTree, DotState, Rollup } from '@/features/content/tree'
import { chapterRollup, dotState, subjectRollup, topicRollup } from '@/features/content/tree'

/**
 * Read-only tree rail (M4-1 · hi-fi 3aj): Subject → Chapter → Topic rows
 * with 7×7px square status dots (teal all-published · amber drafts inside ·
 * hollow empty), published-count chips as bare mono numbers, indentation by
 * depth, and the legend line at the foot. Clicking a node opens that
 * level's list editor; the selected node carries the tint + 2px start
 * border like every rail in the system.
 */

function StatusDot({ state }: { state: DotState }) {
  const cls =
    state === 'published'
      ? 'bg-primary'
      : state === 'drafts'
        ? 'bg-warn'
        : 'border border-line bg-transparent'
  return <span aria-hidden className={`size-[7px] flex-none ${cls}`} />
}

function RailRow({
  href,
  active,
  depth,
  bold,
  dimmed,
  rollup,
  children,
}: {
  href: string
  active: boolean
  depth: 0 | 1 | 2
  bold?: boolean
  dimmed?: boolean
  rollup: Rollup
  children: string
}) {
  const padStart = depth === 0 ? 'ps-[18px]' : depth === 1 ? 'ps-[32px]' : 'ps-[46px]'
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex items-center gap-2 border-s-2 py-[7px] pe-[18px] text-[13px] ${padStart} ${
          active
            ? 'border-primary bg-primary-tint font-semibold text-primary-strong'
            : `border-transparent hover:bg-primary-tint/50 ${dimmed ? 'text-ink-2' : 'text-ink'}`
        } ${bold && !active ? 'font-semibold' : ''}`}
      >
        <StatusDot state={dotState(rollup)} />
        <span className="min-w-0 flex-1 truncate">{children}</span>
        <span className="font-mono text-[10px] tabular-nums text-ink-2">{rollup.published}</span>
      </Link>
    </li>
  )
}

export function TreeRail({ tree }: { tree: ContentTree }) {
  const t = useTranslations('admin.content.rail')
  const pathname = usePathname()

  return (
    <nav aria-label={t('label')} className="hidden border-e border-line pb-6 pt-6 md:block">
      <MonographLabel as="div" size="sm" className="mb-2.5 ps-[18px]">
        {t('label')}
      </MonographLabel>
      <ul>
        {tree.map((subject) => {
          const sRollup = subjectRollup(subject)
          return (
            <li key={subject.id}>
              <ul>
                <RailRow
                  href={`/admin/content/subject/${subject.id}`}
                  active={pathname === `/admin/content/subject/${subject.id}`}
                  depth={0}
                  bold
                  dimmed={sRollup.total === 0}
                  rollup={sRollup}
                >
                  {subject.name}
                </RailRow>
                {subject.chapters.map((chapter) => {
                  const cRollup = chapterRollup(chapter)
                  return (
                    <li key={chapter.id}>
                      <ul>
                        <RailRow
                          href={`/admin/content/chapter/${chapter.id}`}
                          active={pathname === `/admin/content/chapter/${chapter.id}`}
                          depth={1}
                          dimmed={cRollup.total === 0}
                          rollup={cRollup}
                        >
                          {chapter.name}
                        </RailRow>
                        {chapter.topics.map((topic) => {
                          const tRollup = topicRollup(topic)
                          return (
                            <RailRow
                              key={topic.id}
                              href={`/admin/content/topic/${topic.id}`}
                              active={pathname === `/admin/content/topic/${topic.id}`}
                              depth={2}
                              dimmed={tRollup.total === 0}
                              rollup={tRollup}
                            >
                              {topic.name}
                            </RailRow>
                          )
                        })}
                      </ul>
                    </li>
                  )
                })}
              </ul>
            </li>
          )
        })}
      </ul>
      <p className="mt-4 px-[18px] font-mono text-[9px] uppercase tracking-[0.08em] text-ink-2">
        {t('legend')}
      </p>
    </nav>
  )
}
