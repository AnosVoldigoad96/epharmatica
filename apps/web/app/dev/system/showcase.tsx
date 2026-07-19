'use client'

import { useState, type ReactNode } from 'react'
import { Check, CircleAlert, CircleCheck, MessageSquare, StickyNote } from 'lucide-react'
import {
  ActionBar,
  BlisterCell,
  BlisterGrid,
  MonographLabel,
  OfflineBanner,
  ProgressStrip,
  ReadingBar,
  SelectionPopover,
  Stamp,
  StackedRecord,
  StateGlyph,
  TextSizeControl,
  ToastProvider,
  useToast,
  WaitlistForm,
  type TextSize,
  type WaitlistResult,
} from '@epharmatica/ui'

/* ------------------------------------------------------------------------ */
/* Scaffolding                                                              */
/* ------------------------------------------------------------------------ */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// Demo-only chrome (not primitives): ghost button + mono chip per canvas CSS.
const demoBtn =
  'inline-flex h-8 cursor-pointer items-center gap-2 border border-ink bg-transparent px-3 text-[13px] font-medium text-ink hover:bg-primary-tint active:bg-primary-tint'
const demoChip =
  'inline-block whitespace-nowrap border border-line bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-[0.05em] text-ink-2'

function Section({
  index,
  title,
  children,
}: {
  index: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-4">
      <MonographLabel as="h2" rule="hard">
        {index} · {title}
      </MonographLabel>
      {children}
    </section>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="max-w-[72ch] text-[13px] text-ink-2">{children}</p>
}

/* ------------------------------------------------------------------------ */
/* Interactive demos (each needs the section's ToastProvider)               */
/* ------------------------------------------------------------------------ */

function BlisterDemo() {
  const { toast } = useToast()
  const units = [
    {
      id: 'UNIT 01',
      title: 'Renal handling',
      meta: (
        <>
          <StateGlyph state="complete" />
          <Stamp>COMPLETED · 12 JUL</Stamp>
        </>
      ),
    },
    {
      id: 'UNIT 02',
      title: 'Thiazides',
      meta: (
        <>
          <StateGlyph state="in-progress" />
          <span className={demoChip}>IN PROGRESS</span>
        </>
      ),
    },
    {
      id: 'UNIT 03',
      title: 'Loop diuretics',
      meta: (
        <>
          <StateGlyph state="not-started" />
          <span className={demoChip}>12 MIN</span>
        </>
      ),
    },
    {
      id: 'UNIT 04',
      title: 'K⁺-sparing agents',
      meta: (
        <>
          <StateGlyph state="not-started" />
          <span className={demoChip}>8 MIN</span>
        </>
      ),
    },
  ]
  return (
    <div className="flex flex-col gap-4">
      <BlisterGrid minCell={220} className="max-w-2xl">
        {units.map((unit) => (
          <BlisterCell
            key={unit.id}
            onSelect={() => toast({ title: `Opened ${unit.id} · ${unit.title}.` })}
          >
            <MonographLabel as="span" size="sm">
              {unit.id}
            </MonographLabel>
            <span className="mt-1.5 block font-display text-[14.5px] font-semibold text-ink">
              {unit.title}
            </span>
            <span className="mt-2 flex items-center gap-2">{unit.meta}</span>
          </BlisterCell>
        ))}
      </BlisterGrid>
      <Note>
        Interactive cells (onSelect): hover = 1px ink inner outline + primary-tint, press via
        :active. The column count responds to the container, not the viewport.
      </Note>
      <BlisterGrid columns={3} className="max-w-2xl">
        <BlisterCell>
          <MonographLabel as="span" size="sm">
            LEARNING
          </MonographLabel>
        </BlisterCell>
        <BlisterCell>
          <MonographLabel as="span" size="sm">
            COMMUNITY
          </MonographLabel>
        </BlisterCell>
        <BlisterCell href="#dev-system-dark">
          <MonographLabel as="span" size="sm">
            LINK CELL →
          </MonographLabel>
        </BlisterCell>
      </BlisterGrid>
    </div>
  )
}

function StampDemo() {
  const [replayKey, setReplayKey] = useState(0)
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Stamp>COMPLETED · 12 JUL</Stamp>
      <Stamp>ON THE LIST · 18 JUL</Stamp>
      <Stamp key={replayKey} animate>
        COMPLETED · 12 JUL
      </Stamp>
      <button type="button" className={demoBtn} onClick={() => setReplayKey((k) => k + 1)}>
        Replay animation
      </button>
    </div>
  )
}

