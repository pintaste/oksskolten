import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'
import { SWRConfig } from 'swr'
import { LocaleContext } from '../../lib/i18n'
import { TooltipProvider } from '../ui/tooltip'

const {
  mockApiPatch,
  mockApiPost,
  mockTrackRead,
  mockQueueSeenIds,
  mockSummarizeHandle,
  mockTranslateHandle,
  mockUseTranslate,
} = vi.hoisted(() => ({
  mockApiPatch: vi.fn(),
  mockApiPost: vi.fn(() => Promise.resolve()),
  mockTrackRead: vi.fn(),
  mockQueueSeenIds: vi.fn((_ids: number[]) => Promise.resolve()),
  mockSummarizeHandle: vi.fn(),
  mockTranslateHandle: vi.fn(),
  mockUseTranslate: vi.fn(),
}))

const summaryAutoRunTracker = new Set<number>()

vi.mock('../../lib/fetcher', async () => {
  const actual = await vi.importActual<typeof import('../../lib/fetcher')>('../../lib/fetcher')
  return {
    ...actual,
    apiPatch: mockApiPatch,
    apiPost: mockApiPost,
  }
})

vi.mock('../../lib/readTracker', () => ({
  trackRead: (...args: unknown[]) => mockTrackRead(...args),
}))

vi.mock('../../lib/offlineQueue', () => ({
  queueSeenIds: (ids: number[]) => mockQueueSeenIds(ids),
}))

vi.mock('../../hooks/use-rewrite-internal-links', () => ({
  useRewriteInternalLinks: (html: string) => ({ rewrittenHtml: html }),
}))

vi.mock('../../hooks/use-metrics', () => ({
  useMetrics: () => ({ metrics: null, report: vi.fn(), reset: vi.fn(), formatMetrics: vi.fn(() => null) }),
}))

vi.mock('../../hooks/use-summarize', () => ({
  useSummarize: (article?: { id: number; summary: string | null }, _metrics?: unknown, auto = false) => {
    const summary = article?.summary ?? null
    if (auto && article?.id != null && summary === null && !summaryAutoRunTracker.has(article.id)) {
      summaryAutoRunTracker.add(article.id)
      mockSummarizeHandle()
    }

    return {
      summary,
      summarizing: false,
      streamingText: '',
      handleSummarize: mockSummarizeHandle,
      summaryHtml: summary ? `<p>${summary}</p>` : '',
      streamingHtml: '',
      error: null,
    }
  },
}))

const createMockUseTranslate = (_article?: { id: number; full_text_translated: string | null }, _metrics?: unknown) => ({
  viewMode: 'original' as const,
  setViewMode: vi.fn(),
  translating: false,
  translatingText: '',
  fullTextTranslated: null,
  handleTranslate: mockTranslateHandle,
  translatingHtml: '',
  error: null,
})

mockUseTranslate.mockImplementation(createMockUseTranslate)

vi.mock('../../hooks/use-translate', () => ({
  useTranslate: (...args: Parameters<typeof mockUseTranslate>) => mockUseTranslate(...args),
}))

vi.mock('../ui/ImageLightbox', () => ({
  ImageLightbox: () => null,
}))

vi.mock('../chat/chat-fab', () => ({
  ChatFab: () => null,
}))

import { ArticleDetail } from './article-detail'

const mockSettings = {
  internalLinks: 'on' as const,
  colorMode: 'system' as const,
  setColorMode: vi.fn(),
  themeName: 'default',
  setTheme: vi.fn(),
  themes: [{ name: 'default', label: 'Default' }],
  dateMode: 'relative' as const,
  setDateMode: vi.fn(),
  autoMarkRead: 'off' as const,
  setAutoMarkRead: vi.fn(),
  showUnreadIndicator: 'on' as const,
  setShowUnreadIndicator: vi.fn(),
  indicatorStyle: 'dot' as const,
  showThumbnails: 'on' as const,
  setShowThumbnails: vi.fn(),
  showFeedActivity: 'on' as const,
  setShowFeedActivity: vi.fn(),
  highlightTheme: 'github-dark' as const,
  setHighlightTheme: vi.fn(),
  articleFont: 'sans' as const,
  setArticleFont: vi.fn(),
  translateProvider: '' as string,
  setTranslateProvider: vi.fn(),
  translateModel: '' as string,
  setTranslateModel: vi.fn(),
  translateTargetLang: null as string | null,
  setTranslateTargetLang: vi.fn(),
  translateSourceLang: null as string | null,
  setTranslateSourceLang: vi.fn(),
  summaryAuto: 'off' as const,
  setSummaryAuto: vi.fn(),
  translateAuto: 'on' as const,
  setTranslateAuto: vi.fn(),
  save: vi.fn(),
}

