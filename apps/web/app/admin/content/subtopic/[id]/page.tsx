import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { RichText, validateContent } from '@epharmatica/editor'
import { MonographLabel } from '@epharmatica/ui'
import { requireSection } from '@/features/admin/queries'
import {
  getContentTree,
  getDiscussions,
  getPreviewLinks,
  getSubtopicDetail,
} from '@/features/content/queries'
import { findSubtopic } from '@/features/content/tree'
import { Crumbs } from '../../_components/crumbs'
import { DeleteZone } from '../../_components/delete-zone'
import { DiscussionsWorkspace } from '../../_components/discussions-panel'
import { EditorCanvas } from '../../_components/editor-canvas'
import { PreviewLinksPanel } from '../../_components/preview-links-panel'
import { WorkflowRail } from '../../_components/workflow-rail'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } }
}

/*
 * Subtopic workflow page (M4 §5.4/§5.5 · hi-fi 2e chrome). This slice
 * ships the review/publish loop: the Plate canvas for authors, the
 * read-only render through the REAL reader renderer (I4) for everyone
 * else, the workflow rail (transitions, claim, derived fields, revisions),
 * preview links, and block-anchored review discussions (1.B-3c). The page
 * stays a server component — DiscussionsWorkspace (client) lifts the
 * block-selection state over the server-rendered preview + rail children.
 */
export default async function AdminSubtopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireSection('content')
  const t = await getTranslations('admin.content.workflow')
  const detail = await getSubtopicDetail(id)
  if (!detail) notFound()
  const [previewLinks, discussions] = await Promise.all([getPreviewLinks(id), getDiscussions(id)])

  const validated = validateContent(detail.content)
  const empty = validated.ok && validated.content.length === 0
  const canEdit =
    ['author', 'content_manager', 'admin', 'super_admin'].includes(profile.role) &&
    detail.status !== 'archived'
  const editing = canEdit && validated.ok

  // Delete… is admin+ only (founder directive, 023) — resolved server-side
  // so the danger zone never renders for other staff. The react-cached tree
  // (already fetched inside getSubtopicDetail) locates the parent list a
  // successful delete navigates back to.
  const canDelete = ['admin', 'super_admin'].includes(profile.role)
  const located = canDelete ? findSubtopic(await getContentTree(), detail.id) : null

  return (
    <div className="max-w-5xl">
      <Crumbs
        segments={[
          detail.path.subjectName,
          detail.path.chapterName,
          // Chapter-attached pages (020) have no topic in the path.
          ...(detail.path.topicName !== null ? [detail.path.topicName] : []),
        ]}
      />
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-[19px] font-bold">{detail.title}</h1>
        <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
          {t(`status.${detail.status}`)}
        </span>
        <span className="font-mono text-[10.5px] text-ink-2">{detail.slug}</span>
      </div>

      <DiscussionsWorkspace
        subtopicId={detail.id}
        threads={discussions}
        knownBlockIds={validated.ok ? validated.content.map((block) => block.id) : []}
        selectable={!editing}
        preview={
          editing ? (
            <EditorCanvas
              subtopicId={detail.id}
              initialContent={validated.content}
              previewBlockCount={detail.preview_block_count}
            />
          ) : (
            <>
              <MonographLabel as="div" size="sm" className="mb-3">
                {t('previewLabel')}
              </MonographLabel>
              <div className="border border-line bg-surface p-5">
                {!validated.ok ? (
                  <p className="text-[13px] text-danger">{t('invalidContent')}</p>
                ) : empty ? (
                  <p className="text-[13px] text-ink-2">{t('emptyContent')}</p>
                ) : (
                  <RichText content={validated.content} />
                )}
              </div>
            </>
          )
        }
        rail={
          <>
            <WorkflowRail
              detail={{
                id: detail.id,
                status: detail.status,
                readingMinutes: detail.reading_minutes,
                primaryVideoUrl: detail.primary_video_url,
                semester: detail.path.semester,
                claimedBy: detail.claimedBy,
                revisions: detail.revisions,
                events: detail.events,
              }}
              currentContent={validated.ok ? validated.content : null}
              viewer={{ id: profile.id, role: profile.role }}
            />
            <PreviewLinksPanel
              subtopicId={detail.id}
              links={previewLinks}
              canCreate={
                canEdit &&
                (detail.status === 'draft' ||
                  detail.status === 'in_review' ||
                  detail.status === 'changes_requested')
              }
            />
            {located ? (
              <DeleteZone
                level="subtopic"
                id={detail.id}
                name={detail.title}
                status={{ kind: 'own', status: located.subtopic.status }}
                afterDeleteHref={
                  located.topic
                    ? `/admin/content/topic/${located.topic.id}`
                    : `/admin/content/chapter/${located.chapter.id}`
                }
              />
            ) : null}
          </>
        }
      />
    </div>
  )
}
