import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import {
  BlisterCell,
  BlisterGrid,
  MonographLabel,
  Stamp,
  StateGlyph,
  WaitlistForm,
} from '@epharmatica/ui'
import { WAITLIST_MODULES, WAITLIST_ROLES } from '@epharmatica/database'
import { joinWaitlist } from '@/features/waitlist/actions'
import { ButtonLink } from './_components/button-link'
import { Chip } from './_components/chip'

/*
 * Landing per mockup 2a / STYLE §11 S4 — split hero over LIVE system
 * primitives (the demo side is real BlisterGrid/StateGlyph/Stamp, not a
 * screenshot), six module sections, S12 waitlist band. Designed at 360px
 * first: hero stacks statement-first below md, feature rows go one column,
 * the waitlist band stacks (§6).
 *
 * Deliberate deviations from mockup 2a (noted for review):
 * - "Start learning free" points at /auth/sign-up (1.A) — the reader itself
 *   arrives in 1.C.
 * - The learning section's "Browse subjects →" link points at #waitlist until
 *   the reader lands.
 * - YouTube facade tiles are COMING SOON placeholders — the channel launches
 *   with the Phase 0 content track; no fake video titles.
 */

export const revalidate = 3600

/*
 * TODO(dev-plan 0.E → admin CMS): drive unreleased-module state from the
 * feature_flags table once the admin CMS lands. Querying the database at
 * build time needs env not present in every build, so the landing stays
 * fully static behind this single flag map until then.
 */
const FLAGS = {
  community: { comingSoon: true },
  blog: { comingSoon: true },
  jobs: { comingSoon: true },
  resume: { comingSoon: true },
} as const

const CONTENT_LINK_CLASSES =
  'underline decoration-primary decoration-1 underline-offset-4 hover:decoration-2'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('landing.meta')
  return {
    title: t('title'),
    description: t('description'),
  }
}

const FEATURE_POSITION_CLASSES = {
  start: 'border-b border-line md:border-b-0 md:border-e md:pe-8',
  middle: 'border-b border-line md:border-b-0 md:border-e md:px-8',
  end: 'md:ps-8',
} as const

