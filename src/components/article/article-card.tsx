import { useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, ExternalLink, Circle, CheckCircle, Check } from 'lucide-react'
import { useI18n } from '../../lib/i18n'
import { isReadInSession } from '../../lib/readTracker'
import { extractDomain, articleUrlToPath } from '../../lib/url'
import { formatDate, formatRelativeDate } from '../../lib/dateFormat'
import type { ArticleListItem } from '../../../shared/types'
import type { LayoutName } from '../../data/layouts'

/** Strip HTML tags and common Markdown syntax from excerpt text for list display */
function stripMarkup(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')           // HTML tags
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold **...**
    .replace(/\*(.+?)\*/g, '$1')        // italic *...*
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url)
    .replace(/\\([[\]()#*_])/g, '$1')   // escaped chars
    .replace(/#{1,6}\s+/g, '')          // headings
    .replace(/\s+/g, ' ')              // collapse whitespace
    .trim()
}

export interface ArticleDisplayConfig {
  dateMode: 'relative' | 'absolute'
  indicatorStyle: 'dot' | 'line'
  showUnreadIndicator: boolean
  showThumbnails: boolean
}

interface ArticleCardProps extends ArticleDisplayConfig {
  article: ArticleListItem
  layout?: LayoutName
  isFeatured?: boolean
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void
  onToggleBookmark?: (article: ArticleListItem) => void
  onToggleRead?: (article: ArticleListItem) => void
  onOpenExternal?: (article: ArticleListItem) => void
  isSelectionMode?: boolean
  isSelected?: boolean
  onSelect?: (article: ArticleListItem) => void
  titleTranslated?: string
}

function Thumbnail({ src, className }: { src: string | null; articleUrl: string; className?: string }) {
  const [failed, setFailed] = useState(false)
  const sizeClass = className ?? 'w-16 h-16'
  if (!src || failed) return null
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={`${sizeClass} object-cover rounded shrink-0`}
      onError={() => setFailed(true)}
    />
  )
}

function LargeThumbnail({ src, articleUrl }: { src: string | null; articleUrl: string }) {
  const [failed, setFailed] = useState(false)

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className="w-full aspect-video object-cover rounded-t"
        onError={() => setFailed(true)}
      />
    )
  }

  // Fallback: favicon centered in placeholder
  const domain = extractDomain(articleUrl)
  return (
    <div className="w-full aspect-video rounded-t bg-bg-subtle border-b border-border flex items-center justify-center">
      {domain ? (
        <img
          src={`https://www.google.com/s2/favicons?sz=32&domain=${domain}`}
          alt=""
          loading="lazy"
          width={32}
          height={32}
        />
      ) : (
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted/30">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      )}
    </div>
  )
}

function CardActions({ article, isUnread, onToggleBookmark, onToggleRead, onOpenExternal }: {
  article: ArticleListItem
  isUnread: boolean
  onToggleBookmark?: (a: ArticleListItem) => void
  onToggleRead?: (a: ArticleListItem) => void
  onOpenExternal?: (a: ArticleListItem) => void
}) {
  const { t } = useI18n()
  if (!onToggleBookmark && !onToggleRead && !onOpenExternal) return null
  const stop = (e: React.MouseEvent, cb?: (a: ArticleListItem) => void) => {
    e.preventDefault(); e.stopPropagation(); cb?.(article)
  }
  const alwaysVisible = !!article.bookmarked_at
  return (
    <div className={`shrink-0 items-center gap-0.5 ${alwaysVisible ? 'flex' : 'hidden group-hover:flex'}`}>
      {onToggleRead && (
        <button
          type="button"
          title={isUnread ? t('articles.markRead') : t('articles.markUnread')}
          onClick={e => stop(e, onToggleRead)}
          className="p-1 rounded text-muted hover:text-accent hover:bg-hover transition-colors"
        >
          {isUnread ? <Circle size={14} /> : <CheckCircle size={14} />}
        </button>
      )}
      {onToggleBookmark && (
        <button
          type="button"
          title={t('article.addBookmark')}
          onClick={e => stop(e, onToggleBookmark)}
          className="p-1 rounded text-muted hover:text-accent hover:bg-hover transition-colors"
        >
          <Bookmark
            size={14}
            fill={article.bookmarked_at ? 'currentColor' : 'none'}
            className={article.bookmarked_at ? 'text-accent' : ''}
          />
        </button>
      )}
      {onOpenExternal && article.url && (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          title={t('articles.openExternal')}
          onClick={e => { e.stopPropagation(); onOpenExternal(article) }}
          className="p-1 rounded text-muted hover:text-accent hover:bg-hover transition-colors"
        >
          <ExternalLink size={14} />
        </a>
      )}
    </div>
  )
}

function useCardBase(article: ArticleListItem, dateMode: 'relative' | 'absolute', onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void) {
  const navigate = useNavigate()
  const { t, locale } = useI18n()
  const isUnread = article.seen_at == null && !isReadInSession(article.id)
  const domain = extractDomain(article.url)
  const dateText = dateMode === 'relative'
    ? formatRelativeDate(article.published_at, locale, { justNow: t('date.justNow') })
    : formatDate(article.published_at, locale)
  const href = articleUrlToPath(article.url)

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) { onClick(e); return }
    if (e.metaKey || e.ctrlKey || e.button === 1) return
    e.preventDefault()
    void navigate(href)
  }

  return { isUnread, domain, dateText, href, handleClick, originalUrl: article.url }
}

