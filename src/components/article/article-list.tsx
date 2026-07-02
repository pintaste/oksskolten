import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef, useMemo } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import useSWR from 'swr'
import useSWRInfinite from 'swr/infinite'
import { useSWRConfig } from 'swr'
import { fetcher } from '../../lib/fetcher'
import { markSeenOnServer } from '../../lib/markSeenWithQueue'
import { useI18n } from '../../lib/i18n'
import { trackRead } from '../../lib/readTracker'
import { useIsTouchDevice } from '../../hooks/use-is-touch-device'
import { useClipFeedId } from '../../hooks/use-clip-feed-id'
import { useAppLayout } from '../../app'
import { ArticleCard, type ArticleDisplayConfig } from './article-card'
import { ArticleListToolbar } from './article-list-toolbar'
import { SwipeableArticleCard } from './swipeable-article-card'
import { articleUrlToPath } from '../../lib/url'
import { ArticleOverlay } from './article-overlay'
import { PullToRefresh } from '../layout/pull-to-refresh'
import { useFetchProgressContext } from '../../contexts/fetch-progress-context'
import { toast } from 'sonner'
import { Mascot } from '../ui/mascot'
import { FeedErrorBanner } from '../feed/feed-error-banner'
import { Skeleton } from '../ui/skeleton'
import { useKeyboardNavigationContext } from '../../contexts/keyboard-navigation-context'
import { useKeyboardNavigation } from '../../hooks/use-keyboard-navigation'
import { apiPatch, apiPost } from '../../lib/fetcher'
import { Trash2, ThumbsDown, BookmarkX, Eye } from 'lucide-react'
import type { ArticleListItem, FeedWithCounts } from '../../../shared/types'
import type { LayoutName } from '../../data/layouts'

const TOAST_DURATION = 2000
const RING_R = 7
const RING_CIRC = 2 * Math.PI * RING_R

