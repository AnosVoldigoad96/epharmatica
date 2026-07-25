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

/** Delete… is admin+ only (founder directive; DELETING_ROLES server-side). */
function canDelete(role: StaffRole): boolean {
  return role === 'admin' || role === 'super_admin'
}

/**
 * Move destinations for a content page (flexible leaves, 020): every
 * CHAPTER (page becomes a direct leaf — parentLevel 'chapter', the move
 * sheet groups these under its own label) plus every topic. `current`
 * matches the page's present parent, whichever level that is.
 */
function pageMoveTargets(tree: ContentTree, currentParentId: string): MoveTarget[] {
  const chapterTargets: MoveTarget[] = tree.flatMap((subject) =>
    subject.chapters.map((chapter) => ({
      id: chapter.id,
      label: `${subject.name} › ${chapter.name}`,
      group: '',
      parentLevel: 'chapter' as const,
      current: chapter.id === currentParentId,
      pathSegments: [subject.slug, chapter.slug],
    })),
  )
  const topicTargets: MoveTarget[] = tree.flatMap((subject) =>
    subject.chapters.flatMap((chapter) =>
      chapter.topics.map((topic) => ({
        id: topic.id,
        label: `${chapter.name} › ${topic.name}`,
        group: subject.name,
        current: topic.id === currentParentId,
        pathSegments: [subject.slug, chapter.slug, topic.slug],
      })),
    ),
  )
  return [...chapterTargets, ...topicTargets]
}

/** A page/subtopic row is the same shape wherever it lists (topic or chapter). */
function pageRow(
  subtopic: ContentTree[number]['chapters'][number]['leaves'][number],
  pathSegments: string[],
): ListRow {
  return {
    id: subtopic.id,
    name: subtopic.title,
    slug: subtopic.slug,
    status: { kind: 'own', status: subtopic.status },
    semester: null,
    updatedAt: subtopic.updated_at,
    openHref: `/admin/content/subtopic/${subtopic.id}`,
    publishedBeneath: subtopic.status === 'published' ? 1 : 0,
    pathSegments,
    form: { name: subtopic.title, slug: subtopic.slug },
  }
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
  return {
    level: 'subject',
    parentId: null,
    rows,
    moveTargets: [],
    canManage: canManage(role),
    canDelete: canDelete(role),
  }
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
    canDelete: canDelete(role),
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
    canDelete: canDelete(role),
    // Flexible leaves (020): the chapter's direct content pages, a second
    // grouped section (own sort space) in the same table.
    pages: {
      rows: chapter.leaves.map((leaf) => pageRow(leaf, [subject.slug, chapter.slug, leaf.slug])),
      moveTargets: pageMoveTargets(tree, chapterId),
    },
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

  const rows: ListRow[] = topic.subtopics.map((subtopic) =>
    pageRow(subtopic, [subject.slug, chapter.slug, topic.slug, subtopic.slug]),
  )

  return {
    level: 'subtopic',
    parentId: topicId,
    rows,
    // Pages can now also move DIRECTLY under a chapter (020).
    moveTargets: pageMoveTargets(tree, topicId),
    canManage: canManage(role),
    canDelete: canDelete(role),
  }
}