/** List layout — classic single-column (current default) */
function ListCard({ article, dateMode, indicatorStyle, showUnreadIndicator, onClick, onToggleBookmark, onToggleRead, onOpenExternal, isSelectionMode, isSelected, onSelect, titleTranslated }: ArticleCardProps) {
  const { t } = useI18n()
  const { isUnread, domain, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)
  const showIndicator = isUnread && showUnreadIndicator

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className={`article-card group block w-full text-left border-b border-border py-3 px-4 md:px-6 transition-[background-color,transform,box-shadow,border-color] duration-100 hover:bg-hover hover:-translate-y-px hover:shadow-sm select-none no-underline text-inherit ${
        indicatorStyle === 'line'
          ? `border-l-2 transition-[border-color] duration-500 ${showIndicator ? 'border-l-accent' : 'border-l-transparent'}`
          : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {onSelect && isSelectionMode && (
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect(article) }}
            className={`shrink-0 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-accent border-accent' : 'border-muted/40 bg-bg-card hover:border-accent'
            }`}
          >
            {isSelected && <Check size={11} className="text-accent-text" strokeWidth={3} />}
          </button>
        )}
        <div className="flex-1 min-w-0">
          <span
            className={`text-[15px] truncate transition-colors duration-500 block ${
              isUnread ? 'font-semibold text-text' : 'font-normal text-muted'
            }`}
          >
            {titleTranslated ?? article.title}
          </span>
          {titleTranslated && (
            <span className="text-[12px] text-muted truncate block">{article.title}</span>
          )}
          {article.excerpt && (
            <p className="text-[13px] text-muted truncate mt-0.5">
              {stripMarkup(article.excerpt)}
            </p>
          )}
          <div className="flex items-center gap-1 text-[12px] text-muted mt-1 whitespace-nowrap min-w-0">
            {domain && (
              <>
                <img
                  src={`https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                  alt=""
                  width={14}
                  height={14}
                  className="shrink-0"
                />
                <span className="truncate">{domain}</span>
                <span className="mx-0.5 shrink-0">·</span>
              </>
            )}
            <span className="shrink-0">{dateText}</span>
            {article.reading_time_mins != null && article.reading_time_mins > 0 && (
              <>
                <span className="mx-0.5 shrink-0">·</span>
                <span className="shrink-0">{t('articles.readingTime', { n: String(article.reading_time_mins) })}</span>
              </>
            )}
          </div>
        </div>
        <CardActions article={article} isUnread={isUnread} onToggleBookmark={onToggleBookmark} onToggleRead={onToggleRead} onOpenExternal={onOpenExternal} />
      </div>
    </a>
  )
}

