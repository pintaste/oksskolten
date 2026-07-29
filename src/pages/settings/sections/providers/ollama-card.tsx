import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher, apiPatch } from '../../../../lib/fetcher'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Zap, EyeOff } from 'lucide-react'
import { TFunc, CollapsibleCardWrapper, IconBtn, ProviderConnectionError, getProviderStatusText, getProviderConnectionFailedLabel } from './shared'

function OllamaCard({
  t,
  onHideProvider,
  isHidable,
}: {
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}) {
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )
  const savedBaseUrl = prefs?.['ollama.base_url'] || ''
  const savedHeadersJson = prefs?.['ollama.custom_headers'] || ''
  const isConfigured = !!savedBaseUrl || !!savedHeadersJson
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string; model_count?: number; error?: string } | null>(null)

  // Custom headers state
  const [headers, setHeaders] = useState<Array<{ key: string; value: string }>>([])

  // Sync inputs with saved values on first load
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['ollama.base_url'] || '')
    const headersRaw = prefs['ollama.custom_headers'] || ''
    if (headersRaw) {
      try {
        const parsed = JSON.parse(headersRaw)
        setHeaders(Object.entries(parsed).map(([key, value]) => ({ key, value: String(value) })))
      } catch { /* ignore invalid JSON */ }
    }
    setInitialized(true)
  }, [prefs, initialized])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  function headersToJson(h: Array<{ key: string; value: string }>): string {
    if (h.length === 0) return ''
    const obj: Record<string, string> = {}
    for (const { key, value } of h) { if (key) obj[key] = value }
    return JSON.stringify(obj)
  }

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await apiPatch('/api/settings/preferences', {
        'ollama.base_url': baseUrlInput || '',
        'ollama.custom_headers': headersToJson(headers),
      })
      void mutatePrefs()
      showMessage(t('ollama.baseUrlSaved'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, baseUrlInput, headers, mutatePrefs, t])

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/ollama/status') as { ok: boolean; version?: string; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const removeHeader = useCallback((index: number) => {
    setHeaders(prev => prev.filter((_, i) => i !== index))
  }, [])

  const currentHeadersJson = headersToJson(headers)
  const hasChanges = baseUrlInput !== savedBaseUrl || currentHeadersJson !== (savedHeadersJson || '')
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, 'ollama', isConfigured, testResult)

  return (
      <CollapsibleCardWrapper
        header={<>
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
          <span className="text-sm font-medium text-text">{t('provider.ollama')}</span>
          {statusText && <span className="text-xs text-muted truncate">{statusText}</span>}
        </>}
      actions={<>
        <IconBtn onClick={handleTest} disabled={testing}
          title={t('ollama.testConnection')}
          className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
          <Zap size={13} className={testing ? 'animate-pulse' : ''} />
        </IconBtn>
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider('ollama')}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField label={t('ollama.baseUrl')} hint={t('ollama.baseUrlDesc')} compact>
        <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('ollama.baseUrlPlaceholder')} className="py-1.5" />
      </FormField>

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-text select-none">{t('ollama.customHeaders')}</span>
          <span className="text-[11px] text-muted select-none">{t('ollama.customHeadersDesc')}</span>
        </div>
        {headers.map((h, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1">
            <Input type="text" value={h.key}
              onChange={e => setHeaders(prev => prev.map((item, j) => j === i ? { ...item, key: e.target.value } : item))}
              placeholder={t('ollama.headerKey')} className="w-[200px] py-1 text-xs" />
            <Input type="text" value={h.value}
              onChange={e => setHeaders(prev => prev.map((item, j) => j === i ? { ...item, value: e.target.value } : item))}
              placeholder={t('ollama.headerValue')} className="flex-1 py-1 text-xs" />
            <button type="button" onClick={() => removeHeader(i)}
              className="px-1.5 py-1 text-xs text-muted hover:text-error transition-colors select-none shrink-0">×</button>
          </div>
        ))}
        <button type="button" onClick={() => setHeaders(prev => [...prev, { key: '', value: '' }])}
          className="px-2 py-1 text-xs rounded border border-border text-muted hover:text-text hover:bg-hover transition-colors select-none">
          + {t('ollama.addHeader')}
        </button>
      </div>

      {hasChanges && (
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0">
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      )}
      <ProviderConnectionError
        testResult={testResult}
        label={getProviderConnectionFailedLabel(t, 'ollama')}
      />

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>}
    </CollapsibleCardWrapper>
  )
}

export { OllamaCard }
