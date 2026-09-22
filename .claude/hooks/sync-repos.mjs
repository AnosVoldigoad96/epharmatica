#!/usr/bin/env node
/**
 * Session-start repo sync (Claude Code SessionStart hook).
 *
 * Fast-forward pulls two repos so every session starts from the latest state:
 *   1. the project repo (the session cwd)
 *   2. the Claude auto-memory repo for this project —
 *      ~/.claude/projects/<sanitized-cwd>/memory, which is itself a git checkout
 *      of github.com/AnosVoldigoad96/epharmatica-claude-memory (private).
 *
 * Rules:
 *   - `git pull --ff-only` only: never creates merge commits, never rewrites
 *     local edits. If a pull can't fast-forward it is reported, not forced.
 *   - Runs on startup / resume / clear. Skipped on compact (not a new session).
 *   - Reports the outcome to the user (systemMessage) and to the model
 *     (additionalContext) so a stale or conflicted checkout is never silent.
 *   - A hook must never break the session: every path exits 0.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const PULL_TIMEOUT_MS = 30_000

/**
 * Read hook JSON from stdin, but never wait longer than `deadlineMs` —
 * a hook that blocks on stdin blocks the session (see task-log.mjs history).
 */
function readStdin(deadlineMs) {
  return new Promise((resolve) => {
    let data = ''
    const done = () => resolve(data)
    const timer = setTimeout(done, deadlineMs)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      data += chunk
    })
    process.stdin.on('end', () => {
      clearTimeout(timer)
      done()
    })
    process.stdin.on('error', () => {
      clearTimeout(timer)
      done()
    })
  })
}

/** Mirror Claude Code's project-dir sanitisation: every non-alphanumeric → '-'. */
function memoryDirFor(cwd) {
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude')
  const sanitized = cwd.replace(/[^a-zA-Z0-9]/g, '-')
  return path.join(configDir, 'projects', sanitized, 'memory')
}

function git(dir, args, timeout = 10_000) {
  return spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
}

function isGitRepo(dir) {
  if (!fs.existsSync(dir)) return false
  const r = git(dir, ['rev-parse', '--is-inside-work-tree'])
  return r.status === 0 && (r.stdout || '').trim() === 'true'
}

function lastLine(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return lines[lines.length - 1] || '(no output)'
}

function pull(label, dir) {
  if (!isGitRepo(dir)) {
    return { ok: false, skipped: true, msg: `${label}: no git repo at ${dir} — skipped` }
  }
  const branch = (git(dir, ['rev-parse', '--abbrev-ref', 'HEAD']).stdout || '').trim() || '?'
  const r = git(dir, ['pull', '--ff-only'], PULL_TIMEOUT_MS)
  const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim()

  if (r.error) {
    const why =
      r.error.code === 'ETIMEDOUT' ? `timed out after ${PULL_TIMEOUT_MS / 1000}s` : r.error.message
    return { ok: false, msg: `${label} (${branch}): pull failed — ${why}` }
  }
  if (r.status !== 0) {
    if (/no tracking information/i.test(out)) {
      return {
        ok: false,
        skipped: true,
        msg: `${label} (${branch}): no upstream configured — skipped`,
      }
    }
    return { ok: false, msg: `${label} (${branch}): pull failed — ${lastLine(out)}` }
  }
  if (/already up to date/i.test(out)) {
    return { ok: true, msg: `${label} (${branch}): already up to date` }
  }
  const stat = out
    .split(/\r?\n/)
    .find((l) => /files? changed/.test(l))
    ?.trim()
  return { ok: true, msg: `${label} (${branch}): fast-forwarded${stat ? ` — ${stat}` : ''}` }
}

async function main() {
  let payload = {}
  try {
    const raw = await readStdin(1500)
    if (raw.trim()) payload = JSON.parse(raw)
  } catch {
    payload = {}
  }

  // Compaction is not a new session — nothing to sync.
  if (payload.source === 'compact') return

  const cwd = payload.cwd || process.cwd()
  const results = [pull('project', cwd), pull('memory', memoryDirFor(cwd))]

  const failed = results.filter((r) => !r.ok && !r.skipped)
  const summary = results.map((r) => r.msg).join('; ')
  const output = {
    systemMessage: `Repo sync: ${summary}`,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        `Session-start repo sync (git pull --ff-only):\n- ${results.map((r) => r.msg).join('\n- ')}` +
        (failed.length
          ? '\nOne or more pulls FAILED — the checkout may be stale or have local changes that conflict. Tell the user before relying on repo state.'
          : ''),
    },
  }
  process.stdout.write(`${JSON.stringify(output)}\n`)
}

main()
  .catch((err) => {
    process.stdout.write(
      `${JSON.stringify({ systemMessage: `Repo sync hook error: ${err?.message || err}` })}\n`,
    )
  })
  .finally(() => process.exit(0))
