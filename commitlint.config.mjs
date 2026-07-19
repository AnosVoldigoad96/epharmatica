/**
 * Conventional Commits enforcement (docs/rules.md §10.1), wired via .husky/commit-msg.
 * The root package.json (owned by the orchestrator) provides @commitlint/cli and
 * @commitlint/config-conventional as devDependencies.
 */
export default {
  extends: ['@commitlint/config-conventional'],
}
