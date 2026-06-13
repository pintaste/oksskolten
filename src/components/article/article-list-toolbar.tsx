import type { ReactNode } from 'react'
import { CheckCheck, CheckSquare, ListChecks, ListFilter, List, Eye } from 'lucide-react'
import { useI18n } from '../../lib/i18n'

type ReadFilter = 'all' | 'unread' | 'read'

interface ArticleListToolbarProps {
  readFilter: ReadFilter
  onChangeReadFilter: (f: ReadFilter) => void
  showReadFilter: boolean
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
  readFilter,
  onChangeReadFilter,
  showReadFilter,
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
        </div>

        <div className="flex items-center gap-1">
          {selectedCount < totalCount && (
            <button
              type="button"
              onClick={onSelectAll}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted hover:text-text hover:bg-hover transition-colors"
            >
              {t('articles.selectAll')}
            </button>
          )}
          <button
            type="button"
            onClick={onCancelSelection}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted hover:text-text hover:bg-hover transition-colors"
          >
            {t('articles.cancelSelection')}
          </button>
          <span className="text-border">|</span>
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

  const nextFilter: ReadFilter = readFilter === 'all' ? 'unread' : readFilter === 'unread' ? 'read' : 'all'
  const filterConfig = {
    all:    { icon: <List size={13} />,       label: t('articles.showAll'),    active: false },
    unread: { icon: <ListFilter size={13} />, label: t('articles.unreadOnly'), active: true  },
    read:   { icon: <Eye size={13} />,        label: t('articles.readOnly'),   active: true  },
  }
  const fc = filterConfig[readFilter]

  return (
    <div className="flex items-center justify-between px-4 md:px-6 py-1 border-b border-border select-none">
      <div className="flex items-center gap-2">
        {showReadFilter && (
          <button
            type="button"
            onClick={() => onChangeReadFilter(nextFilter)}
            className={`inline-flex items-center gap-1 text-xs transition-colors ${
              fc.active ? 'text-accent font-medium' : 'text-muted hover:text-text'
            }`}
          >
            {fc.icon}
            {fc.label}
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