function OutletWrapper() {
  return <Outlet context={{ settings: mockSettings, sidebarOpen: false, setSidebarOpen: vi.fn() }} />
}

describe('ArticleDetail bookmark', () => {
  const articleUrl = 'https://example.com/posts/1'
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`
  const article = {
    id: 1,
    feed_id: 2,
    feed_name: 'Example Feed',
    title: 'Example Article',
    url: articleUrl,
    published_at: '2026-03-04T00:00:00.000Z',
    lang: 'en',
    summary: null,
    full_text: 'Body',
    full_text_translated: null,
    translated_lang: null,
    seen_at: '2026-03-04T00:00:00.000Z',
    read_at: '2026-03-04T00:00:00.000Z',
    bookmarked_at: null,
    liked_at: null,
  }

  beforeEach(() => {
    mockApiPatch.mockReset()
    mockApiPatch.mockResolvedValue({ bookmarked_at: '2026-03-05T00:00:00.000Z' })
    mockApiPost.mockReset()
    mockApiPost.mockResolvedValue(undefined)
    mockTrackRead.mockReset()
    mockQueueSeenIds.mockClear()
  })

  it('updates the bookmark button immediately after click', async () => {
    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'ja', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    const buttons = screen.getAllByRole('button', { pressed: false })
    // First aria-pressed button is bookmark, second is like
    const bookmarkBtn = buttons[0]
    const icon = bookmarkBtn.querySelector('svg')
    expect(icon?.getAttribute('fill')).toBe('none')

    fireEvent.click(bookmarkBtn)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1)
    })
    expect(bookmarkBtn.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
    expect(mockApiPatch).toHaveBeenCalledWith('/api/articles/1/bookmark', { bookmarked: true })
  })
})

describe('ArticleDetail like', () => {
  const articleUrl = 'https://example.com/posts/1'
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`
  const article = {
    id: 1,
    feed_id: 2,
    feed_name: 'Example Feed',
    title: 'Example Article',
    url: articleUrl,
    published_at: '2026-03-04T00:00:00.000Z',
    lang: 'en',
    summary: null,
    full_text: 'Body',
    full_text_translated: null,
    translated_lang: null,
    seen_at: '2026-03-04T00:00:00.000Z',
    read_at: '2026-03-04T00:00:00.000Z',
    bookmarked_at: null,
    liked_at: null,
  }

  beforeEach(() => {
    mockApiPatch.mockReset()
    mockApiPatch.mockResolvedValue({ liked_at: '2026-03-05T00:00:00.000Z' })
    mockApiPost.mockReset()
    mockApiPost.mockResolvedValue(undefined)
    mockTrackRead.mockReset()
    mockQueueSeenIds.mockClear()
  })

  beforeEach(() => {
    mockUseTranslate.mockClear()
  })

  it('updates the like button immediately after click', async () => {
    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'ja', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    const buttons = screen.getAllByRole('button', { pressed: false })
    // First aria-pressed button is bookmark, second is like
    const likeBtn = buttons[1]
    const icon = likeBtn.querySelector('svg')
    expect(icon?.getAttribute('fill')).toBe('none')

    fireEvent.click(likeBtn)

    await waitFor(() => {
      const pressedButtons = screen.getAllByRole('button', { pressed: true })
      expect(pressedButtons).toHaveLength(1)
    })
    expect(likeBtn.querySelector('svg')?.getAttribute('fill')).toBe('currentColor')
    expect(mockApiPatch).toHaveBeenCalledWith('/api/articles/1/like', { liked: true })
  })

})

