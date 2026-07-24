import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { RichText, validateContent } from '@epharmatica/editor'
import { MonographLabel } from '@epharmatica/ui'
import { requireSection } from '@/features/admin/queries'
import { getPreviewLinks, getSubtopicDetail } from '@/features/content/queries'
import { Crumbs } from '../../_components/crumbs'
import { EditorCanvas } from '../../_components/editor-canvas'
import { PreviewLinksPanel } from '../../_components/preview-links-panel'
import { WorkflowRail } from '../../_components/workflow-rail'

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } }
}

/*
 * Subtopic workflow page (M4 §5.4/§5.5 · hi-fi 2e chrome). This slice
 * ships the review/publish loop: read-only render through the REAL reader
 * renderer (I4) beside the workflow rail (transitions, claim, derived
 * fields, revision history + restore + diff). The Plate editing canvas
 * replaces the read-only pane in the next slice.
 */
export default async function AdminSubtopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireSection('content')
  const t = await getTranslations('admin.content.workflow')
  const detail = await getSubtopicDetail(id)
  if (!detail) notFound()
  const previewLinks = await getPreviewLinks(id)

  const validated = validateContent(detail.content)
  const empty = validated.ok && validated.content.length === 0
  const canEdit =
    ['author', 'content_manager', 'admin', 'super_admin'].includes(profile.role) &&
    detail.status !== 'archived'

  return (
    <div className="max-w-5xl">
      <Crumbs
        segments={[detail.path.subjectName, detail.path.chapterName, detail.path.topicName]}
      />
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-[19px] font-bold">{detail.title}</h1>
        <span className="border border-line px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">
          {t(`status.${detail.status}`)}
        </span>
        <span className="font-mono text-[10.5px] text-ink-2">{detail.slug}</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          {canEdit && validated.ok ? (
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
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
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
        </div>
      </div>
    </div>
  )
}
