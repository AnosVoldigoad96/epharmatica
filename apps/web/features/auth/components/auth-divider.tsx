import { MonographLabel } from '@epharmatica/ui'

/**
 * The OR divider between the Google button and the email fields (wireframes
 * §1–2): hairline — mono label — hairline. Decorative; hidden from assistive
 * tech (the two alternatives are self-explanatory).
 */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div aria-hidden className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <MonographLabel size="sm">{label}</MonographLabel>
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}