function FeatureCell({
  id,
  position,
  title,
  body,
  children,
}: {
  id: string
  position: keyof typeof FEATURE_POSITION_CLASSES
  title: string
  body: string
  children?: ReactNode
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 py-7 md:scroll-mt-24 ${FEATURE_POSITION_CLASSES[position]}`}
    >
      <MonographLabel as="h2" rule="hard">
        {title}
      </MonographLabel>
      <p className="mt-3 max-w-[34ch] text-[13.5px] text-ink-2">{body}</p>
      {children}
    </section>
  )
}

function VideoFacade() {
  return (
    <div className="flex aspect-video items-center justify-center border border-line bg-ink">
      <span className="flex h-[27px] w-[38px] items-center justify-center bg-paper">
        <span
          aria-hidden="true"
          className="block h-0 w-0 border-y-[7px] border-y-transparent border-s-[12px] border-s-ink"
        />
      </span>
    </div>
  )
}

export default async function LandingPage() {
  const t = await getTranslations('landing')
  const tw = await getTranslations('waitlist')

  const modules = WAITLIST_MODULES.map((value) => ({
    value,
    label: tw(`modules.${value}`),
  }))
  const roles = WAITLIST_ROLES.map((value) => ({
    value,
    label: tw(`roles.${value}`),
  }))

  return (
    <div className="mx-auto w-full max-w-content px-5 sm:px-6 md:px-8">
      {/* ── Hero (S4): statement beside live primitives ─────────────────── */}
      <section className="grid border-b border-ink md:grid-cols-[1.05fr_1fr]">
        <div className="flex flex-col gap-6 py-10 md:pb-16 md:pe-12 md:pt-[72px]">
          <MonographLabel>{t('hero.eyebrow')}</MonographLabel>
          {/* Display clamp caps at 44px — the locked fluid-type scale (§6.2);
              the mockup's 46px loses to STYLE.md on token values. */}
          <h1 className="font-display text-[clamp(30px,2rem+2.6vw,44px)] font-bold leading-[1.05] tracking-[-0.02em]">
            {t('hero.headline')}
          </h1>
          <p className="max-w-[52ch] text-[16px] text-ink-2">{t('hero.sub')}</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/auth/sign-up" variant="primary">
              {t('hero.startLearning')}
            </ButtonLink>
            <ButtonLink href="/#waitlist" variant="ghost">
              {t('hero.joinWaitlist')}
            </ButtonLink>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
            <MonographLabel size="sm">{t('hero.chipFreeAccount')}</MonographLabel>
            <MonographLabel size="sm">{t('hero.chipNoAds')}</MonographLabel>
            <MonographLabel size="sm">{t('hero.chipBuiltWithPharmacists')}</MonographLabel>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-ink bg-surface p-4 sm:p-6 md:border-s md:border-t-0 md:p-8">
          <MonographLabel as="div" rule="hard">
            {t('demo.label')}
          </MonographLabel>

          <BlisterGrid columns={2}>
            <BlisterCell className="p-3.5">
              <MonographLabel size="sm">{t('demo.unit01.label')}</MonographLabel>
              <div className="mt-[7px] font-display text-[14.5px] font-semibold">
                {t('demo.unit01.title')}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <StateGlyph state="complete" />
                <Stamp>{t('demo.unit01.stamp')}</Stamp>
              </div>
            </BlisterCell>
            <BlisterCell className="p-3.5">
              <MonographLabel size="sm">{t('demo.unit02.label')}</MonographLabel>
              <div className="mt-[7px] font-display text-[14.5px] font-semibold">
                {t('demo.unit02.title')}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <StateGlyph state="in-progress" />
                <Chip>{t('demo.unit02.chip')}</Chip>
              </div>
            </BlisterCell>
            <BlisterCell className="p-3.5">
              <MonographLabel size="sm">{t('demo.unit03.label')}</MonographLabel>
              <div className="mt-[7px] font-display text-[14.5px] font-semibold">
                {t('demo.unit03.title')}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <StateGlyph state="not-started" label={t('demo.notStarted')} />
                <Chip>{t('demo.unit03.chip')}</Chip>
              </div>
            </BlisterCell>
            <BlisterCell className="p-3.5">
              <MonographLabel size="sm">{t('demo.unit04.label')}</MonographLabel>
              <div className="mt-[7px] font-display text-[14.5px] font-semibold">
                {t('demo.unit04.title')}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <StateGlyph state="not-started" label={t('demo.notStarted')} />
                <Chip>{t('demo.unit04.chip')}</Chip>
              </div>
            </BlisterCell>
          </BlisterGrid>

          <div className="border border-line bg-paper p-4">
            <MonographLabel size="sm">{t('demo.reader.topic')}</MonographLabel>
            <p className="mb-2.5 mt-2 text-[14px] leading-[1.6]">
              {t.rich('demo.reader.sentence', {
                hl: (chunks) => <mark className="bg-hl-mint px-0.5 py-px text-ink">{chunks}</mark>,
              })}
            </p>
            <div className="border-s-2 border-primary bg-primary-tint px-[13px] py-2.5">
              <MonographLabel size="sm" as="div" className="mb-1 text-primary">
                {t('demo.reader.pearlLabel')}
              </MonographLabel>
              <p className="text-[13px] leading-[1.5]">{t('demo.reader.pearl')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Six module sections — two 3-col rows, 1-col below md ─────────── */}
      <div className="grid border-b border-line md:grid-cols-3">
        <FeatureCell
          id="learning"
          position="start"
          title={t('features.learning.title')}
          body={t('features.learning.body')}
        >
          <Link
            href="/#waitlist"
            className={`mt-3 inline-block text-[13.5px] text-ink ${CONTENT_LINK_CLASSES}`}
          >
            {t('features.learning.link')}
          </Link>
        </FeatureCell>
        <FeatureCell
          id="ai-study-tools"
          position="middle"
          title={t('features.aiStudyTools.title')}
          body={t('features.aiStudyTools.body')}
        >
          <Chip variant="ink" className="mt-3">
            {t('features.aiStudyTools.chip')}
          </Chip>
        </FeatureCell>
        <FeatureCell
          id="community"
          position="end"
          title={t('features.community.title')}
          body={t('features.community.body')}
        >
          {FLAGS.community.comingSoon && (
            <Chip variant="warn" className="mt-3">
              {t('features.comingSoon')}
            </Chip>
          )}
        </FeatureCell>
      </div>

      <div className="grid border-b border-ink md:grid-cols-3">
        <FeatureCell
          id="blog"
          position="start"
          title={t('features.blog.title')}
          body={t('features.blog.body')}
        >
          {FLAGS.blog.comingSoon && (
            <Chip variant="warn" className="mt-3">
              {t('features.comingSoon')}
            </Chip>
          )}
        </FeatureCell>
        <FeatureCell
          id="jobs"
          position="middle"
          title={t('features.jobs.title')}
          body={t('features.jobs.body')}
        >
          {FLAGS.jobs.comingSoon && (
            <Chip variant="warn" className="mt-3">
              {t('features.comingSoon')}
            </Chip>
          )}
          {/* Interim employer intake (dev-plan 3.A / PRD v1.7 M6-2) */}
          <p className="mt-3 font-mono text-[12px] text-ink-2">
            {t.rich('features.jobs.hiring', {
              jobs: (chunks) => (
                <a
                  href="mailto:jobs@epharmatica.com"
                  className={`text-ink ${CONTENT_LINK_CLASSES}`}
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
        </FeatureCell>
        <FeatureCell
          id="resume"
          position="end"
          title={t('features.resume.title')}
          body={t('features.resume.body')}
        >
          {FLAGS.resume.comingSoon && (
            <Chip variant="warn" className="mt-3">
              {t('features.comingSoon')}
            </Chip>
          )}
        </FeatureCell>
      </div>

      {/* ── Waitlist band (S12) ──────────────────────────────────────────── */}
      <section id="waitlist" className="grid scroll-mt-20 md:scroll-mt-24 md:grid-cols-[1.1fr_1fr]">
        <div className="border-b border-line py-8 md:border-b-0 md:border-e md:pe-8">
          <MonographLabel as="h2" rule="hard">
            {tw('title')}
          </MonographLabel>
          <p className="mb-4 mt-3 text-[13.5px] text-ink-2">{tw('explainer')}</p>
          <WaitlistForm
            action={joinWaitlist}
            modules={modules}
            roles={roles}
            labels={{
              email: tw('form.email'),
              emailPlaceholder: tw('form.emailPlaceholder'),
              module: tw('form.module'),
              role: tw('form.role'),
              submit: tw('form.submit'),
              successPrefix: tw('form.successPrefix'),
              genericError: tw('form.genericError'),
            }}
            turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
          />
        </div>

        <div className="py-8 md:ps-8">
          <MonographLabel as="h2" rule="hard">
            {t('youtube.label')}
          </MonographLabel>
          <div className="mt-4 grid grid-cols-3 gap-2.5">
            {([0, 1, 2] as const).map((index) => (
              <div key={index} className="flex flex-col gap-1.5">
                <VideoFacade />
                <MonographLabel size="sm">{t('youtube.comingSoon')}</MonographLabel>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
