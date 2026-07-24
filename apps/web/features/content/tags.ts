/**
 * The content tag cascade (ARCHITECTURE §6): which tags fire when a node's
 * public URL or lists change. Shared by the tree mutations (move/rename)
 * and the workflow transitions (publish/unpublish).
 */
import 'server-only'

import type { ContentLevel } from '@epharmatica/database'
import { revalidateContentTags } from './cache'
import { findChapter, findSubject, findSubtopic, findTopic } from './tree'
import type { ContentTree } from './tree'

/** Fire the ancestor tag cascade for a node (ARCH §6). */
export function fireTagsForNode(
  tree: ContentTree,
  level: ContentLevel,
  id: string,
  affectedSubtopicIds: string[],
): void {
  if (level === 'subject') {
    const subject = findSubject(tree, id)
    if (subject) {
      revalidateContentTags({
        subjectSlugs: [subject.slug],
        chapterIds: subject.chapters.map((chapter) => chapter.id),
        topicIds: subject.chapters.flatMap((chapter) => chapter.topics.map((topic) => topic.id)),
        subtopicIds: affectedSubtopicIds,
        sitemap: true,
      })
    }
    return
  }
  if (level === 'chapter') {
    const found = findChapter(tree, id)
    if (found) {
      revalidateContentTags({
        subjectSlugs: [found.subject.slug],
        chapterIds: [id],
        topicIds: found.chapter.topics.map((topic) => topic.id),
        subtopicIds: affectedSubtopicIds,
        sitemap: true,
      })
    }
    return
  }
  if (level === 'topic') {
    const found = findTopic(tree, id)
    if (found) {
      revalidateContentTags({
        subjectSlugs: [found.subject.slug],
        chapterIds: [found.chapter.id],
        topicIds: [id],
        subtopicIds: affectedSubtopicIds,
        sitemap: true,
      })
    }
    return
  }
  // Subtopic: under a topic OR attached directly to a chapter (flexible leaves).
  const found = findSubtopic(tree, id)
  if (found) {
    revalidateContentTags({
      subjectSlugs: [found.subject.slug],
      chapterIds: [found.chapter.id],
      topicIds: found.topic ? [found.topic.id] : [],
      subtopicIds: [id],
      sitemap: true,
    })
  }
}

/** Fire tags for a DESTINATION parent after a move (its lists changed). */
export function fireTagsForParent(tree: ContentTree, level: ContentLevel, parentId: string): void {
  if (level === 'subtopic') {
    const found = findTopic(tree, parentId)
    if (found) {
      revalidateContentTags({
        subjectSlugs: [found.subject.slug],
        chapterIds: [found.chapter.id],
        topicIds: [parentId],
      })
      return
    }
    // The destination may be a CHAPTER (page moved to a direct leaf, 020).
    const chapterHit = findChapter(tree, parentId)
    if (chapterHit) {
      revalidateContentTags({ subjectSlugs: [chapterHit.subject.slug], chapterIds: [parentId] })
    }
    return
  }
  if (level === 'topic') {
    const found = findChapter(tree, parentId)
    if (found) {
      revalidateContentTags({ subjectSlugs: [found.subject.slug], chapterIds: [parentId] })
    }
    return
  }
  if (level === 'chapter') {
    const subject = findSubject(tree, parentId)
    if (subject) revalidateContentTags({ subjectSlugs: [subject.slug] })
  }
}

/** Publish/unpublish cascade for one subtopic (own tag + ancestors + sitemap). */
export function fireTagsForSubtopic(tree: ContentTree, subtopicId: string): void {
  fireTagsForNode(tree, 'subtopic', subtopicId, [subtopicId])
}
