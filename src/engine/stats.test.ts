import { describe, expect, test } from 'vitest'
import { clamp, mad, median } from './stats'

describe('median', () => {
  test('returns the middle value of an odd-length set', () => {
    expect(median([28, 27, 29])).toBe(28)
  })

  test('averages the two middle values of an even-length set', () => {
    expect(median([27, 28, 29, 30])).toBe(28.5)
  })

  test('does not depend on input order', () => {
    expect(median([44, 27, 28, 29, 28])).toBe(median([28, 28, 29, 27, 44]))
  })

  test('returns the single value of a one-element set', () => {
    expect(median([31])).toBe(31)
  })

  test('returns NaN for an empty set', () => {
    expect(median([])).toBeNaN()
  })

  // This is the property that fixes the reported defect. A mean over
  // [28,27,29,28,44] is 31.2 — the app would predict a period five days late.
  test('is unmoved by a single large outlier', () => {
    const regular = [28, 27, 29, 28, 28]
    const withOutlier = [28, 27, 29, 28, 44]
    expect(median(regular)).toBe(28)
    expect(median(withOutlier)).toBe(28)
  })
})

describe('mad', () => {
  test('is zero for an identical set', () => {
    expect(mad([28, 28, 28])).toBe(0)
  })

  test('measures typical deviation from the median', () => {
    // median 28; deviations [2,1,0,1,2]; median of those is 1
    expect(mad([26, 27, 28, 29, 30])).toBe(1)
  })

  test('stays small when one value is wildly out', () => {
    // median 28; deviations [0,1,1,0,16]; median of those is 1
    expect(mad([28, 27, 29, 28, 44])).toBe(1)
  })

  test('returns NaN for an empty set', () => {
    expect(mad([])).toBeNaN()
  })
})

describe('clamp', () => {
  test('passes through a value inside the range', () => {
    expect(clamp(14, 9, 17)).toBe(14)
  })

  test('clamps below the floor', () => {
    expect(clamp(3, 9, 17)).toBe(9)
  })

  test('clamps above the ceiling', () => {
    expect(clamp(25, 9, 17)).toBe(17)
  })
})