/** Card layout — image-forward grid card */
function GridCard({ article, dateMode, showThumbnails, onClick, titleTranslated }: ArticleCardProps) {
  const { isUnread, domain, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className="article-card block border border-border rounded-lg overflow-hidden transition-[background-color,transform,box-shadow] duration-100 hover:bg-hover hover:-translate-y-px hover:shadow-sm select-none no-underline text-inherit"
    >
      {showThumbnails && <LargeThumbnail src={article.og_image} articleUrl={article.url} />}
      <div className="p-3 overflow-hidden">
        <span
          className={`text-[14px] line-clamp-2 break-words transition-colors duration-500 ${
            isUnread ? 'font-semibold text-text' : 'font-normal text-muted'
          }`}
        >
          {titleTranslated ?? article.title}
        </span>
        {titleTranslated && (
          <span className="text-[11px] text-muted line-clamp-1 block">{article.title}</span>
        )}
        {article.excerpt && (
          <p className="text-[12px] text-muted line-clamp-2 mt-1">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center gap-1 text-[11px] text-muted mt-2">
          {domain && (
            <>
              <img
                src={`https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                alt=""
                width={12}
                height={12}
                className="shrink-0"
              />
              <span className="truncate">{domain}</span>
              <span className="mx-0.5 shrink-0">·</span>
            </>
          )}
          <span className="shrink-0">{dateText}</span>
        </div>
      </div>
    </a>
  )
}

/** Magazine layout — hero card (large) */
function HeroCard({ article, dateMode, showThumbnails, onClick, titleTranslated }: ArticleCardProps) {
  const { isUnread, domain, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className="article-card block border border-border rounded-lg overflow-hidden transition-[background-color,transform,box-shadow] duration-100 hover:bg-hover hover:-translate-y-px hover:shadow-sm select-none no-underline text-inherit mb-4"
    >
      {showThumbnails && <LargeThumbnail src={article.og_image} articleUrl={article.url} />}
      <div className="p-4">
        <span
          className={`text-[18px] line-clamp-2 transition-colors duration-500 ${
            isUnread ? 'font-semibold text-text' : 'font-normal text-muted'
          }`}
        >
          {titleTranslated ?? article.title}
        </span>
        {titleTranslated && (
          <span className="text-[12px] text-muted line-clamp-1 block">{article.title}</span>
        )}
        {article.excerpt && (
          <p className="text-[14px] text-muted line-clamp-3 mt-1.5">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center gap-1 text-[12px] text-muted mt-2">
          {domain && (
            <>
              <img
                src={`https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                alt=""
                width={14}
                height={14}
                className="shrink-0"
              />
              <span>{domain}</span>
              <span className="mx-0.5">·</span>
            </>
          )}
          <span>{dateText}</span>
        </div>
      </div>
    </a>
  )
}

/** Magazine layout — small card (below hero) */
function SmallCard({ article, dateMode, showThumbnails, onClick, titleTranslated }: ArticleCardProps) {
  const { isUnread, domain, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className="article-card flex gap-3 border-b border-border py-2 px-4 md:px-6 transition-[background-color,transform,box-shadow] duration-100 hover:bg-hover hover:-translate-y-px hover:shadow-sm select-none no-underline text-inherit"
    >
      {showThumbnails && <Thumbnail src={article.og_image} articleUrl={article.url} className="w-12 h-12" />}
      <div className="flex-1 min-w-0">
        <span
          className={`text-[14px] truncate transition-colors duration-500 block ${
            isUnread ? 'font-semibold text-text' : 'font-normal text-muted'
          }`}
        >
          {titleTranslated ?? article.title}
        </span>
        {titleTranslated && (
          <span className="text-[11px] text-muted truncate block">{article.title}</span>
        )}
        {article.excerpt && (
          <p className="text-[12px] text-muted truncate mt-0.5">
            {article.excerpt}
          </p>
        )}
        <div className="flex items-center gap-1 text-[11px] text-muted mt-1 whitespace-nowrap min-w-0">
          {domain && (
            <>
              <img
                src={`https://www.google.com/s2/favicons?sz=16&domain=${domain}`}
                alt=""
                width={12}
                height={12}
                className="shrink-0"
              />
              <span className="truncate">{domain}</span>
              <span className="mx-0.5 shrink-0">·</span>
            </>
          )}
          <span className="shrink-0">{dateText}</span>
        </div>
      </div>
    </a>
  )
}

/** Compact layout — title and date only */
function CompactCard({ article, dateMode, indicatorStyle, showUnreadIndicator, onClick, onToggleBookmark, onToggleRead, onOpenExternal, isSelectionMode, isSelected, onSelect, titleTranslated }: ArticleCardProps) {
  const { isUnread, dateText, href, handleClick, originalUrl } = useCardBase(article, dateMode, onClick)
  const showIndicator = isUnread && showUnreadIndicator

  return (
    <a
      href={href}
      data-original-url={originalUrl}
      onClick={handleClick}
      className={`article-card group block w-full text-left border-b border-border py-1.5 px-4 md:px-6 transition-[background-color,border-color] duration-100 hover:bg-hover select-none no-underline text-inherit ${
        indicatorStyle === 'line'
          ? `border-l-2 transition-[border-color] duration-500 ${showIndicator ? 'border-l-accent' : 'border-l-transparent'}`
          : ''
      }`}
    >
      <div className="flex items-center gap-2">
        {onSelect && isSelectionMode && (
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); onSelect(article) }}
            className={`shrink-0 w-[16px] h-[16px] rounded border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-accent border-accent' : 'border-muted/40 bg-bg-card hover:border-accent'
            }`}
          >
            {isSelected && <Check size={9} className="text-accent-text" strokeWidth={3} />}
          </button>
        )}
        <span className="flex-1 min-w-0 flex flex-col">
          <span
            className={`text-[14px] truncate transition-colors duration-500 ${
              isUnread ? 'font-medium text-text' : 'font-normal text-muted'
            }`}
          >
            {titleTranslated ?? article.title}
          </span>
          {titleTranslated && (
            <span className="text-[11px] text-muted truncate">{article.title}</span>
          )}
        </span>
        <span className="text-[11px] text-muted shrink-0 ml-2">{dateText}</span>
        <CardActions article={article} isUnread={isUnread} onToggleBookmark={onToggleBookmark} onToggleRead={onToggleRead} onOpenExternal={onOpenExternal} />
      </div>
    </a>
  )
}

export const ArticleCard = memo(function ArticleCard(props: ArticleCardProps) {
  const { layout = 'list', isFeatured } = props

  switch (layout) {
    case 'card':
      return <GridCard {...props} />
    case 'magazine':
      return isFeatured ? <HeroCard {...props} /> : <SmallCard {...props} />
    case 'compact':
      return <CompactCard {...props} />
    case 'list':
    default:
      return <ListCard {...props} />
  }
})

export type { ArticleCardProps }
