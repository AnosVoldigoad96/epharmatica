/**
 * AAL step-up check (M4-5): true when the session holds a verified factor
 * it has not yet passed (currentLevel aal1, nextLevel aal2). Layouts gate
 * on this server-side — layer 2 of enforcement; GoTrue itself never blocks
 * a password sign-in. Degrades to false on any error (env-less dev, no
 * session), so nothing new can lock anyone out.
 */
import 'server-only'

import { createClient } from '@/lib/supabase/server'

export async function mfaStepUpRequired(): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    return Boolean(data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2')
  } catch {
    return false
  }
}
