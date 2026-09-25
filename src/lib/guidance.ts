/**
 * Contraception guidance copy.
 *
 * All user-facing risk language lives here, in one file, so it can be reviewed
 * as a whole. Three rules govern every string below:
 *
 *   1. The word "safe" never appears. Days are "lower risk", never "no risk".
 *   2. Uncertainty widens caution. When the model knows less, it says so and
 *      advises more protection, never less.
 *   3. No effectiveness figures are quoted, because none can be sourced for
 *      this particular implementation.
 */

import type { IconName } from '@/components/Icon'
import type { DayAssessment, Prediction, RiskLevel } from '@/engine/types'

export interface Guidance {
  tone: RiskLevel
  title: string
  body: string
  icon: IconName
}

export const DISCLAIMER =
  'Estimates only — not medical advice. No method is 100% effective.'

export function guidanceFor(day: DayAssessment, prediction: Prediction): Guidance {
  if (day.risk === 'high') {
    return {
      tone: 'high',
      title: day.isOvulation ? 'Ovulation day' : "You're in your fertile window",
      body: day.isOvulation
        ? 'The highest-risk day of your cycle. Use protection.'
        : 'Pregnancy is most likely around now. Use protection.',
      icon: 'alert',
    }
  }

  if (day.risk === 'elevated') {
    return {
      tone: 'elevated',
      title: 'Close to your fertile window',
      body: prediction.ovulationConfirmed
        ? 'Just outside the window. Protection still advised.'
        : 'Ovulation can land a day or two either side of the estimate, so protection is still advised.',
      icon: 'alert',
    }
  }

  if (day.periodLate) {
    return {
      tone: 'unknown',
      title: 'Your period is later than expected',
      body: "Cycle's estimates are unreliable until it arrives, so treat every day as uncertain and use protection.",
      icon: 'help',
    }
  }

  if (day.risk === 'unknown') {
    return {
      tone: 'unknown',
      title: 'Not enough history yet',
      body: 'Log a few more cycles and Cycle can start estimating your fertile window. Until then, treat every day as uncertain and use protection.',
      icon: 'help',
    }
  }

  // Lower risk. The period-day case gets its own wording: on a short cycle,
  // sperm survival means later bleeding days are not as quiet as they look.
  if (day.isPeriod) {
    return {
      tone: 'lower',
      title: 'On your period',
      body:
        prediction.baseline.length <= 25
          ? 'Lower risk today. On cycles as short as yours, later bleeding days can still overlap the fertile window.'
          : 'Lower risk today, though no day is risk-free.',
      icon: 'shield-check',
    }
  }

  return {
    tone: 'lower',
    title: 'Lower risk today',
    body: "Outside your estimated fertile window. Lower risk — not no risk.",
    icon: 'shield-check',
  }
}

export const PHASE_LABEL: Record<string, string> = {
  menstrual: 'Menstrual phase',
  follicular: 'Follicular phase',
  ovulation: 'Ovulation',
  luteal: 'Luteal phase',
}

export const PHASE_ICON: Record<string, IconName> = {
  menstrual: 'droplet',
  follicular: 'sun',
  ovulation: 'sparkles',
  luteal: 'moon',
}

export const CONFIDENCE_LABEL: Record<Prediction['confidence'], string> = {
  learning: 'Still learning',
  fair: 'Fair confidence',
  good: 'Good confidence',
}

export function confidenceNote(prediction: Prediction): string {
  const { confidence, baseline } = prediction
  if (confidence === 'learning') {
    return `Based on ${baseline.eligibleCount === 0 ? 'what you told us at setup' : `${baseline.eligibleCount} logged cycle${baseline.eligibleCount === 1 ? '' : 's'}`}. Predictions will sharpen as you log more.`
  }
  if (baseline.source === 'shifted') {
    return 'Your recent cycles have shifted, so predictions now follow the new pattern.'
  }
  return `Based on your last ${baseline.eligibleCount} cycles, typically ${Math.round(baseline.length)} days.`
}

export const OVULATION_SIGNS = [
  'Egg-white cervical mucus',
  'Mild one-sided cramps',
  'Increased sex drive',
  'Tender breasts',
  'Heightened sense of smell',
  'Light spotting',
]

export const SYMPTOMS = [
  'Cramps',
  'Mood swings',
  'Bloating',
  'Headache',
  'Fatigue',
  'Tender breasts',
  'Acne',
  'Cravings',
]
