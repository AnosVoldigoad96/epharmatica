/**
 * Password strength via zxcvbn-ts (securities.md §6: users need min 10 chars
 * + zxcvbn ≥ 2, staff ≥ 3, NO composition rules — hashing is GoTrue's job).
 *
 * Isomorphic on purpose (no `server-only`): the sign-up form runs it for
 * live feedback and the auth server actions re-check the same score. The
 * heavy dictionaries load through a module-level dynamic-import promise, so
 * they are fetched once and never sit in the initial client bundle.
 */

/** Minimum acceptable score for user passwords (securities.md §6). */
export const MIN_PASSWORD_SCORE = 2

/** Staff floor (M4 §13): any role above `user` needs ≥ 12 characters… */
export const STAFF_MIN_PASSWORD_LENGTH = 12

/** …and zxcvbn ≥ 3 — the compensating control for optional 2FA (R-M4a). */
export const STAFF_MIN_PASSWORD_SCORE = 3

export type PasswordScore = 0 | 1 | 2 | 3 | 4

type Checker = { check: (password: string, userInputs?: (string | number)[]) => { score: number } }

let checkerLoad: Promise<Checker> | null = null

function loadChecker(): Promise<Checker> {
  checkerLoad ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-en'),
  ]).then(([core, common, en]) => {
    return new core.ZxcvbnFactory({
      dictionary: { ...common.dictionary, ...en.dictionary },
      graphs: common.adjacencyGraphs,
      translations: en.translations,
    })
  })
  return checkerLoad
}

/**
 * Score a password 0–4. `inputs` weights user-specific strings (email,
 * username, display name) as guessable, so `ayesha@x.com` + `ayesha123`
 * scores low.
 */
export async function passwordStrength(
  password: string,
  inputs?: string[],
): Promise<{ score: PasswordScore }> {
  const checker = await loadChecker()
  const result = checker.check(password, inputs)
  return { score: result.score as PasswordScore }
}

/** i18n key under `auth.strength.*` for the live helper label. */
export function strengthLabelKey(score: PasswordScore): 'tooWeak' | 'okay' | 'good' | 'strong' {
  if (score <= 1) {
    return 'tooWeak'
  }
  if (score === 2) {
    return 'okay'
  }
  if (score === 3) {
    return 'good'
  }
  return 'strong'
}
