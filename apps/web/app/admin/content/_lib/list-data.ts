import type { ContentTree } from '@/features/content/tree'
import {
  chapterRollup,
  findChapter,
  findSubject,
  findTopic,
  subjectRollup,
  topicRollup,
} from '@/features/content/tree'
import type { StaffRole } from '@/features/admin/permissions'
import type { ListEditorData, ListRow, MoveTarget } from '../_components/list-types'

/**
 * Pure builders slicing the fetched tree into the list editor's contract
 * (rows + legal move targets + path segments for the consequence sheets).
 */

function canManage(role: StaffRole): boolean {
  return role === 'content_manager' || role === 'admin' || role === 'super_admin'
}

export function subjectListData(tree: ContentTree, role: StaffRole): ListEditorData {
  const rows: ListRow[] = tree.map((subject) => {
    const rollup = subjectRollup(subject)
    return {
      id: subject.id,
      name: subject.name,
      slug: subject.slug,
      status: { kind: 'rollup', ...rollup },
      semester: null,
      updatedAt: subject.updated_at,
      openHref: `/admin/content/subject/${subject.id}`,
      publishedBeneath: rollup.published,
      pathSegments: [subject.slug],
      form: {
        name: subject.name,
        slug: subject.slug,
        description: subject.description,
        icon: subject.icon,
        defaultSemester: subject.default_semester,
      },
    }
  })
  // Subjects have no parent — no Move… targets (M4 §5.3).
  return { level: 'subject', parentId: null, rows, moveTargets: [], canManage: canManage(role) }
}

export function chapterListData(
  tree: ContentTree,
  subjectId: string,
  role: StaffRole,
): ListEditorData | null {
  const subject = findSubject(tree, subjectId)
  if (!subject) return null

  const rows: ListRow[] = subject.chapters.map((chapter) => {
    const rollup = chapterRollup(chapter)
    return {
      id: chapter.id,
      name: chapter.name,
      slug: chapter.slug,
      status: { kind: 'rollup', ...rollup },
      semester: null,
      updatedAt: chapter.updated_at,
      openHref: `/admin/content/chapter/${chapter.id}`,
      publishedBeneath: rollup.published,
      pathSegments: [subject.slug, chapter.slug],
      form: { name: chapter.name, slug: chapter.slug },
    }
  })

  const moveTargets: MoveTarget[] = tree.map((candidate) => ({
    id: candidate.id,
    label: candidate.name,
    group: '',
    current: candidate.id === subjectId,
    pathSegments: [candidate.slug],
  }))

  return {
    level: 'chapter',
    parentId: subjectId,
    rows,
    moveTargets,
    canManage: canManage(role),
  }
}

export function topicListData(
  tree: ContentTree,
  chapterId: string,
  role: StaffRole,
): ListEditorData | null {
  const found = findChapter(tree, chapterId)
  if (!found) return null
  const { subject, chapter } = found

  const rows: ListRow[] = chapter.topics.map((topic) => {
    const rollup = topicRollup(topic)
    return {
      id: topic.id,
      name: topic.name,
      slug: topic.slug,
      status: { kind: 'rollup', ...rollup },
      semester: topic.semester,
      updatedAt: topic.updated_at,
      openHref: `/admin/content/topic/${topic.id}`,
      publishedBeneath: rollup.published,
      pathSegments: [subject.slug, chapter.slug, topic.slug],
      form: {
        name: topic.name,
        slug: topic.slug,
        description: topic.description,
        semester: topic.semester,
      },
    }
  })

  const moveTargets: MoveTarget[] = tree.flatMap((candidateSubject) =>
    candidateSubject.chapters.map((candidateChapter) => ({
      id: candidateChapter.id,
      label: candidateChapter.name,
      group: candidateSubject.name,
      current: candidateChapter.id === chapterId,
      pathSegments: [candidateSubject.slug, candidateChapter.slug],
    })),
  )

  return {
    level: 'topic',
    parentId: chapterId,
    rows,
    moveTargets,
    canManage: canManage(role),
  }
}

export function subtopicListData(
  tree: ContentTree,
  topicId: string,
  role: StaffRole,
): ListEditorData | null {
  const found = findTopic(tree, topicId)
  if (!found) return null
  const { subject, chapter, topic } = found

  const rows: ListRow[] = topic.subtopics.map((subtopic) => ({
    id: subtopic.id,
    name: subtopic.title,
    slug: subtopic.slug,
    status: { kind: 'own', status: subtopic.status },
    semester: null,
    updatedAt: subtopic.updated_at,
    openHref: `/admin/content/subtopic/${subtopic.id}`,
    publishedBeneath: subtopic.status === 'published' ? 1 : 0,
    pathSegments: [subject.slug, chapter.slug, topic.slug, subtopic.slug],
    form: { name: subtopic.title, slug: subtopic.slug },
  }))

  const moveTargets: MoveTarget[] = tree.flatMap((candidateSubject) =>
    candidateSubject.chapters.flatMap((candidateChapter) =>
      candidateChapter.topics.map((candidateTopic) => ({
        id: candidateTopic.id,
        label: `${candidateChapter.name} › ${candidateTopic.name}`,
        group: candidateSubject.name,
        current: candidateTopic.id === topicId,
        pathSegments: [candidateSubject.slug, candidateChapter.slug, candidateTopic.slug],
      })),
    ),
  )

  return {
    level: 'subtopic',
    parentId: topicId,
    rows,
    moveTargets,
    canManage: canManage(role),
  }
}
