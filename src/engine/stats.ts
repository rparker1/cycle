/**
 * Robust statistics.
 *
 * The engine uses median and median absolute deviation rather than mean and
 * standard deviation throughout. A single unusual cycle — a late period, a
 * missed log — is common and should not move the forecast. A mean moves; a
 * median does not.
 */

/** Middle value, averaging the two middle values when the count is even. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
    : (sorted[mid] as number)
}

/** Median absolute deviation: the median of each value's distance from the median. */
export function mad(values: number[]): number {
  if (values.length === 0) return NaN
  const centre = median(values)
  return median(values.map((v) => Math.abs(v - centre)))
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
