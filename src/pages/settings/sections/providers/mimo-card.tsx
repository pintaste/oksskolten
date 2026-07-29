import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher, apiPost, apiPatch } from '../../../../lib/fetcher'
import { PROVIDER_LABELS } from '../../../../data/aiModels'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Zap, RotateCcw, EyeOff } from 'lucide-react'
import { TFunc, CollapsibleCardWrapper, IconBtn, ProviderConnectionError, getProviderStatusText, getProviderConnectionFailedLabel } from './shared'

function MimoCard({
  t,
  onHideProvider,
  isHidable,
}: {
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}) {
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/mimo',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['mimo.base_url'] || ''
  const isConfigured = keyStatus?.configured

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)


  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['mimo.base_url'] || '')
    setInitialized(true)
  }, [prefs, initialized])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const promises: Promise<any>[] = []
      if (apiKeyInput) {
        promises.push(apiPost('/api/settings/api-keys/mimo', { apiKey: apiKeyInput }))
      }
      if (baseUrlInput !== savedBaseUrl) {
        promises.push(apiPatch('/api/settings/preferences', { 'mimo.base_url': baseUrlInput || '' }))
      }
      await Promise.all(promises)
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      showMessage(t('mimo.apiKeySaved'), 'success')
      void handleTest()
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (saving) return
    setSaving(true)
    try {
      await Promise.all([
        apiPost('/api/settings/api-keys/mimo', { apiKey: '' }),
        apiPatch('/api/settings/preferences', { 'mimo.base_url': '' }),
      ])
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      setBaseUrlInput('')
      setTestResult(null)
      showMessage(t('mimo.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/mimo/status') as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current || isConfigured === undefined) return
    if (!isConfigured) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured])

  const hasChanges = !!apiKeyInput || baseUrlInput !== savedBaseUrl
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, 'mimo', !!isConfigured, testResult)

  return (
    <CollapsibleCardWrapper
      header={<>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-sm font-medium text-text">{t(PROVIDER_LABELS['mimo'])}</span>
        <span className="text-xs text-muted truncate">{statusText}</span>
      </>}
      actions={<>
        <IconBtn onClick={handleTest} disabled={testing}
          title={t('mimo.testConnection')}
          className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
          <Zap size={13} className={testing ? 'animate-pulse' : ''} />
        </IconBtn>
        {isConfigured && (
          <IconBtn onClick={handleDelete} disabled={saving}
            title={t('chat.apiKeyDelete')} className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50">
            <RotateCcw size={13} />
          </IconBtn>
        )}
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider('mimo')}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField label={t('chat.apiKey')} compact>
        <Input type="password" value={apiKeyInput} onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : '...'} className="py-1.5" />
      </FormField>

      <FormField label={<span>{t('anthropic.baseUrl')} <span className="font-normal text-muted/70">({t('anthropic.baseUrlDesc')})</span></span>} compact>
        <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('anthropic.baseUrlPlaceholder')} className="py-1.5" />
      </FormField>

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
        label={getProviderConnectionFailedLabel(t, 'mimo')}
        as="span"
      />

      {message && <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>}
    </CollapsibleCardWrapper>
  )
}

export { MimoCard }
