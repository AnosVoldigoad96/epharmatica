#!/usr/bin/env node
/**
 * Task-completion logging system (Claude Code hooks).
 *
 * Modes:
 *   log      — invoked on TaskCreated / TaskCompleted / PostToolUse(TaskCreate|TaskUpdate).
 *              Records task subjects, and appends a line to the daily log when a
 *              task reaches `completed`. Dedupes by task id per day, so the
 *              overlapping hook events (belt-and-braces) never double-log.
 *   summary  — invoked on Stop and SessionEnd. Regenerates the end-of-day
 *              summary section at the bottom of today's log (idempotent), so a
 *              hard-killed terminal still leaves an up-to-date summary from the
 *              last Stop, and a clean close stamps it "Session closed".
 *
 * Logs: .claude/logs/tasks/YYYY-MM-DD.md (tracked in git — work journal).
 * State: .claude/logs/tasks/.state.json (subject map + per-day dedup).
 * A hook must never break the session: every path exits 0.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

try {
  main()
} catch {
  // Never block a tool call or session close over logging.
}
process.exit(0)

function main() {
  const mode = process.argv[2] ?? 'log'
  const hooksDir = path.dirname(fileURLToPath(import.meta.url))
  const logsDir = process.env.CLAUDE_TASK_LOG_DIR || path.join(hooksDir, '..', 'logs', 'tasks')
  fs.mkdirSync(logsDir, { recursive: true })

  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const logFile = path.join(logsDir, `${day}.md`)
  const stateFile = path.join(logsDir, '.state.json')

  let input = {}
  try {
    input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}')
  } catch {}

  let state = {}
  try {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  } catch {}
  state.subjects ??= {}
  state.logged ??= {}
  state.logged[day] ??= []

  if (mode === 'log') logTask(input, { day, time, logFile, state })
  else if (mode === 'summary') writeSummary(input, { time, logFile })

  fs.writeFileSync(stateFile, JSON.stringify(state))
}

/** Field names differ across hook events — collect every known spelling. */
function extractTask(input) {
  const t =
    input.task && typeof input.task === 'object'
      ? input.task
      : input.tool_input && typeof input.tool_input === 'object'
        ? input.tool_input
        : input
  const first = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== '')
  const id = first(t.taskId, t.task_id, t.id, input.taskId, input.task_id)
  return {
    id: id === undefined ? undefined : String(id),
    subject: first(t.subject, t.title, t.name),
    status: first(t.status, input.status),
  }
}

function logTask(input, { day, time, logFile, state }) {
  const { id, subject, status } = extractTask(input)
  if (id && subject) state.subjects[id] = subject

  const completed = input.hook_event_name === 'TaskCompleted' || status === 'completed'
  if (!completed) return

  const dedupKey = id ?? `untitled:${subject ?? ''}:${time}`
  if (state.logged[day].includes(dedupKey)) return
  state.logged[day].push(dedupKey)

  const label = subject ?? (id && state.subjects[id]) ?? '(untitled task)'
  const entry = `- [x] ${time} — ${id ? `#${id} ` : ''}${label}\n`

  let content = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : ''
  if (!content) content = `# Task log — ${day}\n\n`
  // Entries always live above the summary section; strip and re-append below.
  const [body, summary] = splitSummary(content)
  fs.writeFileSync(logFile, body + entry + (summary ? '\n' + summary : ''))
}

function writeSummary(input, { time, logFile }) {
  if (!fs.existsSync(logFile)) return // nothing completed today — nothing to summarize
  const content = fs.readFileSync(logFile, 'utf8')
  const [body] = splitSummary(content)
  const entries = body.split('\n').filter((l) => l.startsWith('- [x]'))
  const closing = input.hook_event_name === 'SessionEnd'
  const label = closing ? `Session closed ${time}` : `As of ${time}`
  const summary = [
    '## End-of-day summary',
    '',
    `${label} — ${entries.length} task(s) completed today:`,
    '',
    ...entries,
    '',
  ].join('\n')
  fs.writeFileSync(logFile, body.trimEnd() + '\n\n' + summary)
}

function splitSummary(content) {
  const marker = '## End-of-day summary'
  const i = content.indexOf(marker)
  if (i === -1) return [content, '']
  return [content.slice(0, i), content.slice(i)]
}
