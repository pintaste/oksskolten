import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher, apiPost, apiPatch } from '../../../../lib/fetcher'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Zap, RotateCcw, EyeOff } from 'lucide-react'
import { TFunc, CollapsibleCardWrapper, IconBtn, ProviderConnectionError, getProviderStatusText, getProviderConnectionFailedLabel } from './shared'

function VllmCard({
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
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/vllm',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['vllm.base_url'] || ''
  const isConfigured = keyStatus?.configured

  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)

  // Sync inputs with saved values on first load
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['vllm.base_url'] || '')
    setInitialized(true)
  }, [prefs, initialized])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleSave = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      const promises: Promise<any>[] = [
        apiPatch('/api/settings/preferences', { 'vllm.base_url': baseUrlInput || '' }),
      ]
      if (apiKeyInput) {
        promises.push(apiPost('/api/settings/api-keys/vllm', { apiKey: apiKeyInput }))
      }
      await Promise.all(promises)
      void mutatePrefs()
      void mutateKeyStatus()
      setApiKeyInput('')
      showMessage(t('vllm.baseUrlSaved'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, baseUrlInput, apiKeyInput, mutatePrefs, mutateKeyStatus, t])

  const handleDeleteKey = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await Promise.all([
        apiPost('/api/settings/api-keys/vllm', { apiKey: '' }),
        apiPatch('/api/settings/preferences', { 'vllm.base_url': '' }),
      ])
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      setBaseUrlInput('')
      setTestResult(null)
      showMessage(t('vllm.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, mutateKeyStatus, mutatePrefs, t])

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/vllm/status') as { ok: boolean; model_count?: number; error?: string }
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

  const hasChanges = baseUrlInput !== savedBaseUrl || !!apiKeyInput
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, 'vllm', !!isConfigured, testResult)

  return (
      <CollapsibleCardWrapper
        header={<>
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
          <span className="text-sm font-medium text-text">{t('provider.vllm')}</span>
          {statusText && <span className="text-xs text-muted truncate">{statusText}</span>}
        </>}
      actions={<>
        <IconBtn onClick={handleTest} disabled={testing}
          title={t('vllm.testConnection')}
          className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
          <Zap size={13} className={testing ? 'animate-pulse' : ''} />
        </IconBtn>
        {isConfigured && (
          <IconBtn onClick={handleDeleteKey} disabled={saving}
            title={t('chat.apiKeyDelete')} className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50">
            <RotateCcw size={13} />
          </IconBtn>
        )}
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider('vllm')}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField label={t('vllm.baseUrl')} hint={t('vllm.baseUrlDesc')} compact>
        <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('vllm.baseUrlPlaceholder')} className="py-1.5" />
      </FormField>
      <FormField label={t('chat.apiKey')} compact>
        <Input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : '...'} className="py-1.5" />
      </FormField>

      {hasChanges && (
        <div className="flex items-center gap-1.5">
          {hasChanges && (
            <button type="button" onClick={handleSave} disabled={saving}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0">
              {saving ? '...' : t('settings.save')}
            </button>
          )}
        </div>
      )}
      <ProviderConnectionError
        testResult={testResult}
        label={getProviderConnectionFailedLabel(t, 'vllm')}
      />

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>}
    </CollapsibleCardWrapper>
  )
}

export { VllmCard }