function PopoverDemo() {
  const { toast } = useToast()
  const [mode, setMode] = useState<'none' | 'anchored' | 'docked'>('none')
  const close = () => setMode('none')
  return (
    <div className="flex flex-col gap-4">
      <div className="relative max-w-2xl border border-line bg-surface p-6 pt-16 text-[14px] leading-[1.65] text-ink">
        <p className="max-w-[60ch]">
          Because roughly 25% of filtered sodium is reabsorbed at this site, blockade here cannot be
          fully compensated downstream.{' '}
          <span className="bg-primary-tint shadow-[0_1px_0_var(--color-primary)]">
            Efficacy is preserved even at low glomerular filtration rates
          </span>
          , which is why loop agents remain useful where thiazides fail.
        </p>
        <SelectionPopover
          open={mode === 'anchored'}
          anchor={{ x: 250, y: 104 }}
          onHighlight={(color) => {
            toast({ title: `Highlighted in ${color}.` })
            close()
          }}
          onNote={() => {
            toast({ title: 'Note started.', icon: StickyNote })
            close()
          }}
          onExplain={() => {
            toast({ title: 'Explain requested.', icon: MessageSquare })
            close()
          }}
          onDismiss={close}
        />
      </div>
      <SelectionPopover
        open={mode === 'docked'}
        docked
        onHighlight={(color) => {
          toast({ title: `Highlighted in ${color}.` })
          close()
        }}
        onNote={() => {
          toast({ title: 'Note started.', icon: StickyNote })
          close()
        }}
        onDismiss={close}
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={demoBtn} onClick={() => setMode('anchored')}>
          Show at caret
        </button>
        <button type="button" className={demoBtn} onClick={() => setMode('docked')}>
          Show docked (touch)
        </button>
      </div>
      <Note>
        Esc or outside click dismisses. Highlight expands the 4 square color dots. The docked
        variant (no onExplain passed, so no Explain action) fixes to the bottom of the viewport,
        48px above the safe area.
      </Note>
    </div>
  )
}

function ActionBarDemo() {
  const { toast } = useToast()
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-md">
        {/* Demo override: rendered in-flow and visible on desktop. In the
            product it is fixed to the viewport bottom and mobile-only. */}
        <ActionBar
          className="static! md:flex!"
          actions={[
            {
              id: 'complete',
              icon: Check,
              label: 'Complete',
              emphasized: true,
              onSelect: () => toast({ title: 'Marked complete.', icon: CircleCheck }),
            },
            {
              id: 'note',
              icon: StickyNote,
              label: 'Note',
              onSelect: () => toast({ title: 'Note started.', icon: StickyNote }),
            },
            {
              id: 'assist',
              icon: MessageSquare,
              label: 'Assist',
              onSelect: () => toast({ title: 'Assist opened.' }),
            },
          ]}
        />
      </div>
      <Note>
        56px + safe-area, surface, 1px hard ink top rule; icon over 10px mono label; the emphasized
        action takes the primary fill. Replaces FABs — nothing floats.
      </Note>
    </div>
  )
}

function OfflineDemo() {
  return (
    <div className="flex flex-col gap-4">
      <OfflineBanner />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={demoBtn}
          onClick={() => window.dispatchEvent(new Event('offline'))}
        >
          Simulate offline
        </button>
        <button
          type="button"
          className={demoBtn}
          onClick={() => window.dispatchEvent(new Event('online'))}
        >
          Back online
        </button>
      </div>
      <Note>
        Renders nothing while online (and nothing during SSR/first paint). The buttons dispatch
        window offline/online events to preview the warn-tinted strip.
      </Note>
    </div>
  )
}

