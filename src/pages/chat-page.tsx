import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import useSWR, { mutate as globalMutate } from 'swr'
import { Trash2, ListChecks, Check } from 'lucide-react'
import { fetcher, apiDelete, apiPost } from '../lib/fetcher'
import { useI18n } from '../lib/i18n'
import { toast } from 'sonner'

const CHAT_UNDO_DURATION = 2000
const RING_R = 7, RING_CIRC = 2 * Math.PI * RING_R

function UndoChatToast({ id, message, onUndo, onExpire }: {
  id: string | number; message: string
  onUndo: () => void; onExpire: () => Promise<void>
}) {
  const { t } = useI18n()
  const circleRef = useRef<SVGCircleElement>(null)
  useEffect(() => {
    const start = Date.now(); let raf: number
    const tick = () => {
      const elapsed = Date.now() - start
      const p = Math.max(0, 1 - elapsed / CHAT_UNDO_DURATION)
      if (circleRef.current) circleRef.current.style.strokeDashoffset = String(RING_CIRC * (1 - p))
      if (elapsed < CHAT_UNDO_DURATION) raf = requestAnimationFrame(tick)
      else { toast.dismiss(id); void onExpire() }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [id, onExpire])
  return (
    <div className="flex items-center gap-3 w-full px-1 py-0.5 text-sm">
      <svg width="18" height="18" viewBox="0 0 18 18" className="shrink-0 -rotate-90">
        <circle cx="9" cy="9" r={RING_R} fill="none" strokeWidth="2" style={{ stroke: 'var(--color-border)' }} />
        <circle ref={circleRef} cx="9" cy="9" r={RING_R} fill="none" strokeWidth="2"
          strokeDasharray={RING_CIRC} strokeDashoffset={0} strokeLinecap="round"
          style={{ stroke: 'var(--color-accent)' }} />
      </svg>
      <span className="flex-1">{message}</span>
      <button type="button" onClick={() => { onUndo(); toast.dismiss(id) }}
        className="shrink-0 font-medium hover:underline" style={{ color: 'var(--color-accent)' }}>
        {t('toast.undo')}
      </button>
    </div>
  )
}
import { ChatPanel } from '../components/chat/chat-panel'
import { useDateMode } from '../hooks/use-date-mode'
import { formatDate, formatRelativeDate } from '../lib/dateFormat'
import { articleUrlToPath } from '../lib/url'

interface Conversation {
  id: string
  title: string | null
  article_id: number | null
  article_title: string | null
  article_url: string | null
  article_og_image: string | null
  first_user_message: string | null
  first_assistant_preview: string | null
  created_at: string
  updated_at: string
  message_count: number
}

function extractText(raw: string | null): string {
  if (!raw) return ''
  try {
    const blocks = JSON.parse(raw)
    if (Array.isArray(blocks)) {
      return blocks
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
        .join('')
    }
    return String(raw)
  } catch {
    return String(raw)
  }
}

export function ChatPage() {
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { conversationId } = useParams<{ conversationId?: string }>()
  const { dateMode } = useDateMode()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [selectionActive, setSelectionActive] = useState(false)
  const isSelectionMode = selectionActive || selectedIds.size > 0

  const { data } = useSWR<{ conversations: Conversation[] }>('/api/chat/conversations', fetcher)
  const conversations = data?.conversations ?? []

  const handleConversationCreated = useCallback((id: string) => {
    void navigate(`/chat/${id}`, { replace: true })
    void globalMutate('/api/chat/conversations')
  }, [navigate])

  const handleClearAll = useCallback(() => {
    const snapshot = conversations
    void globalMutate('/api/chat/conversations', { conversations: [] }, { revalidate: false })
    toast.custom((id) => (
      <UndoChatToast
        id={id}
        message={t('toast.clearedChat')}
        onUndo={() => globalMutate('/api/chat/conversations', { conversations: snapshot }, { revalidate: false })}
        onExpire={async () => {
          await apiDelete('/api/chat/all')
          void globalMutate('/api/chat/conversations')
        }}
      />
    ), { duration: Infinity })
  }, [conversations, t])

  const handleBatchDelete = useCallback(async () => {
    const ids = [...selectedIds]
    void globalMutate('/api/chat/conversations', (d: { conversations: Conversation[] } | undefined) => ({
      conversations: d?.conversations.filter(c => !ids.includes(c.id)) ?? [],
    }), { revalidate: false })
    setSelectedIds(new Set())
    setSelectionActive(false)
    await apiPost('/api/chat/batch-delete', { ids })
    void globalMutate('/api/chat/conversations')
  }, [selectedIds])

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

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Conversation detail view
  if (conversationId) {
    return (
      <div className="h-[calc(100dvh-var(--header-height))]">
        <ChatPanel
          key={conversationId}
          variant="full"
          conversationId={conversationId}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    )
  }

  // Conversation list view
  return (
    <div className="max-w-2xl mx-auto">
      {conversations.length > 0 && (
        <div
          className="flex items-center justify-between px-4 md:px-6 py-1 border-b border-border select-none"
          style={isSelectionMode ? { backgroundColor: 'color-mix(in srgb, var(--color-accent) 6%, var(--color-bg))' } : undefined}
        >
          {/* Left: count only */}
          <div className="flex items-center gap-3">
            {isSelectionMode ? (
              <span className="text-xs font-semibold text-text">{t('articles.selectedCount', { n: String(selectedIds.size) })}</span>
            ) : <span />}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1">
            {isSelectionMode ? (
              <>
                {selectedIds.size < conversations.length && (
                  <button type="button" onClick={() => setSelectedIds(new Set(conversations.map(c => c.id)))} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted hover:text-text hover:bg-hover transition-colors">
                    {t('articles.selectAll')}
                  </button>
                )}
                <button type="button" onClick={handleCancelSelection} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted hover:text-text hover:bg-hover transition-colors">
                  {t('articles.cancelSelection')}
                </button>
                <span className="text-border">|</span>
                <button type="button" onClick={handleBatchDelete} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded text-muted hover:text-text hover:bg-hover transition-colors">
                  <Trash2 size={13} />
                  {t('chat.batchDelete')}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={isSelectionMode ? handleCancelSelection : () => setSelectionActive(true)}
                  className={`inline-flex items-center gap-1 text-xs transition-colors ${isSelectionMode ? 'text-accent' : 'text-muted hover:text-accent'}`}
                >
                  <ListChecks size={13} />
                  {t('articles.multiSelect')}
                </button>
                <span className="text-border">|</span>
                <button type="button" onClick={handleClearAll} className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent transition-colors">
                  <Trash2 size={13} />
                  {t('chat.clearAll')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted select-none">
          <p className="text-sm">{t('chat.noConversations')}</p>
        </div>
      ) : (
        <div>
          {conversations.map(conv => {
            const dateText = dateMode === 'relative'
              ? formatRelativeDate(conv.updated_at, locale, { justNow: t('date.justNow') })
              : formatDate(conv.updated_at, locale)
            const isSelected = selectedIds.has(conv.id)
            return (
              <a
                key={conv.id}
                href={`/chat/${conv.id}`}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) return
                  e.preventDefault()
                  if (isSelectionMode) { toggleSelect(conv.id); return }
                  void navigate(`/chat/${conv.id}`)
                }}
                className={`block w-full text-left border-b border-border py-3 px-4 md:px-6 transition-[background-color] duration-100 hover:bg-hover select-none no-underline text-inherit ${isSelected ? 'bg-accent/5' : ''}`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  {isSelectionMode && (
                    <div className={`shrink-0 mt-0.5 w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-accent border-accent' : 'border-muted/40 bg-bg-card'}`}>
                      {isSelected && <Check size={11} className="text-accent-text" strokeWidth={3} />}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px] font-semibold text-text truncate">
                        {conv.title || extractText(conv.first_user_message) || t('chat.newChat')}
                      </span>
                      {conv.message_count > 0 && (
                        <span className="text-[11px] text-accent rounded-full px-1.5 leading-relaxed shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--color-accent) 15%, transparent)' }}>
                          {conv.message_count}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-muted truncate mt-0.5">
                      {extractText(conv.first_assistant_preview) || <span className="italic">{t('chat.noResponse')}</span>}
                    </p>
                    <div className="flex items-center gap-1 text-[12px] text-muted mt-1">
                      <span className="whitespace-nowrap shrink-0">{dateText}</span>
                      {conv.article_title && conv.article_url && (
                        <>
                          <span className="mx-0.5">·</span>
                          <Link
                            to={articleUrlToPath(conv.article_url)}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate hover:text-accent transition-colors"
                          >
                            {conv.article_title}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
