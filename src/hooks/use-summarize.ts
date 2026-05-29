import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { renderMarkdown } from '../lib/markdown'
import { sanitizeHtml } from '../lib/sanitize'
import { useStreamingAI } from './use-streaming-ai'
import type { useMetrics } from './use-metrics'
import type { Article } from '../../shared/types'

const STREAMING_OPTIONS = {
  endpoint: (id: number) => `/api/articles/${id}/summarize?stream=1`,
  fixUnclosedBold: true,
} as const

export function useSummarize(
  article: Pick<Article, 'id' | 'summary'> | undefined,
  metrics: ReturnType<typeof useMetrics>,
  autoRun = false,
) {
  const [summary, setSummary] = useState<string | null>(() => article?.summary ?? null)
  const autoRunRef = useRef<number | null>(null)

  useEffect(() => {
    if (article) setSummary(article.summary)
  }, [article])

  const options = useMemo(() => ({
    ...STREAMING_OPTIONS,
    onComplete: (text: string) => setSummary(text),
  }), [])

  const { processing: summarizing, streamingText, streamingHtml, error, run } =
    useStreamingAI(article?.id, metrics, options)

  const handleSummarize = useCallback(() => run(), [run])

  useEffect(() => {
    if (!autoRun || !article?.id || summary !== null || article.summary !== null) return
    if (autoRunRef.current === article.id) return
    autoRunRef.current = article.id
    void handleSummarize()
  }, [autoRun, article?.id, summary, handleSummarize])

  const summaryHtml = useMemo(() => {
    if (!summary) return ''
    const html = renderMarkdown(summary)
    return sanitizeHtml(html)
  }, [summary])

  return { summary, summarizing, streamingText, handleSummarize, summaryHtml, streamingHtml, error }
}
