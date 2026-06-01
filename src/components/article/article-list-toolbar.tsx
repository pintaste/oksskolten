import type { ReactNode } from 'react'
import { CheckCheck, CheckSquare, ListChecks, ListFilter, List } from 'lucide-react'
import { useI18n } from '../../lib/i18n'

interface FeedStats {
  unreadCount: number
  totalCount: number
}

interface ArticleListToolbarProps {
  feedStats?: FeedStats
  unreadFilter: boolean
  onToggleUnreadFilter: () => void
  showUnreadFilter: boolean
  onMarkAllRead: () => void
  hasUnread: boolean
  selectedCount: number
  totalCount: number
  onBatchAction?: () => void
  batchActionLabel?: string
  batchActionIcon?: ReactNode
  onBatchMarkRead?: () => void
  onBatchMarkUnread?: () => void
  onSelectAll: () => void
  onCancelSelection: () => void
  isSelectionMode: boolean
  onEnterSelectionMode: () => void
  onClearAction?: () => void
  clearActionLabel?: string
  clearActionIcon?: ReactNode
}

export function ArticleListToolbar({
  feedStats,
  unreadFilter,
  onToggleUnreadFilter,
  showUnreadFilter,
  onMarkAllRead,
  hasUnread,
  selectedCount,
  totalCount,
  onBatchAction,
  batchActionLabel,
  batchActionIcon,
  onBatchMarkRead,
  onBatchMarkUnread,
  onSelectAll,
  onCancelSelection,
  isSelectionMode,
  onEnterSelectionMode,
  onClearAction,
  clearActionLabel,
  clearActionIcon,
}: ArticleListToolbarProps) {
  const { t } = useI18n()

  if (isSelectionMode) {
    return (
      <div
        className="flex items-center justify-between px-4 md:px-6 py-1.5 border-b border-border select-none"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 6%, var(--color-bg))' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-text">
            {t('articles.selectedCount', { n: String(selectedCount) })}
          </span>
          <button
            type="button"
            onClick={onCancelSelection}
            className="text-xs text-muted hover:text-text transition-colors"
          >
            {t('articles.cancelSelection')}
          </button>
          {selectedCount < totalCount && (
            <button
              type="button"
              onClick={onSelectAll}
              className="text-xs text-muted hover:text-text transition-colors"
            >
              {t('articles.selectAll')}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {onBatchAction && batchActionLabel ? (
            <button
              type="button"
              onClick={onBatchAction}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted hover:text-text hover:bg-hover transition-colors"
            >
              {batchActionIcon}
              {batchActionLabel}
            </button>
          ) : (
            <>
              {onBatchMarkRead && (
                <button
                  type="button"
                  onClick={onBatchMarkRead}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted hover:text-text hover:bg-hover transition-colors"
                >
                  <CheckCheck size={13} />
                  {t('articles.markRead')}
                </button>
              )}
              {onBatchMarkUnread && (
                <button
                  type="button"
                  onClick={onBatchMarkUnread}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted hover:text-text hover:bg-hover transition-colors"
                >
                  <CheckSquare size={13} />
                  {t('articles.markUnread')}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // Build filter button label: with counts when feedStats available
  const filterLabel = showUnreadFilter
    ? unreadFilter
      ? feedStats ? `${t('articles.showAll')} ${feedStats.totalCount}` : t('articles.showAll')
      : feedStats ? `${t('articles.unreadOnly')} ${feedStats.unreadCount}/${feedStats.totalCount}` : t('articles.unreadOnly')
    : null

  return (
    <div className="flex items-center justify-between px-4 md:px-6 py-1 border-b border-border select-none">
      <div className="flex items-center gap-2">
        {filterLabel !== null && (
          <button
            type="button"
            onClick={onToggleUnreadFilter}
            className={`inline-flex items-center gap-1 text-xs transition-colors ${
              unreadFilter ? 'text-accent font-medium' : 'text-muted hover:text-text'
            }`}
          >
            {unreadFilter ? <List size={13} /> : <ListFilter size={13} />}
            {filterLabel}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={isSelectionMode ? onCancelSelection : onEnterSelectionMode}
          className={`inline-flex items-center gap-1 text-xs transition-colors ${isSelectionMode ? 'text-accent' : 'text-muted hover:text-accent'}`}
        >
          <ListChecks size={13} />
          {t('articles.multiSelect')}
        </button>
        <span className="text-border">|</span>
        {onClearAction && clearActionLabel ? (
          <button
            type="button"
            onClick={onClearAction}
            className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors"
          >
            {clearActionIcon}
            {clearActionLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={!hasUnread}
            className={`inline-flex items-center gap-1 text-xs transition-colors ${
              hasUnread ? 'text-muted hover:text-accent' : 'text-muted/40 cursor-not-allowed'
            }`}
          >
            <CheckCheck size={13} />
            {t('articles.markAllRead')}
          </button>
        )}
      </div>
    </div>
  )
}