function ToastDemo() {
  const { toast } = useToast()
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={demoBtn}
          onClick={() => toast({ title: 'Progress saved.', icon: CircleCheck })}
        >
          Default toast
        </button>
        <button
          type="button"
          className={demoBtn}
          onClick={() =>
            toast({
              title: 'Note saved.',
              icon: StickyNote,
              action: { label: 'View', onSelect: () => undefined },
            })
          }
        >
          With action
        </button>
        <button
          type="button"
          className={demoBtn}
          onClick={() =>
            toast({
              title: "Couldn't sync — check your connection.",
              icon: CircleAlert,
              variant: 'error',
            })
          }
        >
          Error (persists)
        </button>
        <button
          type="button"
          className={demoBtn}
          onClick={() => {
            toast({ title: 'First of three.' })
            toast({ title: 'Second of three.' })
            toast({ title: 'Third of three — queued.' })
          }}
        >
          Fire 3 (max 2 visible)
        </button>
      </div>
      <Note>
        Bottom-center on desktop, above the action-bar zone on mobile. 5s default; errors persist
        until dismissed; visible stack max 2 with the rest queued.
      </Note>
    </div>
  )
}

function TextSizeDemo() {
  const [size, setSize] = useState<TextSize>(16)
  const leading = size === 14 ? 1.7 : size === 16 ? 1.65 : 1.6
  return (
    <div className="flex flex-col gap-4">
      <TextSizeControl value={size} onChange={setSize} />
      <p className="max-w-[68ch] text-ink" style={{ fontSize: size, lineHeight: leading }}>
        Loop diuretics inhibit the Na⁺-K⁺-2Cl⁻ symporter in the thick ascending limb — the
        highest-efficacy diuretic class. Efficacy persists at low GFR, the reason they are preferred
        in renal impairment.
      </p>
    </div>
  )
}

function WaitlistDemo() {
  const modules = [
    { value: 'learning', label: 'Learning' },
    { value: 'community', label: 'Community' },
    { value: 'blog', label: 'Blog' },
    { value: 'jobs', label: 'Jobs' },
    { value: 'resume', label: 'Resume builder' },
  ]
  const roles = [
    { value: 'student', label: 'Student' },
    { value: 'professional', label: 'Professional' },
    { value: 'other', label: 'Other' },
  ]
  const labels = {
    email: 'EMAIL',
    emailPlaceholder: 'you@university.edu.pk',
    module: 'MODULE',
    role: 'ROLE',
    submit: 'Join waitlist',
    successPrefix: 'ON THE LIST',
    genericError: 'Something went wrong — try again.',
  }
  const succeed = async (): Promise<WaitlistResult> => {
    await sleep(600)
    return { ok: true, dateLabel: '18 JUL' }
  }
  const fail = async (): Promise<WaitlistResult> => {
    await sleep(600)
    return { ok: false, error: 'That email is already on the list.' }
  }
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <MonographLabel size="sm">RESOLVES OK — SUCCESS BECOMES THE STAMP</MonographLabel>
        <WaitlistForm action={succeed} modules={modules} roles={roles} labels={labels} />
      </div>
      <div className="flex flex-col gap-3">
        <MonographLabel size="sm">RESOLVES WITH AN ERROR</MonographLabel>
        <WaitlistForm action={fail} modules={modules} roles={roles} labels={labels} />
      </div>
      <Note>
        No turnstileSiteKey passed here, so the Turnstile widget is skipped (dev). One column on
        coarse pointers, 16px input text, labels above.
      </Note>
    </div>
  )
}

/* ------------------------------------------------------------------------ */
/* One full set of the 13 primitives                                        */
/* ------------------------------------------------------------------------ */

