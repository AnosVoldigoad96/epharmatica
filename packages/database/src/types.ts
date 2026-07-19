/**
 * GENERATED FILE — placeholder until the local Supabase stack runs.
 *
 * Regenerate with `pnpm --filter @epharmatica/database gen:types` (wraps
 * `supabase gen types typescript --local`). CI enforces zero drift between
 * migrations and this file (rules.md I7 / plan §0.B). Never hand-edit beyond
 * this placeholder stage.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// Placeholder shape — replaced wholesale by `supabase gen types` once the
// local stack is provisioned (development-plan.md 0.A/0.D).
export interface Database {
  public: {
    Tables: Record<string, { Row: unknown; Insert: unknown; Update: unknown }>
    Views: Record<string, { Row: unknown }>
    Functions: Record<string, unknown>
    Enums: Record<string, string>
  }
}