function UndoToast({ id, message, onUndo, onExpire, duration = TOAST_DURATION }: {
  id: string | number
  message: string
  onUndo: () => Promise<void>
  onExpire?: () => Promise<void>
  duration?: number
}) {
  const { t } = useI18n()
  const circleRef = useRef<SVGCircleElement>(null)

  useEffect(() => {
    const start = Date.now()
    let raf: number
    const tick = () => {
      const elapsed = Date.now() - start
      const progress = Math.max(0, 1 - elapsed / duration)
      if (circleRef.current) {
        circleRef.current.style.strokeDashoffset = String(RING_CIRC * (1 - progress))
      }
      if (elapsed < duration) raf = requestAnimationFrame(tick)
      else { toast.dismiss(id); void onExpire?.() }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [id, duration, onExpire])

  return (
    <div className="flex items-center gap-3 w-full px-1 py-0.5 text-sm">
      <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0 -rotate-90">
        <circle cx="9" cy="9" r={RING_R} fill="none" strokeWidth="2" style={{ stroke: 'var(--color-border)' }} />
        <circle
          ref={circleRef}
          cx="9" cy="9" r={RING_R} fill="none" strokeWidth="2"
          strokeDasharray={RING_CIRC}
          strokeDashoffset={0}
          strokeLinecap="round"
          style={{ stroke: 'var(--color-accent)' }}
        />
      </svg>
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={() => { void onUndo(); toast.dismiss(id) }}
        className="shrink-0 font-medium hover:underline"
        style={{ color: 'var(--color-accent)' }}
      >
        {t('toast.undo')}
      </button>
    </div>
  )
}

interface ArticlesResponse {
  articles: ArticleListItem[]
  total: number
  has_more: boolean
  total_without_floor?: number
  total_all?: number
}

const PAGE_SIZE = 20

/** How often (ms) to flush the batch of read article IDs to the server */
const BATCH_FLUSH_INTERVAL = 1500

export interface ArticleListHandle {
  revalidate: () => void
}

/** Returns true if the title text already appears to be in the target language. */
function titleAlreadyInLang(title: string, targetLang: string): boolean {
  const len = title.length || 1
  const kana = (title.match(/[぀-ヿ]/g) || []).length
  const cjk  = (title.match(/[一-鿿]/g) || []).length
  if (targetLang === 'ja') return (kana + cjk) / len > 0.15
  if (targetLang === 'zh') return kana / len < 0.02 && cjk / len > 0.15
  return false
}

interface ArticleListProps {
  onSplitOpen?: (url: string) => void
  selectedUrl?: string | null
}

export const ArticleList = forwardRef<ArticleListHandle, ArticleListProps>(function ArticleList({ onSplitOpen, selectedUrl }, ref) {
  const location = useLocation()
  const navigate = useNavigate()
  const { feedId: feedIdParam, categoryId: categoryIdParam } = useParams<{ feedId?: string; categoryId?: string }>()
  const { settings } = useAppLayout()
  const clipFeedId = useClipFeedId()

  const isBookmarks = location.pathname === '/bookmarks'
  const isLikes = location.pathname === '/likes'
  const isHistory = location.pathname === '/history'
  const isClips = location.pathname === '/clips'
  const isCollectionView = isBookmarks || isLikes || isHistory || isClips

  const { data: feedsData } = useSWR<{ feeds: FeedWithCounts[] }>('/api/feeds', fetcher)
  const feedId = feedIdParam ? Number(feedIdParam) : (isClips && clipFeedId ? clipFeedId : undefined)
  const currentFeed = feedId && feedsData ? feedsData.feeds.find(f => f.id === feedId) : undefined
  const categoryId = categoryIdParam ? Number(categoryIdParam) : undefined
  const [showReadArticles, setShowReadArticles] = useState(false)
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('unread')
  const categoryUnreadOnly = !!categoryId && settings.categoryUnreadOnly === 'on'
  const unreadOnly = !isCollectionView && (readFilter === 'unread' || (readFilter === 'all' && categoryUnreadOnly && !showReadArticles))
  const bookmarkedOnly = isBookmarks
  const likedOnly = isLikes
  const readOnly = isHistory || readFilter === 'read'
  const { autoMarkRead, dateMode, indicatorStyle, layout, articleOpenMode, keyboardNavigation, keybindings, translateTitleAuto, translateTargetLang } = settings
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null)
  const [noFloor, setNoFloor] = useState(false)
  const [titleTranslations, setTitleTranslations] = useState<Map<number, string>>(new Map())
  const displayConfig: ArticleDisplayConfig = useMemo(() => ({
    dateMode,
    indicatorStyle,
    showUnreadIndicator: settings.showUnreadIndicator === 'on',
    showThumbnails: settings.showThumbnails === 'on',
  }), [dateMode, indicatorStyle, settings.showUnreadIndicator, settings.showThumbnails])
  const isGridLayout = layout === 'card' || layout === 'magazine'
  const { t, locale } = useI18n()
  const { progress, startFeedFetch } = useFetchProgressContext()
  const { mutate: globalMutate } = useSWRConfig()
  const getKey = useCallback((pageIndex: number, previousPageData: ArticlesResponse | null) => {
    if (previousPageData && !previousPageData.has_more) return null
    const params = new URLSearchParams()
    if (feedId) params.set('feed_id', String(feedId))
    if (categoryId) params.set('category_id', String(categoryId))
    if (unreadOnly) params.set('unread', '1')
    if (bookmarkedOnly) params.set('bookmarked', '1')
    if (likedOnly) params.set('liked', '1')
    if (readOnly) params.set('read', '1')
    if (noFloor || readFilter === 'read') params.set('no_floor', '1')
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(pageIndex * PAGE_SIZE))
    return `/api/articles?${params.toString()}`
  }, [feedId, categoryId, unreadOnly, bookmarkedOnly, likedOnly, readOnly, noFloor, readFilter])

  const { data, error, size, setSize, isLoading, isValidating, mutate } = useSWRInfinite<ArticlesResponse>(
    getKey,
    fetcher,
    {
      revalidateFirstPage: isCollectionView,
    },
  )

  useImperativeHandle(ref, () => ({
    revalidate: () => mutate(),
  }), [mutate])

  const articles = useMemo(() => data ? data.flatMap(page => page.articles) : [], [data])
  const hasMore = data ? data[data.length - 1]?.has_more ?? false : false
  const isEmpty = data?.[0]?.articles.length === 0
  const totalAll = data?.[0]?.total_all
  const allReadEmpty = isEmpty && categoryUnreadOnly && !showReadArticles && totalAll != null && totalAll > 0
  const hiddenByFloor = data?.[0]?.total_without_floor != null
    ? data[0].total_without_floor - (data[0].total ?? 0)
    : 0

  // ---------------------------------------------------------------------------
  // Keyboard navigation
  // ---------------------------------------------------------------------------
  const { focusedItemId, setFocusedItemId, setArticleIds, setArticleUrls, setLastListUrl } = useKeyboardNavigationContext()
  const isKeyboardNavEnabled = keyboardNavigation === 'on' && !isGridLayout

  const articleIds = useMemo(() => articles.map(a => String(a.id)), [articles])
  const articleUrls = useMemo(() => {
    const map: Record<string, string> = {}
    for (const a of articles) map[String(a.id)] = a.url
    return map
  }, [articles])

  useEffect(() => {
    setArticleIds(articleIds)
    setArticleUrls(articleUrls)
  }, [articleIds, articleUrls, setArticleIds, setArticleUrls])

  useEffect(() => {
    setLastListUrl(location.pathname)
  }, [location.pathname, setLastListUrl])

  const articleMap = useMemo(() => {
    const map = new Map<string, ArticleListItem>()
    for (const a of articles) map.set(String(a.id), a)
    return map
  }, [articles])

  // Auto-translate titles when setting is on
  useEffect(() => {
    if (translateTitleAuto !== 'on' || articles.length === 0) return
    const targetLang = translateTargetLang || undefined
    const needsTranslation = articles.filter(a =>
      !a.title_translated &&
      !titleTranslations.has(a.id) &&
      (!targetLang || a.lang !== targetLang),
    )
    if (needsTranslation.length === 0) return
    const ids = needsTranslation.map(a => a.id)
    apiPost('/api/articles/translate-titles', { ids })
      .then((res: unknown) => {
        const data = res as { results: { id: number; title_translated: string }[] }
        if (!data.results?.length) return
        setTitleTranslations(prev => {
          const next = new Map(prev)
          for (const { id, title_translated } of data.results) next.set(id, title_translated)
          return next
        })
      })
      .catch(() => {})
  }, [articles, translateTitleAuto, translateTargetLang, titleTranslations])

  const isOverlayMode = articleOpenMode === 'overlay'
  const isSplitMode = articleOpenMode === 'split'
  // Short debounce after overlay close to prevent Escape from immediately clearing focus
  const escapeDebounceRef = useRef(false)

  useKeyboardNavigation({
    items: articleIds,
    focusedItemId,
    onFocusChange: (id) => {
      setFocusedItemId(id)
      const el = document.querySelector(`[data-article-id="${id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      // Overlay mode: open article immediately on j/k
      if (isOverlayMode) {
        const article = articleMap.get(id)
        if (article) setOverlayUrl(article.url)
      }
      // Split mode: open article in right panel on j/k
      if (isSplitMode && onSplitOpen) {
        const article = articleMap.get(id)
        if (article) onSplitOpen(article.url)
      }
    },
    onEnter: (isOverlayMode || isSplitMode) ? undefined : (id) => {
      // Page mode: Enter to navigate
      const article = articleMap.get(id)
      if (article) {
        void navigate(articleUrlToPath(article.url))
      }
    },
    onEscape: () => {
      if (escapeDebounceRef.current) return
      setFocusedItemId(null)
    },
    onBookmarkToggle: (id) => {
      const article = articleMap.get(id)
      if (!article) return
      const next = !article.bookmarked_at
      // Optimistic update on the list's SWR cache
      void mutate(
        (pages) => pages?.map(page => ({
          ...page,
          articles: page.articles.map(a =>
            String(a.id) === id
              ? { ...a, bookmarked_at: next ? new Date().toISOString() : null }
              : a
          ),
        })),
        { revalidate: false },
      )
      // Also update the by-url cache so an open overlay (article-detail) reflects
      // the change immediately. ArticleDetail keys its SWR off the article URL,
      // which is a separate cache from the list and would otherwise stay stale.
      const byUrlKey = `/api/articles/by-url?url=${encodeURIComponent(article.url)}`
      void globalMutate(
        byUrlKey,
        (curr: { bookmarked_at: string | null } | undefined) =>
          curr ? { ...curr, bookmarked_at: next ? new Date().toISOString() : null } : curr,
        { revalidate: false },
      )
      apiPatch(`/api/articles/${article.id}/bookmark`, { bookmarked: next })
        .then(() => {
          void globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/feeds'))
        })
        .catch(() => {
          // Roll back on failure
          void mutate()
          void globalMutate(byUrlKey)
        })
    },
    onOpenExternal: (id) => {
      const article = articleMap.get(id)
      if (article?.url) { window.open(article.url, '_blank', 'noopener,noreferrer'); window.focus() }
    },
    onNearEnd: () => loadMoreRef.current(),
    enabled: isKeyboardNavEnabled,
    keyBindings: keybindings,
  })

  // ---------------------------------------------------------------------------
  // Infinite scroll
  // ---------------------------------------------------------------------------
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Keep loadMore in a stable ref so the IntersectionObserver callback
  // always sees the latest values without needing to recreate the observer.
  const loadMoreRef = useRef(() => {})
  loadMoreRef.current = () => {
    if (hasMore && !isValidating) {
      void setSize(size + 1)
    }
  }

  // Stable observer — created once via ref callback when sentinel mounts.
  const sentinelObserverRef = useRef<IntersectionObserver | null>(null)
  const sentinelCallbackRef = useCallback((node: HTMLDivElement | null) => {
    // Cleanup previous
    sentinelObserverRef.current?.disconnect()
    sentinelObserverRef.current = null
    sentinelRef.current = node

    if (!node) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMoreRef.current() },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    sentinelObserverRef.current = observer
  }, [])

  // Re-trigger loading when a fetch completes while sentinel is still visible.
  // IntersectionObserver only fires on threshold crossings, so if the sentinel
  // stays within the viewport after new articles render, no event fires and
  // pagination stalls. This effect covers that gap.
  useEffect(() => {
    if (!isValidating && hasMore && sentinelRef.current) {
      const rect = sentinelRef.current.getBoundingClientRect()
      if (rect.top < window.innerHeight + 200) {
        void setSize(prev => prev + 1)
      }
    }
  }, [isValidating, hasMore, setSize])

  // ---------------------------------------------------------------------------
  // Auto-mark-as-read on scroll
  //
  // - IntersectionObserver fires when an article overlaps the header (48px)
  // - UI updates instantly via React state (autoReadIds)
  // - API calls are batched and flushed every ~1.5 s
  // ---------------------------------------------------------------------------
  const [autoReadIds, setAutoReadIds] = useState<Set<number>>(() => new Set())
  const autoReadIdsRef = useRef(autoReadIds)
  autoReadIdsRef.current = autoReadIds
  const observerRef = useRef<IntersectionObserver | null>(null)
  const batchQueue = useRef(new Set<number>())
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flushBatch = useCallback(() => {
    if (batchQueue.current.size === 0) return
    const ids = [...batchQueue.current]
    batchQueue.current.clear()
    markSeenOnServer(ids)
      .then(() => globalMutate(
        (key: string) => typeof key === 'string' && key.startsWith('/api/feeds'),
      ))
      .catch(() => {})
  }, [globalMutate])

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null
      flushBatch()
    }, BATCH_FLUSH_INTERVAL)
  }, [flushBatch])

  // Mark an article as read: instant UI update + SWR cache + queue for server batch
  const markRead = useCallback((articleId: number) => {
    setAutoReadIds(prev => {
      if (prev.has(articleId)) return prev
      const next = new Set(prev)
      next.add(articleId)
      return next
    })
    // Persist into SWR cache so the read state survives page navigation
    void mutate(
      pages => pages?.map(page => ({
        ...page,
        articles: page.articles.map(a =>
          a.id === articleId ? { ...a, seen_at: a.seen_at ?? new Date().toISOString() } : a
        ),
      })),
      { revalidate: false },
    )
    trackRead(articleId)
    batchQueue.current.add(articleId)
    scheduleFlush()
  }, [scheduleFlush, mutate])

  // Stable ref so the observer callback always sees the latest markRead
  const markReadRef = useRef(markRead)
  markReadRef.current = markRead

  const isAutoMarkEnabled = autoMarkRead === 'on'
  const isTouchDevice = useIsTouchDevice()
  const listRef = useRef<HTMLElement>(null)

  // Create the IntersectionObserver once when auto-mark is enabled.
  // The observer instance is kept stable — new article nodes from infinite
  // scroll are added incrementally via a separate effect, avoiding the
  // disconnect/recreate race that caused missed or phantom read events.
  useEffect(() => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!isAutoMarkEnabled) return

    // Measure actual header height in pixels — iOS Safari rejects rootMargin
    // values containing calc() or env() that getComputedStyle may return.
    const headerEl = document.querySelector('[data-header]') as HTMLElement | null
    const headerH = headerEl ? `${headerEl.offsetHeight}px` : '48px'

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          const articleId = Number(el.dataset.articleId)
          if (!articleId) continue
          if (el.dataset.articleUnread !== '1') continue

          const rootTop = entry.rootBounds?.top ?? 0
          if (entry.boundingClientRect.top < rootTop) {
            markReadRef.current(articleId)
          }
        }
      },
      {
        rootMargin: `-${headerH} 0px 0px 0px`,
        threshold: [0, 1],
      },
    )

    observerRef.current = observer

    // Observe all article nodes already in the DOM
    if (listRef.current) {
      const nodes = listRef.current.querySelectorAll<HTMLElement>('[data-article-id]')
      nodes.forEach(node => observer.observe(node))
    }

    return () => observer.disconnect()
  }, [isAutoMarkEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Incrementally observe new article nodes added by infinite scroll.
  // Uses a MutationObserver to detect inserted DOM nodes so the
  // IntersectionObserver instance stays stable (no disconnect/recreate).
  useEffect(() => {
    const list = listRef.current
    const io = observerRef.current
    if (!list || !io || !isAutoMarkEnabled) return

    const mo = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          // The node itself might be an article wrapper
          if (node.dataset.articleId) {
            io.observe(node)
          }
          // Or it might contain article wrappers (e.g. fragment insert)
          const children = node.querySelectorAll<HTMLElement>('[data-article-id]')
          children.forEach(child => io.observe(child))
        }
      }
    })

    mo.observe(list, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [isAutoMarkEnabled])

  // Flush remaining batch on unmount or feed/category change
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current)
        flushTimerRef.current = null
      }
      flushBatch()
    }
  }, [feedId, categoryId, flushBatch])

  // Reset autoReadIds, noFloor, showReadArticles, and keyboard focus when feed/category changes
  useEffect(() => {
    setAutoReadIds(new Set())
    setNoFloor(false)
    setShowReadArticles(false)
    setReadFilter('unread')
    setSelectedIds(new Set())
    setSelectionActive(false)
    setFocusedItemId(null)
  }, [feedId, categoryId, setFocusedItemId])

  // ---------------------------------------------------------------------------
  // Per-card actions (bookmark, mark read/unread, mark all read)
  // ---------------------------------------------------------------------------

  const handleToggleBookmark = useCallback((article: ArticleListItem) => {
    const next = !article.bookmarked_at
    void mutate(
      pages => pages?.map(page => ({
        ...page,
        articles: page.articles.map(a =>
          a.id === article.id ? { ...a, bookmarked_at: next ? new Date().toISOString() : null } : a
        ),
      })),
      { revalidate: false },
    )
    apiPatch(`/api/articles/${article.id}/bookmark`, { bookmarked: next })
      .then(() => globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds')))
      .catch(() => mutate())
  }, [mutate, globalMutate])

  const handleToggleRead = useCallback((article: ArticleListItem) => {
    const isCurrentlyRead = article.seen_at != null || autoReadIdsRef.current.has(article.id)
    const next = !isCurrentlyRead
    if (!next) setAutoReadIds(prev => { const s = new Set(prev); s.delete(article.id); return s })
    void mutate(
      pages => pages?.map(page => ({
        ...page,
        articles: page.articles.map(a =>
          a.id === article.id ? { ...a, seen_at: next ? new Date().toISOString() : null } : a
        ),
      })),
      { revalidate: false },
    )
    apiPatch(`/api/articles/${article.id}/seen`, { seen: next })
      .then(() => globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds')))
      .catch(() => mutate())
  }, [mutate, globalMutate])

  const handleMarkAllRead = useCallback(() => {
    const scope: Record<string, unknown> = {}
    if (feedId) scope.feed_id = feedId
    else if (categoryId) scope.category_id = categoryId

    const snapshot = data
    void mutate(
      pages => pages?.map(page => ({
        ...page,
        articles: page.articles.map(a => ({ ...a, seen_at: a.seen_at ?? new Date().toISOString() })),
      })),
      { revalidate: false },
    )
    toast.custom((id) => (
      <UndoToast
        id={id}
        message={t('toast.markedAllRead')}
        onUndo={async () => { void mutate(() => snapshot, { revalidate: false }) }}
        onExpire={async () => {
          await apiPost('/api/articles/mark-all-seen', { ...scope, seen: true })
          void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
        }}
      />
    ), { duration: Infinity })
  }, [feedId, categoryId, data, mutate, globalMutate, t])

  const handleOpenExternal = useCallback((article: ArticleListItem) => {
    markRead(article.id)
  }, [markRead])

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set())
  const [selectionActive, setSelectionActive] = useState(false)
  const isSelectionMode = selectionActive || selectedIds.size > 0

  const handleSelect = useCallback((article: ArticleListItem) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(article.id)) next.delete(article.id)
      else next.add(article.id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(articles.map(a => a.id)))
  }, [articles])

  const handleCancelSelection = useCallback(() => {
    setSelectedIds(new Set())
    setSelectionActive(false)
  }, [])

  useEffect(() => {
    if (!isSelectionMode) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleCancelSelection() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isSelectionMode, handleCancelSelection])

  const handleBatchMarkRead = useCallback(async () => {
    const ids = [...selectedIds]
    setSelectedIds(new Set()); setSelectionActive(false)
    void mutate(
      pages => pages?.map(page => ({
        ...page,
        articles: page.articles.map(a =>
          ids.includes(a.id) ? { ...a, seen_at: new Date().toISOString() } : a
        ),
      })),
      { revalidate: false },
    )
    await apiPost('/api/articles/batch-seen', { ids, seen: true })
    void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
  }, [selectedIds, mutate, globalMutate])

  const handleBatchMarkUnread = useCallback(async () => {
    const ids = [...selectedIds]
    setSelectedIds(new Set()); setSelectionActive(false)
    void mutate(
      pages => pages?.map(page => ({
        ...page,
        articles: page.articles.map(a =>
          ids.includes(a.id) ? { ...a, seen_at: null } : a
        ),
      })),
      { revalidate: false },
    )
    await apiPost('/api/articles/batch-seen', { ids, seen: false })
    void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
  }, [selectedIds, mutate, globalMutate])

  const hasUnread = articles.some(a => a.seen_at == null && !autoReadIds.has(a.id))
  const handleBatchRemoveBookmark = useCallback(async () => {
    const ids = [...selectedIds]
    void mutate(
      pages => pages?.map(page => ({
        ...page,
        articles: page.articles.filter(a => !ids.includes(a.id)),
      })),
      { revalidate: false },
    )
    setSelectedIds(new Set())
    setSelectionActive(false)
    await apiPost('/api/articles/batch-bookmark', { ids, bookmarked: false })
    void mutate()
    void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
  }, [selectedIds, mutate, globalMutate])

  const handleClearBookmarks = useCallback(() => {
    const snapshot = data
    void mutate(pages => pages?.map(page => ({ ...page, articles: [] })), { revalidate: false })
    toast.custom((id) => (
      <UndoToast
        id={id}
        message={t('toast.clearedBookmarks')}
        onUndo={async () => { void mutate(() => snapshot, { revalidate: false }) }}
        onExpire={async () => {
          await apiPost('/api/articles/clear-bookmarks', {})
          void mutate()
          void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
        }}
      />
    ), { duration: Infinity })
  }, [data, mutate, globalMutate, t])

  // Likes
  const handleBatchRemoveLike = useCallback(async () => {
    const ids = [...selectedIds]
    void mutate(pages => pages?.map(page => ({ ...page, articles: page.articles.filter(a => !ids.includes(a.id)) })), { revalidate: false })
    setSelectedIds(new Set()); setSelectionActive(false)
    await apiPost('/api/articles/batch-like', { ids, liked: false })
    void mutate()
    void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
  }, [selectedIds, mutate, globalMutate])

  const handleClearLikes = useCallback(() => {
    const snapshot = data
    void mutate(pages => pages?.map(page => ({ ...page, articles: [] })), { revalidate: false })
    toast.custom((id) => (
      <UndoToast
        id={id}
        message={t('toast.clearedLikes')}
        onUndo={async () => { void mutate(() => snapshot, { revalidate: false }) }}
        onExpire={async () => {
          await apiPost('/api/articles/clear-likes', {})
          void mutate()
          void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
        }}
      />
    ), { duration: Infinity })
  }, [data, mutate, globalMutate, t])

  // Clips
  const handleBatchRemoveClip = useCallback(async () => {
    const ids = [...selectedIds]
    void mutate(pages => pages?.map(page => ({ ...page, articles: page.articles.filter(a => !ids.includes(a.id)) })), { revalidate: false })
    setSelectedIds(new Set()); setSelectionActive(false)
    await apiPost('/api/articles/batch-delete', { ids })
    void mutate()
  }, [selectedIds, mutate])

  const handleClearClips = useCallback(() => {
    if (!clipFeedId) return
    const snapshot = data
    void mutate(pages => pages?.map(page => ({ ...page, articles: [] })), { revalidate: false })
    toast.custom((id) => (
      <UndoToast
        id={id}
        message={t('toast.clearedClips')}
        onUndo={async () => { void mutate(() => snapshot, { revalidate: false }) }}
        onExpire={async () => {
          await apiPost(`/api/articles/clear-feed/${clipFeedId}`, {})
          void mutate()
        }}
      />
    ), { duration: Infinity })
  }, [clipFeedId, data, mutate, t])

  // History
  const handleBatchMarkUnreadFromHistory = useCallback(async () => {
    const ids = [...selectedIds]
    void mutate(pages => pages?.map(page => ({ ...page, articles: page.articles.filter(a => !ids.includes(a.id)) })), { revalidate: false })
    setSelectedIds(new Set()); setSelectionActive(false)
    await apiPost('/api/articles/batch-seen', { ids, seen: false })
    void mutate()
    void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
  }, [selectedIds, mutate, globalMutate])

  const handleClearHistory = useCallback(() => {
    const snapshot = data
    void mutate(pages => pages?.map(page => ({ ...page, articles: [] })), { revalidate: false })
    toast.custom((id) => (
      <UndoToast
        id={id}
        message={t('toast.clearedHistory')}
        onUndo={async () => { void mutate(() => snapshot, { revalidate: false }) }}
        onExpire={async () => {
          await apiPost('/api/articles/clear-history', {})
          void mutate()
          void globalMutate((k: string) => typeof k === 'string' && k.startsWith('/api/feeds'))
        }}
      />
    ), { duration: Infinity })
  }, [data, mutate, globalMutate, t])

  const showToolbar = !isCollectionView || isBookmarks || isLikes || isHistory || isClips

  return (
    <main ref={listRef} className={isSplitMode ? '' : 'max-w-2xl mx-auto'} role={!isGridLayout ? 'listbox' : undefined}>
      {isTouchDevice && <PullToRefresh onRefresh={async () => {
        if (feedId) {
          const result = await startFeedFetch(feedId)
          const name = currentFeed?.name ?? ''
          if (result.error) toast.error(t('toast.fetchError', { name }))
          else if (result.totalNew > 0) toast.success(t('toast.fetchedArticles', { count: String(result.totalNew), name }))
          else toast(t('toast.noNewArticles', { name }))
        } else {
          await mutate()
        }
      }} />}

      {showToolbar && !isLoading && (
        <ArticleListToolbar
          readFilter={readFilter}
          onChangeReadFilter={setReadFilter}
          showReadFilter={!isBookmarks && !isLikes && !isHistory && !isClips}
          onMarkAllRead={handleMarkAllRead}
          hasUnread={hasUnread}
          selectedCount={selectedIds.size}
          totalCount={articles.length}
          onBatchMarkRead={!isBookmarks && !isLikes && !isClips && !isHistory ? handleBatchMarkRead : undefined}
          onBatchMarkUnread={!isBookmarks && !isLikes && !isClips && !isHistory ? handleBatchMarkUnread : undefined}
          onBatchAction={
            isBookmarks ? handleBatchRemoveBookmark :
            isLikes ? handleBatchRemoveLike :
            isClips ? handleBatchRemoveClip :
            isHistory ? handleBatchMarkUnreadFromHistory :
            undefined
          }
          batchActionLabel={
            isBookmarks ? t('articles.batchRemoveBookmark') :
            isLikes ? t('articles.batchRemoveLike') :
            isClips ? t('articles.batchRemoveClip') :
            isHistory ? t('articles.batchMarkUnreadFromHistory') :
            undefined
          }
          batchActionIcon={
            isBookmarks ? <BookmarkX size={13} /> :
            isLikes ? <ThumbsDown size={13} /> :
            isClips ? <Trash2 size={13} /> :
            isHistory ? <Eye size={13} /> :
            undefined
          }
          onClearAction={
            isBookmarks ? handleClearBookmarks :
            isLikes ? handleClearLikes :
            isClips ? handleClearClips :
            isHistory ? handleClearHistory :
            undefined
          }
          clearActionLabel={
            isBookmarks ? t('articles.clearBookmarks') :
            isLikes ? t('articles.clearLikes') :
            isClips ? t('articles.clearClips') :
            isHistory ? t('articles.clearHistory') :
            undefined
          }
          clearActionIcon={
            isBookmarks || isLikes || isClips ? <Trash2 size={13} /> :
            isHistory ? <Trash2 size={13} /> :
            undefined
          }
          onSelectAll={handleSelectAll}
          onCancelSelection={handleCancelSelection}
          isSelectionMode={isSelectionMode}
          onEnterSelectionMode={() => setSelectionActive(true)}
        />
      )}

      {isLoading && <ArticleListSkeleton layout={layout} showThumbnails={displayConfig.showThumbnails} />}

      {error && (
        <div className="text-center py-12">
          <p className="text-muted mb-2">{t('articles.loadError')}</p>
          <button onClick={() => setSize(1)} className="text-accent text-sm">
            {t('articles.retry')}
          </button>
        </div>
      )}

      {allReadEmpty && !isLoading && (
        <div className="text-center py-12">
          <p className="text-muted mb-3">{t('articles.allRead')}</p>
          <button
            onClick={() => setShowReadArticles(true)}
            className="text-accent text-sm hover:underline"
          >
            {t('articles.showReadArticles')}
          </button>
        </div>
      )}

      {isEmpty && !allReadEmpty && !isLoading && currentFeed && feedId && progress.has(feedId) && (
        <FeedErrorBanner
          lastError={currentFeed.last_error ?? ''}
          feedId={currentFeed.id}
          overridePhase="processing"
        />
      )}

      {isEmpty && !allReadEmpty && !isLoading && !(feedId && progress.has(feedId)) && (
        currentFeed?.last_error ? (
          <FeedErrorBanner
            lastError={currentFeed.last_error}
            feedId={currentFeed.id}
            onMutate={async () => {
              await globalMutate((key: unknown) => typeof key === 'string' && key.startsWith('/api/feeds'))
            }}
            onFetch={currentFeed.type !== 'clip' ? async () => {
              const result = await startFeedFetch(currentFeed.id)
              const name = currentFeed.name
              if (result.error) toast.error(t('toast.fetchError', { name }))
              else if (result.totalNew > 0) { toast.success(t('toast.fetchedArticles', { count: String(result.totalNew), name })); void mutate() }
              else toast(t('toast.noNewArticles', { name }))
            } : undefined}
          />
        ) : (
          <p className="text-muted text-center py-12">{t('articles.empty')}</p>
        )
      )}

      <div className={isGridLayout ? 'grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-6' : ''}>
        {articles.map((article, index) => {
          const isAutoRead = autoReadIds.has(article.id)
          const effectiveArticle = isAutoRead
            ? { ...article, seen_at: article.seen_at ?? new Date().toISOString() }
            : article
          const handleOverlayOpen = (e: React.MouseEvent<HTMLAnchorElement>) => {
            if (e.metaKey || e.ctrlKey || e.button === 1) return
            markRead(article.id)
            if (articleOpenMode === 'overlay') {
              e.preventDefault()
              setOverlayUrl(article.url)
            } else if (articleOpenMode === 'split' && onSplitOpen) {
              e.preventDefault()
              onSplitOpen(article.url)
            }
          }
          const cardProps = {
            article: effectiveArticle,
            layout,
            isFeatured: layout === 'magazine' && index === 0,
            onClick: handleOverlayOpen,
            onToggleBookmark: handleToggleBookmark,
            onToggleRead: handleToggleRead,
            onOpenExternal: handleOpenExternal,
            isSelectionMode,
            isSelected: selectedIds.has(article.id),
            onSelect: handleSelect,
            titleTranslated: translateTitleAuto === 'on'
              && article.lang !== (translateTargetLang || locale)
              && !titleAlreadyInLang(article.title, translateTargetLang || locale)
              ? (titleTranslations.get(article.id) ?? effectiveArticle.title_translated ?? undefined)
              : undefined,
            ...displayConfig,
          }
          const isKbFocused = focusedItemId === String(article.id)
          const isSplitSelected = isSplitMode && selectedUrl === article.url
          return (
            <div
              key={article.id}
              data-article-id={article.id}
              data-article-unread={article.seen_at == null && !isAutoRead ? '1' : '0'}
              aria-selected={isKbFocused || isSplitSelected || undefined}
              className={layout === 'magazine' && index === 0 ? 'col-span-full' : ''}
              style={(isKbFocused || isSplitSelected) ? {
                borderLeft: '2px solid var(--color-accent)',
                backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
              } : undefined}
              onClick={() => {
                if (!isGridLayout) {
                  setFocusedItemId(String(article.id))
                }
              }}
            >
              {isTouchDevice ? (
                <SwipeableArticleCard {...cardProps} />
              ) : (
                <ArticleCard {...cardProps} />
              )}
            </div>
          )
        })}
      </div>

      {hasMore && (
        <div ref={sentinelCallbackRef} className="py-4">
          {isValidating && <ArticleListSkeleton layout={layout} count={2} showThumbnails={displayConfig.showThumbnails} />}
        </div>
      )}

      {!hasMore && hiddenByFloor > 0 && (
        <div className="text-center py-6">
          <button
            onClick={() => setNoFloor(true)}
            className="text-accent text-sm hover:underline"
          >
            {t('articles.showOlder', { count: String(hiddenByFloor) })}
          </button>
        </div>
      )}

      {/* Scroll spacer: ensures the last article can scroll past the header for auto-mark-read */}
      {!hasMore && articles.length > 0 && isAutoMarkEnabled && !isCollectionView && (
        <div
          className="flex flex-col items-center justify-end select-none"
          style={{ minHeight: 'calc(100vh - var(--header-height))' }}
        >
          {settings.mascot !== 'off' && (
            <>
              <div>
                <Mascot choice={settings.mascot} />
              </div>
              <p className="text-muted/40 text-xs mt-4 pb-4">{t('articles.allCaughtUp')}</p>
            </>
          )}
        </div>
      )}

      <ArticleOverlay articleUrl={overlayUrl} onClose={() => {
        setOverlayUrl(null)
        escapeDebounceRef.current = true
        setTimeout(() => { escapeDebounceRef.current = false }, 100)
      }} />
    </main>
  )
})

function ArticleListSkeleton({ layout = 'list', count = 3, showThumbnails = true }: { layout?: LayoutName; count?: number; showThumbnails?: boolean }) {
  if (layout === 'compact') {
    return (
      <>
        {Array.from({ length: count * 2 }).map((_, i) => (
          <div key={i} className="border-b border-border py-1.5 px-4 md:px-6">
            <div className="flex items-center gap-2">
              <div className="w-2.5 shrink-0" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3 w-12 shrink-0" />
            </div>
          </div>
        ))}
      </>
    )
  }

  if (layout === 'card') {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-4 md:px-6">
        {Array.from({ length: count * 2 }).map((_, i) => (
          <div key={i} className="border border-border rounded-lg overflow-hidden">
            {showThumbnails && <Skeleton className="w-full aspect-video" />}
            <div className="p-3 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex items-center gap-1 mt-1">
                <Skeleton className="w-3 h-3 shrink-0" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (layout === 'magazine') {
    return (
      <>
        {/* Hero skeleton */}
        <div className="border border-border rounded-lg overflow-hidden mb-4 mx-4 md:mx-6">
          {showThumbnails && <Skeleton className="w-full aspect-video" />}
          <div className="p-4 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
            <div className="flex items-center gap-1 mt-1">
              <Skeleton className="w-3.5 h-3.5 shrink-0" />
              <Skeleton className="h-3 w-28" />
            </div>
          </div>
        </div>
        {/* Small card skeletons */}
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="flex gap-3 border-b border-border py-2 px-4 md:px-6">
            {showThumbnails && <Skeleton className="w-12 h-12 shrink-0" />}
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex items-center gap-1 mt-0.5">
                <Skeleton className="w-3 h-3 shrink-0" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          </div>
        ))}
      </>
    )
  }

  // Default: list layout
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="border-b border-border py-3 px-4 md:px-6">
          <div className="flex items-center gap-2">
            <div className="w-3 shrink-0" />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="flex items-center gap-1 mt-0.5">
                <Skeleton className="w-3.5 h-3.5 shrink-0" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
            {showThumbnails && <Skeleton className="w-16 h-16 shrink-0" />}
          </div>
        </div>
      ))}
    </>
  )
}
