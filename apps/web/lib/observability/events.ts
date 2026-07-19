/**
 * Umami event names are constants only — no ad-hoc strings anywhere, events
 * carry no PII, and each module implements its PRD's exact event taxonomy
 * (docs/rules.md §11).
 */
export const EVENTS = {
  waitlist_joined: 'waitlist_joined',
  preview_gate_viewed: 'preview_gate_viewed',
  preview_gate_signin_clicked: 'preview_gate_signin_clicked',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]
