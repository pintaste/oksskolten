import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { formatDate, formatRelativeDate, formatDetailDate } from './dateFormat'

describe('formatDate', () => {
  it('returns empty string for null', () => {
    expect(formatDate(null, 'en')).toBe('')
  })

  it('formats a date in current year without year', () => {
    const thisYear = new Date().getFullYear()
    const result = formatDate(`${thisYear}-03-15T00:00:00Z`, 'en')
    const expected = new Date(`${thisYear}-03-15T00:00:00Z`).toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
    })
    expect(result).toBe(expected)
    expect(result).not.toContain(String(thisYear))
  })

  it('formats a date in past year with year', () => {
    const result = formatDate('2023-12-01T00:00:00Z', 'en')
    const expected = new Date('2023-12-01T00:00:00Z').toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    expect(result).toBe(expected)
  })

  it('formats a date in ja locale', () => {
    const thisYear = new Date().getFullYear()
    const result = formatDate(`${thisYear}-03-15T00:00:00Z`, 'ja')
    const expected = new Date(`${thisYear}-03-15T00:00:00Z`).toLocaleDateString('ja', {
      month: 'short',
      day: 'numeric',
    })
    expect(result).toBe(expected)
  })
})

describe('formatRelativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty string for null', () => {
    expect(formatRelativeDate(null, 'en')).toBe('')
  })

  it('returns "just now" for recent timestamps (en)', () => {
    const now = new Date('2025-06-01T12:00:00Z')
    const recent = new Date(now.getTime() - 30_000).toISOString()
    expect(formatRelativeDate(recent, 'en')).toBe('just now')
  })

  it('returns justNow option for recent timestamps (ja)', () => {
    const now = new Date('2025-06-01T12:00:00Z')
    const recent = new Date(now.getTime() - 30_000).toISOString()
    expect(formatRelativeDate(recent, 'ja', { justNow: 'たった今' })).toBe('たった今')
  })

  it('returns default "just now" when justNow option is not provided', () => {
    const now = new Date('2025-06-01T12:00:00Z')
    const recent = new Date(now.getTime() - 30_000).toISOString()
    expect(formatRelativeDate(recent, 'ja')).toBe('just now')
  })

  it('returns relative minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
    const result = formatRelativeDate(fiveMinAgo, 'en')
    expect(result).toContain('5')
    expect(result).toContain('minute')
  })

  it('returns relative hours', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 3600_000).toISOString()
    const result = formatRelativeDate(threeHoursAgo, 'en')
    expect(result).toContain('3')
    expect(result).toContain('hour')
  })

  it('returns relative days', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400_000).toISOString()
    const result = formatRelativeDate(twoDaysAgo, 'en')
    expect(result).toContain('2')
    expect(result).toContain('day')
  })

  it('falls back to absolute date for old timestamps', () => {
    const oldDate = new Date(Date.now() - 60 * 86400_000).toISOString()
    const result = formatRelativeDate(oldDate, 'en')
    expect(result).toContain('Apr')
  })
})

describe('formatDetailDate', () => {
  it('returns empty string for null', () => {
    expect(formatDetailDate(null, 'en')).toBe('')
  })

  it('includes year, month and day', () => {
    const result = formatDetailDate('2025-03-15T00:00:00Z', 'en')
    const expected = new Date('2025-03-15T00:00:00Z').toLocaleDateString('en', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    expect(result).toBe(expected)
  })
})
