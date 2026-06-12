import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import useSWR from 'swr'
import { renderMarkdown } from '../../lib/markdown'
import { sanitizeHtml } from '../../lib/sanitize'
import { fetcher, apiPost } from '../../lib/fetcher'
import { queueSeenIds } from '../../lib/offlineQueue'
import { useSWRConfig } from 'swr'
import { trackRead } from '../../lib/readTracker'
import { useArticleActions } from '../../hooks/use-article-actions'
import { useI18n } from '../../lib/i18n'
import { useRewriteInternalLinks } from '../../hooks/use-rewrite-internal-links'
import { ImageLightbox } from '../ui/image-lightbox'
import { ChatFab } from '../chat/chat-fab'
import { ConfirmDialog } from '../ui/confirm-dialog'
import { useChatInline, ChatInlinePanel } from '../chat/chat-inline'
import { useMetrics } from '../../hooks/use-metrics'
import { useSummarize } from '../../hooks/use-summarize'
import { useTranslate } from '../../hooks/use-translate'
import { formatDetailDate } from '../../lib/dateFormat'
import { useAppLayout } from '../../app'
import { Skeleton } from '../ui/skeleton'
import { Callout } from '../ui/callout'
import { SanitizedHTML } from '../ui/sanitized-html'
import { ArticleToolbar } from './article-toolbar'
import { ArticleSummarySection } from './article-summary-section'
import { ArticleTranslationBanner } from './article-translation-banner'
import { ArticleContentBody } from './article-content-body'
import { ArticleSimilarBanner } from './article-similar-banner'
import type { ArticleDetail as ArticleDetailData } from '../../../shared/types'

/** Split markdown into paragraph chunks, keeping fenced code blocks intact. */
function splitParagraphs(md: string): string[] {
  const chunks: string[] = []
  const parts = md.split(/(```[\s\S]*?```)/g)
  let current = ''
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      current += parts[i]
    } else {
      const segments = parts[i].split(/\n\n+/)
      for (let j = 0; j < segments.length; j++) {
        if (j === 0) {
          current += segments[j]
        } else {
          if (current.trim()) chunks.push(current.trim())
          current = segments[j]
        }
      }
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

/**
 * Returns true when the paragraph contains only media elements (images, figures)
 * and should be rendered standalone in immersive mode without a translation pair.
 */
function isMediaParagraph(md: string): boolean {
  const stripped = md.trim()
  // Remove markdown images: ![alt](url)
  const withoutMdImages = stripped.replace(/!\[[^\]]*\]\([^)]+\)/g, '')
  // Remove HTML img / picture / figure / video tags
  const withoutHtmlMedia = withoutMdImages.replace(/<(img|picture|figure|video|source)\b[^>]*\/?>/gi, '')
  return withoutHtmlMedia.trim() === ''
}

interface ArticleDetailProps {
  articleUrl: string
  enableZapNavigation?: boolean
}

