import { describe, expect, test } from 'vitest'
import { guidanceFor } from './guidance'
import { createEngine } from '@/engine/predict'
import { aProfile, periodStarts } from '@/engine/__testutils__/fixtures'

describe('late period guidance', () => {
  test('says the period is late and advises protection, without the word safe', () => {
    const engine = createEngine({
      today: '2026-05-23',
      logs: periodStarts('2026-01-01', [28, 28, 28, 28]),
      resolutions: [],
      profile: aProfile(),
    })
    const g = guidanceFor(engine.assessDay('2026-05-23'), engine.prediction)
    expect(g.title).toBe('Your period is later than expected')
    expect(g.tone).toBe('unknown')
    expect(g.body).toMatch(/use protection/)
    expect(`${g.title} ${g.body}`.toLowerCase()).not.toContain('safe')
  })
})