describe('ArticleDetail stale translation filtering', () => {
  const articleUrl = 'https://example.com/posts/1'
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`

  beforeEach(() => {
    mockApiPatch.mockReset()
    mockApiPost.mockReset()
    mockApiPost.mockResolvedValue(undefined)
    mockTrackRead.mockReset()
    mockQueueSeenIds.mockClear()
    mockUseTranslate.mockClear()
  })

  it('passes full_text_translated: null when translated_lang does not match locale', () => {
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'fr',
      summary: null,
      full_text: 'Contenu français',
      full_text_translated: '古い日本語訳',
      translated_lang: 'ja',
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    // translated_lang='ja' but locale='en' → stale, should pass null
    expect(mockUseTranslate).toHaveBeenCalled()
    const firstArg = mockUseTranslate.mock.calls[0]![0]
    expect(firstArg).toEqual({ id: 1, full_text_translated: null })
  })

  it('passes full_text_translated when translated_lang matches locale', () => {
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'fr',
      summary: null,
      full_text: 'Contenu français',
      full_text_translated: '日本語訳',
      translated_lang: 'ja',
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'ja', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    // translated_lang='ja' and locale='ja' → current, should pass the translation
    expect(mockUseTranslate).toHaveBeenCalled()
    const firstArg = mockUseTranslate.mock.calls[0]![0]
    expect(firstArg).toEqual({ id: 1, full_text_translated: '日本語訳' })
  })

  it('passes full_text_translated: null when translated_lang is null', () => {
    const article = {
      id: 1,
      feed_id: 2,
      feed_name: 'Example Feed',
      title: 'Example Article',
      url: articleUrl,
      published_at: '2026-03-04T00:00:00.000Z',
      lang: 'fr',
      summary: null,
      full_text: 'Contenu français',
      full_text_translated: 'legacy translation',
      translated_lang: null,
      seen_at: '2026-03-04T00:00:00.000Z',
      read_at: '2026-03-04T00:00:00.000Z',
      bookmarked_at: null,
      liked_at: null,
    }

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'ja', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    // translated_lang=null (legacy) → stale, should pass null
    expect(mockUseTranslate).toHaveBeenCalled()
    const firstArg = mockUseTranslate.mock.calls[0]![0]
    expect(firstArg).toEqual({ id: 1, full_text_translated: null })
  })
})

describe('ArticleDetail immersive translation', () => {
  const articleUrl = 'https://example.com/posts/1'
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`
  const article = {
    id: 1,
    feed_id: 2,
    feed_name: 'Example Feed',
    title: 'Example Article',
    url: articleUrl,
    published_at: '2026-03-04T00:00:00.000Z',
    lang: 'fr',
    summary: null,
    full_text: 'Article body',
    full_text_translated: null,
    translated_lang: null,
    seen_at: '2026-03-04T00:00:00.000Z',
    read_at: '2026-03-04T00:00:00.000Z',
    bookmarked_at: null,
    liked_at: null,
  }

  beforeEach(() => {
    mockApiPatch.mockReset()
    mockApiPost.mockReset()
    mockApiPost.mockResolvedValue(undefined)
    mockTrackRead.mockReset()
    mockQueueSeenIds.mockClear()
    mockUseTranslate.mockClear()
    mockTranslateHandle.mockReset()
    mockSummarizeHandle.mockReset()
    summaryAutoRunTracker.clear()
    mockSettings.translateProvider = '' as string
    mockSettings.translateModel = '' as string
    mockSettings.translateTargetLang = null
    mockSettings.translateSourceLang = null
    mockSettings.translateAuto = 'on' as const
    mockSettings.summaryAuto = 'off' as const
  })

  it('supports all 4 summary/translate auto combinations independently', async () => {
    mockSettings.translateProvider = 'anthropic'
    mockSettings.translateModel = 'claude-sonnet-4-6'
    mockSettings.translateTargetLang = 'en'

    mockSettings.summaryAuto = 'on'
    mockSettings.translateAuto = 'off'
    render(<MemoryRouter>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <TooltipProvider>
          <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
            <Routes>
              <Route element={<OutletWrapper />}>
                <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
              </Route>
            </Routes>
          </SWRConfig>
        </TooltipProvider>
      </LocaleContext.Provider>
    </MemoryRouter>)

    await waitFor(() => {
      expect(mockSummarizeHandle).toHaveBeenCalledTimes(1)
    })
    expect(mockTranslateHandle).toHaveBeenCalledTimes(0)

    vi.clearAllMocks()
    summaryAutoRunTracker.clear()
    mockSettings.summaryAuto = 'off'
    mockSettings.translateAuto = 'on'
    mockSettings.translateProvider = 'anthropic'

    render(<MemoryRouter>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <TooltipProvider>
          <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
            <Routes>
              <Route element={<OutletWrapper />}>
                <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
              </Route>
            </Routes>
          </SWRConfig>
        </TooltipProvider>
      </LocaleContext.Provider>
    </MemoryRouter>)

    await waitFor(() => {
      expect(mockTranslateHandle).toHaveBeenCalledTimes(1)
    })
    expect(mockSummarizeHandle).toHaveBeenCalledTimes(0)

    vi.clearAllMocks()
    summaryAutoRunTracker.clear()
    mockSettings.summaryAuto = 'off'
    mockSettings.translateAuto = 'off'

    render(<MemoryRouter>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <TooltipProvider>
          <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
            <Routes>
              <Route element={<OutletWrapper />}>
                <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
              </Route>
            </Routes>
          </SWRConfig>
        </TooltipProvider>
      </LocaleContext.Provider>
    </MemoryRouter>)

    expect(mockSummarizeHandle).toHaveBeenCalledTimes(0)
    expect(mockTranslateHandle).toHaveBeenCalledTimes(0)

    vi.clearAllMocks()
    summaryAutoRunTracker.clear()
    mockSettings.summaryAuto = 'on'
    mockSettings.translateAuto = 'on'

    render(<MemoryRouter>
      <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
        <TooltipProvider>
          <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
            <Routes>
              <Route element={<OutletWrapper />}>
                <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
              </Route>
            </Routes>
          </SWRConfig>
        </TooltipProvider>
      </LocaleContext.Provider>
    </MemoryRouter>)

    await waitFor(() => {
      expect(mockSummarizeHandle).toHaveBeenCalledTimes(1)
      expect(mockTranslateHandle).toHaveBeenCalledTimes(1)
    })
  })

  it('keeps the 4 combinations stable across refresh/remount', async () => {
    const locale = 'en'
    mockSettings.translateProvider = 'anthropic'
    mockSettings.translateModel = 'claude-sonnet-4-6'
    mockSettings.translateTargetLang = 'en'

    const cases = [
      { summaryAuto: 'on' as const, translateAuto: 'off' as const, expectedSummary: 1, expectedTranslate: 0 },
      { summaryAuto: 'off' as const, translateAuto: 'on' as const, expectedSummary: 0, expectedTranslate: 1 },
      { summaryAuto: 'off' as const, translateAuto: 'off' as const, expectedSummary: 0, expectedTranslate: 0 },
      { summaryAuto: 'on' as const, translateAuto: 'on' as const, expectedSummary: 1, expectedTranslate: 1 },
    ] as const

    for (const testCase of cases) {
      mockSettings.summaryAuto = testCase.summaryAuto
      mockSettings.translateAuto = testCase.translateAuto

      const { unmount } = render(
        <MemoryRouter>
          <LocaleContext.Provider value={{ locale, setLocale: vi.fn() }}>
            <TooltipProvider>
              <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
                <Routes>
                  <Route element={<OutletWrapper />}>
                    <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                  </Route>
                </Routes>
              </SWRConfig>
            </TooltipProvider>
          </LocaleContext.Provider>
        </MemoryRouter>
      )

      await waitFor(() => {
        expect(mockSummarizeHandle).toHaveBeenCalledTimes(testCase.expectedSummary)
        expect(mockTranslateHandle).toHaveBeenCalledTimes(testCase.expectedTranslate)
      })

      unmount()
      mockSummarizeHandle.mockClear()
      mockTranslateHandle.mockClear()
      summaryAutoRunTracker.clear()
    }
  })

  it('auto-starts translation for non-user language when provider is configured', async () => {
    mockSettings.translateProvider = 'anthropic'
    mockSettings.translateModel = 'claude-sonnet-4-6'
    mockSettings.translateAuto = 'on'
    mockSettings.translateTargetLang = 'en'

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(mockTranslateHandle).toHaveBeenCalledTimes(1)
    })
  })

  it('does not auto-start translation when provider is not configured', () => {
    mockSettings.translateAuto = 'on'

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'en', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    expect(mockTranslateHandle).not.toHaveBeenCalled()
  })

  it('does not auto-start translation when article is already in user language', () => {
    mockSettings.translateProvider = 'anthropic'
    mockSettings.translateAuto = 'on'
    mockSettings.translateTargetLang = 'fr'

    render(
      <MemoryRouter>
        <LocaleContext.Provider value={{ locale: 'fr', setLocale: vi.fn() }}>
          <TooltipProvider>
            <SWRConfig value={{ provider: () => new Map(), fallback: { [articleKey]: article } }}>
              <Routes>
                <Route element={<OutletWrapper />}>
                  <Route path="*" element={<ArticleDetail articleUrl={articleUrl} />} />
                </Route>
              </Routes>
            </SWRConfig>
          </TooltipProvider>
        </LocaleContext.Provider>
      </MemoryRouter>,
    )

    expect(mockTranslateHandle).not.toHaveBeenCalled()
  })
})