export function ArticleDetail({ articleUrl }: ArticleDetailProps) {
  const { settings: { internalLinks, chatPosition, translateProvider, translateModel, translateTargetLang, translateSourceLang, summaryAuto, translateAuto, colorMode, setColorMode } } = useAppLayout()
  const navigate = useNavigate()
  const { t, tError, isKeyNotSetError, locale } = useI18n()
  const articleKey = `/api/articles/by-url?url=${encodeURIComponent(articleUrl)}`
  const { data: article, error, mutate } = useSWR<ArticleDetailData>(articleKey, fetcher)
  const { mutate: globalMutate } = useSWRConfig()

  const isUserLang = article?.lang === (translateTargetLang || locale)
  const translateTarget = translateTargetLang || locale
  const translateSource = translateSourceLang || ''
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  const articleRef = useRef<HTMLElement>(null)

  const metrics = useMetrics()
  const { summary, summarizing, streamingText, handleSummarize, summaryHtml, streamingHtml, error: summarizeError } = useSummarize(
    article,
    metrics,
    summaryAuto === 'on',
  )
  // Only pass translation to the hook if it matches the current locale; stale translations are treated as absent
  const isTranslationCurrent = article?.translated_lang === (translateTargetLang || locale)
  const translateInput = useMemo(() =>
    article ? { id: article.id, full_text_translated: isTranslationCurrent ? article.full_text_translated : null } : undefined,
    [article, isTranslationCurrent],
  )
  const { viewMode, setViewMode, translating, translatingText, fullTextTranslated, handleTranslate, translatingHtml, error: translateError } = useTranslate(translateInput, metrics)

  const autoTranslateKey = useMemo(() => {
    if (!article || isUserLang || translateAuto !== 'on' || !translateProvider || fullTextTranslated) {
      return null
    }
    return `${article.id}:${translateProvider}:${translateModel || ''}:${translateTarget}:${translateSource}`
  }, [article, isUserLang, translateAuto, translateProvider, translateModel, translateSource, translateTarget, fullTextTranslated])
  const autoTranslateStartedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!autoTranslateKey || translating) return
    if (autoTranslateStartedRef.current === autoTranslateKey) return
    autoTranslateStartedRef.current = autoTranslateKey
    void handleTranslate()
  }, [autoTranslateKey, handleTranslate, translating])
  const {
    isBookmarked, isLiked, archivingImages, deleteConfirmOpen, setDeleteConfirmOpen,
    toggleBookmark, toggleLike, handleArchiveImages, handleDelete,
  } = useArticleActions(article, articleKey)
  const chat = useChatInline(article?.id ?? 0)

  // Back-to-top visibility — throttled via RAF to avoid 60fps re-renders
  const [showBackToTop, setShowBackToTop] = useState(false)
  useEffect(() => {
    let ticking = false
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        setShowBackToTop(window.scrollY > 400)
        ticking = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Sync translation/summary back into SWR cache so it persists across navigations
  useEffect(() => {
    if (fullTextTranslated && article && article.full_text_translated !== fullTextTranslated) {
      void mutate({ ...article, full_text_translated: fullTextTranslated, translated_lang: locale }, false)
    }
  }, [fullTextTranslated]) // eslint-disable-line react-hooks/exhaustive-deps -- only sync when translated text changes; article/mutate are refs to current data

  useEffect(() => {
    if (summary && article && article.summary !== summary) {
      void mutate({ ...article, summary }, false)
    }
  }, [summary]) // eslint-disable-line react-hooks/exhaustive-deps -- only sync when summary changes; article/mutate are refs to current data

  // Record article read on mount
  const viewedRef = useRef<number | null>(null)
  useEffect(() => {
    if (article && viewedRef.current !== article.id) {
      viewedRef.current = article.id
      const isFirstSeen = article.seen_at == null
      if (isFirstSeen) {
        trackRead(article.id)
      }
      apiPost(`/api/articles/${article.id}/read`)
        .then(() => globalMutate((key: string) => typeof key === 'string' && key.startsWith('/api/feeds')))
        .catch(async () => {
          if (isFirstSeen) {
            await queueSeenIds([article.id])
          }
        })
    }
  }, [article, globalMutate])

  const content = useMemo(() => {
    if (!article) return ''

    // While translating, always show original so the streaming callout is the focus
    if (translating) {
      return sanitizeHtml(renderMarkdown(article.full_text || ''))
    }

    if (viewMode === 'immersive' && fullTextTranslated && !isUserLang) {
      const originalParas = splitParagraphs(article.full_text || '')
      const translatedParas = splitParagraphs(fullTextTranslated)
      let translatedIdx = 0
      let html = ''
      for (const para of originalParas) {
        if (isMediaParagraph(para)) {
          // Render media elements at full opacity without a translation pair
          html += `<div class="immersive-media">${sanitizeHtml(renderMarkdown(para))}</div>`
        } else {
          html += `<div class="immersive-source">${sanitizeHtml(renderMarkdown(para))}</div>`
          if (translatedParas[translatedIdx]) {
            html += `<div class="immersive-translation">${sanitizeHtml(renderMarkdown(translatedParas[translatedIdx]))}</div>`
            translatedIdx++
          }
        }
      }
      return html
    }

    let md = ''
    if (viewMode === 'translated' && !isUserLang) {
      md = fullTextTranslated || ''
    } else {
      md = article.full_text || ''
    }
    if (!md) return `<p class="text-muted">${t('article.noContent')}</p>`
    return sanitizeHtml(renderMarkdown(md))
  }, [article, viewMode, isUserLang, fullTextTranslated, translating, t])

  const { rewrittenHtml: displayContent } = useRewriteInternalLinks(
    content,
    articleUrl,
    internalLinks === 'on',
  )

  // Event delegation: single listener on <article> handles all image clicks & errors
  const hasArticle = !!article
  useEffect(() => {
    const container = articleRef.current
    if (!container) return

    const handleClick = (e: MouseEvent) => {
      const img = (e.target as HTMLElement).closest('.prose img') as HTMLImageElement | null
      if (img) {
        setLightboxSrc(img.currentSrc || img.src)
        return
      }

      const anchor = (e.target as HTMLElement).closest('.prose a') as HTMLAnchorElement | null
      if (anchor) {
        e.preventDefault()
        if (anchor.hasAttribute('data-internal-link')) {
          const path = anchor.getAttribute('href')
          if (path) void navigate(path)
        } else {
          const href = anchor.getAttribute('href')
          if (href) window.open(href, '_blank', 'noopener,noreferrer')
        }
      }
    }

    const handleError = (e: Event) => {
      const el = e.target as HTMLElement
      if (el.tagName === 'IMG' && el.closest('.prose')) {
        el.classList.add('error')
      }
    }

    container.addEventListener('click', handleClick)
    container.addEventListener('error', handleError, true)

    return () => {
      container.removeEventListener('click', handleClick)
      container.removeEventListener('error', handleError, true)
    }
  }, [hasArticle, navigate])

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-6 md:px-10 py-12 text-center">
        <p className="text-muted">{t('article.notFound')}</p>
      </div>
    )
  }

  if (!article) {
    return (
      <div className="max-w-2xl mx-auto px-6 md:px-10 py-8 space-y-4">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/4" />
        <Skeleton className="h-4 w-1/6 mt-4" />
        <Skeleton className="h-8 w-1/2 mt-6" />
        <div className="space-y-3 mt-8">
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    )
  }

  const hasTranslation = !!fullTextTranslated

  return (
    <>
      {enableZapNavigation && (
        <ArticleZapNavigation
          currentArticleId={String(article.id)}
          onBookmarkToggle={toggleBookmark}
          onOpenExternal={() => window.open(article.url, '_blank')}
        />
      )}
      <article ref={articleRef} className="article-card max-w-2xl mx-auto px-6 md:px-10 py-8">
      {/* Title */}
      <h1 className="mb-1.5 text-[28px] font-bold leading-[1.3] break-words [overflow-wrap:anywhere]">
        {article.title}
      </h1>

      {/* Date */}
      <p className="text-sm text-muted mb-3">{formatDetailDate(article.published_at, locale)}</p>

      {/* Toolbar */}
      <ArticleToolbar
        article={article}
        chatPosition={chatPosition}
        chatOpen={chat.open}
        onChatToggle={chat.toggle}
        hasTranslation={hasTranslation}
        translating={translating}
        onTranslate={handleTranslate}
        summary={summary}
        summarizing={summarizing}
        onSummarize={handleSummarize}
        isBookmarked={!!isBookmarked}
        isLiked={isLiked}
        archivingImages={archivingImages}
        onToggleBookmark={toggleBookmark}
        onToggleLike={toggleLike}
        onArchiveImages={handleArchiveImages}
        onDelete={() => setDeleteConfirmOpen(true)}
        colorMode={colorMode}
        onToggleColorMode={() => setColorMode(colorMode === 'dark' ? 'light' : colorMode === 'light' ? 'system' : 'dark')}
      />

      {/* Inline Chat Panel */}
      {chatPosition === 'inline' && chat.open && (
        <ChatInlinePanel articleId={article.id} onClose={chat.close} />
      )}

      {/* Summary */}
      <ArticleSummarySection
        summary={summary}
        summarizing={summarizing}
        streamingText={streamingText}
        summaryHtml={summaryHtml}
        streamingHtml={streamingHtml}
        summarizeError={summarizeError}
        metricsText={metrics.metrics && !translating ? metrics.formatMetrics() : null}
      />

      {/* Similar articles */}
      {article.similar_count != null && article.similar_count > 0 && (
        <ArticleSimilarBanner articleId={article.id} similarCount={article.similar_count} />
      )}

      {/* Translate error */}
      {translateError && !translating && (
        <Callout variant="error">
          <p className="text-sm text-error">
            {tError(translateError)}
            {isKeyNotSetError(translateError) && (
              <>
                <Link to="/settings/integration" className="underline text-accent">{t('error.goToSettings')}</Link>
                {t('error.setApiKeyFromSettings')}
              </>
            )}
          </p>
        </Callout>
      )}

      {/* Translation metrics */}
      {metrics.metrics && !summarizing && !translating && hasTranslation && (
        <p className="text-xs text-muted mb-4">
          {metrics.formatMetrics()}
        </p>
      )}

      {/* Language banner */}
      {!isUserLang && hasTranslation && !translating && (
        <ArticleTranslationBanner
          viewMode={viewMode}
          onSetMode={setViewMode}
        />
      )}

      {/* Translation streaming callout */}
      {translating && translatingText && (
        <Callout>
          <SanitizedHTML html={translatingHtml} className="prose prose-sm" />
        </Callout>
      )}
      {translating && !translatingText && (
        <Callout>
          <Skeleton className="h-4 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2" />
        </Callout>
      )}

      {/* Content */}
      <ArticleContentBody displayContent={displayContent} />
      <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
    </article>
    {chatPosition === 'fab' && article && <ChatFab key={article.id} articleId={article.id} />}
    {showBackToTop && (
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className={`fixed right-6 z-50 w-12 h-12 rounded-full bg-accent text-accent-text flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity select-none ${
          chatPosition === 'fab'
            ? 'bottom-[calc(5rem+var(--safe-area-inset-bottom))]'
            : 'bottom-[calc(1.5rem+var(--safe-area-inset-bottom))]'
        }`}
        aria-label="Back to top"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 13V3M3 8l5-5 5 5" />
        </svg>
      </button>
    )}
    {deleteConfirmOpen && (
      <ConfirmDialog
        title={t('article.delete')}
        message={t('article.deleteConfirm')}
        confirmLabel={t('article.delete')}
        danger
        onConfirm={() => { setDeleteConfirmOpen(false); handleDelete() }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    )}
    </>
  )
}
