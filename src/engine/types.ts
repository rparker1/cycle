/**
 * Domain types for the Cycle prediction engine.
 *
 * Every calendar date in this file is an `IsoDate` — a plain `YYYY-MM-DD`
 * local-calendar string. Never a `Date`, never a UTC timestamp. A period
 * logged at 23:00 BST must not silently become the previous day, and a
 * timestamp would make exactly that happen.
 */

/** A local calendar date, `YYYY-MM-DD`. */
export type IsoDate = string

export type Flow = 'spotting' | 'light' | 'medium' | 'heavy'
export type OvulationConfidence = 'confident' | 'unsure' | 'rejected'
export type PredictionFeedback = 'accurate' | 'early' | 'late' | 'wrong'
export type Resolution = 'one_off' | 'new_normal' | 'missed_period' | 'mislogged'

export interface DayLog {
  id: string
  logDate: IsoDate
  isPeriod: boolean
  isPeriodStart: boolean
  isPeriodEnd: boolean
  /**
   * The user explicitly said they were not bleeding this day. Distinct from
   * "nothing logged", which means we do not know. Never true with `isPeriod`.
   */
  noBleed: boolean
  flow: Flow | null
  feltFertile: boolean
  ovulationClaimed: boolean
  ovulationConfidence: OvulationConfidence | null
  ovulationSigns: string[]
  symptoms: string[]
  mood: string | null
  sexualActivity: boolean | null
  protectionUsed: boolean | null
  notes: string | null
  predictionFeedback: PredictionFeedback | null
  updatedAt: string
  deletedAt: string | null
}

export interface CycleResolution {
  id: string
  cycleStart: IsoDate
  observedLength: number | null
  resolution: Resolution
  excludedFromBaseline: boolean
  note: string | null
  updatedAt: string
  deletedAt: string | null
}

export interface Profile {
  displayName: string | null
  appName: string
  avgCycleLength: number
  avgPeriodLength: number
  lutealLength: number
  onboardedAt: string | null
}

/** A cycle derived from logged period starts. Never stored — always derived. */
export interface Cycle {
  startDate: IsoDate
  /** Last day of the cycle, i.e. the day before the next start. */
  endDate: IsoDate | null
  /** Null for the open current cycle. */
  length: number | null
  periodEndDate: IsoDate | null
  /**
   * True only when the user explicitly marked the period as finished.
   * Without it, `periodEndDate` is merely the last day they happened to log,
   * which is not the same thing.
   */
  periodEndConfirmed: boolean
  /** Set when the user confirmed ovulation during this cycle. */
  confirmedOvulation: IsoDate | null
  isCurrent: boolean
}

export type AnomalyKind =
  | 'suspected_missed_period'
  | 'unusually_long'
  | 'unusually_short'

export interface Anomaly {
  cycleStart: IsoDate
  observedLength: number
  baselineAtDetection: number
  kind: AnomalyKind
  /** For `suspected_missed_period`, where the unlogged period probably was. */
  suggestedMissedPeriodDate: IsoDate | null
  /**
   * True when two consecutive cycles deviated the same way, so the engine
   * accepted the change as a new normal instead of asking again.
   */
  autoAccepted: boolean
}

export type RiskLevel = 'high' | 'elevated' | 'lower' | 'unknown'
export type Phase = 'menstrual' | 'follicular' | 'ovulation' | 'luteal'
export type Confidence = 'learning' | 'fair' | 'good'

export interface DateRange {
  earliest: IsoDate
  likely: IsoDate
  latest: IsoDate
}

export interface Window {
  start: IsoDate
  end: IsoDate
}

export type BaselineSource = 'onboarding' | 'history' | 'shifted'

export interface Baseline {
  /** Median of eligible cycle lengths, or the onboarding value. */
  length: number
  /** Median absolute deviation, floored at 1. */
  spread: number
  eligibleCount: number
  source: BaselineSource
}

export interface Prediction {
  today: IsoDate
  cycleDay: number | null
  phase: Phase | null
  baseline: Baseline
  lutealLength: number
  nextPeriod: DateRange | null
  ovulation: DateRange | null
  ovulationConfirmed: boolean
  /** Biological window: ovulation −5 to +1. */
  fertileWindow: Window | null
  /** Biological window widened by prediction uncertainty. */
  protectionWindow: Window | null
  confidence: Confidence
  anomalies: Anomaly[]
}

export interface DayAssessment {
  date: IsoDate
  cycleDay: number | null
  phase: Phase | null
  risk: RiskLevel
  isPeriod: boolean
  isPredictedPeriod: boolean
  isOvulation: boolean
  isFertile: boolean
}

export interface EngineInput {
  today: IsoDate
  logs: DayLog[]
  resolutions: CycleResolution[]
  profile: Profile
}
