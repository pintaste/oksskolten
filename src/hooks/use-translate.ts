import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useStreamingAI } from './use-streaming-ai'
import type { useMetrics } from './use-metrics'
import type { Article } from '../../shared/types'

export type ViewMode = 'original' | 'translated' | 'immersive'

const STREAMING_OPTIONS = {
  endpoint: (id: number, force?: boolean) =>
    `/api/articles/${id}/translate?stream=1${force ? '&force=1' : ''}`,
} as const

export function useTranslate(
  article: Pick<Article, 'id' | 'full_text_translated'> | undefined,
  metrics: ReturnType<typeof useMetrics>,
) {
  const [viewMode, setViewMode] = useState<ViewMode>('original')
  const [fullTextTranslated, setFullTextTranslated] = useState<string | null>(null)

  const initializedIdRef = useRef<number | null>(null)
  useEffect(() => {
    if (article) {
      setFullTextTranslated(article.full_text_translated)
      if (initializedIdRef.current !== article.id) {
        initializedIdRef.current = article.id
        setViewMode(article.full_text_translated ? 'immersive' : 'original')
      }
    }
  }, [article])

  const options = useMemo(() => ({
    ...STREAMING_OPTIONS,
    onComplete: (text: string) => {
      setFullTextTranslated(text)
      setViewMode('immersive')
    },
  }), [])

  const { processing: translating, streamingText: translatingText, streamingHtml: translatingHtml, error, run } =
    useStreamingAI(article?.id, metrics, options)

  const handleTranslate = useCallback((force = false) => run(force), [run])

  return { viewMode, setViewMode, translating, translatingText, fullTextTranslated, handleTranslate, translatingHtml, error }
}
