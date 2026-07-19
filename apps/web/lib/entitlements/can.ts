/**
 * Server-side entitlement gate — invariant I5 (docs/rules.md §2):
 * any feature that could ever be premium calls `can(user, feature)` on the
 * server. No client-side entitlement trust. The layer ships dormant from
 * Phase 1 so monetization stays a switch, not a refactor (R8).
 */
export async function can(_userId: string | null, _feature: string): Promise<boolean> {
  // Phase 0: a single implicit free plan — every feature is granted.
  // TODO(Phase 1 · migration 003, I5): resolve against plans / entitlements /
  // feature_flags tables (security-definer `can_feature()` helper) so premium
  // candidates (AI surfaces, resume templates, …) are gated server-side.
  return true
}