function ThemeSet({ variant }: { variant: 'light' | 'dark' }) {
  return (
    <ToastProvider>
      <div className="mx-auto flex max-w-[1200px] flex-col gap-12">
        <header className="flex flex-col gap-2">
          <MonographLabel size="sm">/DEV/SYSTEM · STYLE.MD V1.3 · PHARMACOPOEIA</MonographLabel>
          <h1 className="font-display text-[25px] font-bold tracking-[-0.02em]">
            System primitives — {variant} theme
          </h1>
        </header>

        <Section index="01" title="MONOGRAPH LABEL">
          <div className="flex flex-col gap-3">
            <MonographLabel>UPDATED 12 JUL 2026</MonographLabel>
            <MonographLabel size="sm">SEM 04 · REF 2026-0714</MonographLabel>
            <MonographLabel rule="hard" as="h3" className="max-w-xs">
              TOPIC · DIURETICS
            </MonographLabel>
          </div>
        </Section>

        <Section index="02" title="STATE GLYPH">
          <div className="flex flex-wrap items-center gap-6">
            <span className="flex items-center gap-2 text-[13.5px]">
              <StateGlyph state="not-started" /> Not started
            </span>
            <span className="flex items-center gap-2 text-[13.5px]">
              <StateGlyph state="in-progress" /> In progress
            </span>
            <span className="flex items-center gap-2 text-[13.5px]">
              <StateGlyph state="complete" /> Complete
            </span>
            <StateGlyph state="in-progress" size={20} label="Unit in progress" />
          </div>
        </Section>

        <Section index="03" title="PROGRESS STRIP">
          <div className="flex items-center gap-2.5">
            <ProgressStrip units={['complete', 'complete', 'in-progress', 'not-started']} />
            <span className="font-mono text-[12px] tabular-nums text-ink-2">2 / 4</span>
          </div>
        </Section>

        <Section index="04" title="BLISTER GRID / CELL">
          <BlisterDemo />
        </Section>

        <Section index="05" title="STAMP">
          <StampDemo />
        </Section>

        <Section index="06" title="SELECTION POPOVER">
          <PopoverDemo />
        </Section>

        <Section index="07" title="ACTION BAR">
          <ActionBarDemo />
        </Section>

        <Section index="08" title="STACKED RECORD">
          <StackedRecord
            className="max-w-2xl"
            rows={[
              { label: 'DRUG', value: <span className="font-semibold">Furosemide</span> },
              { label: 'CLASS', value: 'Loop diuretic — sulfonamide derivative' },
              {
                label: 'MOA',
                value: 'Inhibits NKCC2 in the thick ascending limb; abolishes medullary gradient',
              },
              {
                label: 'USES',
                value:
                  'Acute pulmonary edema · heart failure · edema of renal/hepatic disease · hypercalcemia',
              },
              {
                label: 'ADVERSE',
                value: (
                  <>
                    <mark className="bg-hl-amber px-0.5 text-ink">
                      Ototoxicity (dose-related, worse with aminoglycosides)
                    </mark>{' '}
                    · hypokalemia · alkalosis · hyperuricemia
                  </>
                ),
              },
              {
                label: 'CONTRA',
                value:
                  'Anuria unresponsive to a trial dose · sulfonamide hypersensitivity (relative)',
              },
            ]}
          />
        </Section>

        <Section index="09" title="OFFLINE BANNER">
          <OfflineDemo />
        </Section>

        <Section index="10" title="TOAST">
          <ToastDemo />
        </Section>

        <Section index="11" title="TEXT SIZE CONTROL">
          <TextSizeDemo />
        </Section>

        <Section index="12" title="READING BAR">
          {variant === 'light' ? (
            <>
              <ReadingBar />
              <Note>
                The 2px primary bar fixed to the very top of the viewport tracks document scroll —
                scroll this page to see it advance.
              </Note>
            </>
          ) : (
            <>
              <ReadingBar targetId="dev-system-dark" />
              <Note>
                This instance measures the dark section only (targetId) — the top-edge bar advances
                while the dark half scrolls through the viewport, in dark primary.
              </Note>
            </>
          )}
        </Section>

        <Section index="13" title="WAITLIST FORM">
          <WaitlistDemo />
        </Section>
      </div>
    </ToastProvider>
  )
}

/* ------------------------------------------------------------------------ */
/* Page: the whole set twice — light, then wrapped in .dark                 */
/* ------------------------------------------------------------------------ */

export function SystemShowcase() {
  return (
    <main className="font-sans">
      <div className="bg-paper p-6 pb-16 text-ink md:p-10">
        <ThemeSet variant="light" />
      </div>
      {/* .dark flips the token values; the wrapper carries its own paper. */}
      <div
        id="dev-system-dark"
        className="dark border-t border-line bg-paper p-6 pb-16 text-ink md:p-10"
      >
        <ThemeSet variant="dark" />
      </div>
    </main>
  )
}
