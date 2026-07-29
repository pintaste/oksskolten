import { useState, useEffect, useRef, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher, apiPost, apiPatch } from '../../../../lib/fetcher'
import { PROVIDER_LABELS, LLM_API_PROVIDERS } from '../../../../data/aiModels'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { Zap, RotateCcw, EyeOff } from 'lucide-react'
import { TFunc, CollapsibleCardWrapper, IconBtn, ProviderConnectionError, getProviderStatusText, getProviderConnectionFailedLabel } from './shared'

interface ApiProviderCardProps {
  provider: string
  t: TFunc
  onHideProvider?: (provider: string) => void
  isHidable?: boolean
}

export function ApiProviderCard({ provider, t, onHideProvider, isHidable }: ApiProviderCardProps) {
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    `/api/settings/api-keys/${provider}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )

  const isLlmProvider = (LLM_API_PROVIDERS as readonly string[]).includes(provider)
  const savedBaseUrl = prefs?.[`${provider}.base_url`] || ''
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
    setBaseUrlInput(prefs[`${provider}.base_url`] || '')
    setInitialized(true)
  }, [prefs, initialized, provider])

  // Auto-test on first load when configured
  const autoTested = useRef(false)
  useEffect(() => {
    if (autoTested.current || isConfigured === undefined) return
    if (!isConfigured) return
    autoTested.current = true
    void handleTest()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured])

  function showMessage(text: string, type: 'success' | 'error') {
    setMessage({ text, type })
    setTimeout(() => setMessage(null), 3000)
  }

  const endpoint = `/api/settings/api-keys/${provider}`
  const savedMsg = provider === 'gemini' ? t('gemini.apiKeySaved')
    : provider === 'openai' ? t('openai.apiKeySaved')
    : provider === 'google-translate' ? t('googleTranslate.apiKeySaved')
    : provider === 'deepl' ? t('deepl.apiKeySaved')
    : t('chat.apiKeySaved')
  const deletedMsg = provider === 'gemini' ? t('gemini.apiKeyDeleted')
    : provider === 'openai' ? t('openai.apiKeyDeleted')
    : provider === 'google-translate' ? t('googleTranslate.apiKeyDeleted')
    : provider === 'deepl' ? t('deepl.apiKeyDeleted')
    : t('chat.apiKeyDeleted')
  const placeholder = provider === 'gemini' ? 'AIza...'
    : provider === 'openai' ? 'sk-...'
    : provider === 'google-translate' ? 'AIza...'
    : provider === 'deepl' ? '...'
    : 'sk-ant-...'
  const apiKeyHelpLink = provider === 'google-translate'
    ? { href: 'https://cloud.google.com/translate/docs/setup', label: t('googleTranslate.getApiKey') }
    : provider === 'deepl'
      ? { href: 'https://www.deepl.com/en/account/summary', label: t('deepl.getApiKey') }
      : null

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const promises: Promise<any>[] = []
      if (apiKeyInput) {
        promises.push(apiPost(endpoint, { apiKey: apiKeyInput }))
      }
      if (isLlmProvider && baseUrlInput !== savedBaseUrl) {
        promises.push(apiPatch('/api/settings/preferences', { [`${provider}.base_url`]: baseUrlInput || '' }))
      }
      await Promise.all(promises)
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      showMessage(savedMsg, 'success')
      // auto-test after saving
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
        apiPost(endpoint, { apiKey: '' }),
        isLlmProvider ? apiPatch('/api/settings/preferences', { [`${provider}.base_url`]: '' }) : Promise.resolve(),
      ])
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      setBaseUrlInput('')
      setTestResult(null)
      showMessage(deletedMsg, 'success')
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
      const res = await fetcher(`/api/settings/${provider}/status`) as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing, provider])

  const hasChanges = !!apiKeyInput || (isLlmProvider && baseUrlInput !== savedBaseUrl)
  const dotClass = hasChanges ? 'bg-error' : testResult?.ok ? 'bg-success' : testResult ? 'bg-error' : 'bg-muted'
  const statusText = getProviderStatusText(t, provider, !!isConfigured, testResult)

  return (
    <CollapsibleCardWrapper
      header={<>
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="text-sm font-medium text-text">{t(PROVIDER_LABELS[provider])}</span>
        <span className="text-xs text-muted truncate">{statusText}</span>
      </>}
      actions={<>
        {isConfigured && (
          <IconBtn onClick={handleTest} disabled={testing}
            title={t('ollama.testConnection')}
            className="p-1 text-muted hover:text-text transition-colors disabled:opacity-50">
            <Zap size={13} className={testing ? 'animate-pulse' : ''} />
          </IconBtn>
        )}
        {isConfigured && (
          <IconBtn onClick={handleDelete} disabled={saving}
            title={t('chat.apiKeyDelete')} className="p-1 text-muted/60 hover:text-error transition-colors disabled:opacity-50">
            <RotateCcw size={13} />
          </IconBtn>
        )}
        {isHidable && onHideProvider && (
          <IconBtn onClick={() => onHideProvider(provider)}
            title={t('integration.removeProvider')}
            className="p-1 text-muted/60 hover:text-muted transition-colors">
            <EyeOff size={13} />
          </IconBtn>
        )}
      </>}
    >
      <FormField
        label={
          <span className="flex items-center w-full gap-2">
            <span className="truncate">{t('chat.apiKey')}</span>
            {apiKeyHelpLink && (
              <a
                href={apiKeyHelpLink.href}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-accent hover:underline"
              >
                {apiKeyHelpLink.label}
              </a>
            )}
          </span>
        }
        compact
      >
        <Input
          type="password"
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : placeholder}
          className="py-1.5"
        />
      </FormField>

      {isLlmProvider && (
        <FormField label={<span>{t('anthropic.baseUrl')} <span className="font-normal text-muted/70">({t('anthropic.baseUrlDesc')})</span></span>} compact>
          <Input type="text" value={baseUrlInput} onChange={e => setBaseUrlInput(e.target.value)}
            placeholder={t('anthropic.baseUrlPlaceholder')} className="py-1.5" />
        </FormField>
      )}

      <div className="flex items-center gap-1.5">
        {hasChanges && (
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0">
            {saving ? '...' : t('settings.save')}
          </button>
        )}
        <ProviderConnectionError
          testResult={testResult}
          label={getProviderConnectionFailedLabel(t, provider)}
          as="span"
        />
      </div>

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>{message.text}</p>
      )}
    </CollapsibleCardWrapper>
  )
}
