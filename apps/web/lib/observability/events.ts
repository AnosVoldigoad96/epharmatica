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
  // M1 §10 — study layer (1.D). Fired from the client via trackEvent()
  // below (the layer mounts signed-in only, so these are member events);
  // video_played is declarative on the LiteYouTube facade's play button.
  subtopic_opened: 'subtopic_opened',
  subtopic_completed: 'subtopic_completed',
  subtopic_uncompleted: 'subtopic_uncompleted',
  highlight_created: 'highlight_created',
  note_created: 'note_created',
  bookmark_toggled: 'bookmark_toggled',
  continue_clicked: 'continue_clicked',
  video_played: 'video_played',
  // M2 §10 — accounts core (Phase 1.A). Constants only; nothing fires
  // these yet.
  signup_started: 'signup_started',
  signup_completed: 'signup_completed',
  oauth_completion_shown: 'oauth_completion_shown',
  identity_linked: 'identity_linked',
  email_verified: 'email_verified',
  signin: 'signin',
  signout_everywhere: 'signout_everywhere',
} as const

export type EventName = (typeof EVENTS)[keyof typeof EVENTS]

type UmamiGlobal = {
  track?: (name: string, data?: Record<string, string | number | boolean>) => void
}

/**
 * Programmatic Umami send (rules.md §11) for events that fire from client
 * logic rather than a clickable element (mount events, action results).
 * No-op on the server and when the self-hosted script isn't configured —
 * analytics never gates product behavior. Props must stay PII-free:
 * enum-ish strings only (e.g. { kind: 'prose' }).
 */
export function trackEvent(
  name: EventName,
  data?: Record<string, string | number | boolean>,
): void {
  if (typeof window === 'undefined') return
  const umami = (window as { umami?: UmamiGlobal }).umami
  try {
    umami?.track?.(name, data)
  } catch {
    // Never let analytics break the study surface.
  }
}
