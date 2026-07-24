/**
 * Umami event names are constants only — no ad-hoc strings anywhere, events
 * carry no PII, and each module implements its PRD's exact event taxonomy
 * (docs/rules.md §11).
 */
export const EVENTS = {
  waitlist_joined: 'waitlist_joined',
  preview_gate_viewed: 'preview_gate_viewed',
  preview_gate_signin_clicked: 'preview_gate_signin_clicked',
  // M1 §10 — search (1.C-3). Fired declaratively via data-umami-event
  // attributes on /search (no client JS).
  search_performed: 'search_performed',
  search_result_clicked: 'search_result_clicked',
  // M2 §10 — accounts core (Phase 1.A). Constants only; the Umami send
  // helper is still TODO (rules.md §11) — nothing fires these yet.
  signup_started: 'signup_started',
  signup_completed: 'signup_completed',
  oauth_completion_shown: 'oauth_completion_shown',
  identity_linked: 'identity_linked',
  email_verified: 'email_verified',
  signin: 'signin',
  signout_everywhere: 'signout_everywhere',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]
