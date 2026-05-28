import { useState, useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { fetcher, apiPost, apiPatch } from '../../../lib/fetcher'
import { PROVIDER_LABELS, LLM_API_PROVIDERS, TRANSLATE_SERVICE_PROVIDERS } from '../../../data/aiModels'
import { Input } from '@/components/ui/input'
import { FormField } from '@/components/ui/form-field'
import { ExternalLink, CircleDot, CircleCheck, CircleSlash, ChevronDown } from 'lucide-react'
import type { Settings } from '../../../hooks/use-settings'

type TFunc = (key: any, params?: Record<string, string>) => string

export function ProviderConfigSection({ t, settings }: { t: TFunc; settings: Settings }) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('integration.llmProviderConfig')}</h2>
        <p className="text-xs text-muted mb-4">{t('integration.llmProviderConfigDesc')}</p>
        <div className="space-y-3">
          {LLM_API_PROVIDERS.filter(p => p !== 'deepseek' && p !== 'mimo' && p !== 'anthropic').map(provider => (
            <ApiProviderCard key={provider} provider={provider} t={t} />
          ))}
          <AnthropicCard t={t} />
          <DeepSeekCard t={t} />
          <MimoCard t={t} />
          <ClaudeCodeCard t={t} />
          <OllamaCard t={t} />
          <VllmCard t={t} />
          <CustomCard t={t} />
        </div>
      </div>
      <div>
        <h2 className="text-base font-semibold text-text mb-1">{t('integration.translateServiceConfig')}</h2>
        <p className="text-xs text-muted mb-4">{t('integration.translateServiceConfigDesc')}</p>
        <div className="space-y-3">
          {TRANSLATE_SERVICE_PROVIDERS.map(provider => (
            <ApiProviderCard key={provider} provider={provider} t={t} />
          ))}
        </div>
        <div className="mt-4">
          <h3 className="text-sm font-medium text-text mb-1">{t('settings.translateTargetLang')}</h3>
          <p className="text-xs text-muted mb-3">{t('settings.translateTargetLangDesc')}</p>
          <div className="flex rounded-md bg-bg-subtle p-0.5">
            {([
              { value: '', label: t('settings.translateTargetLangAuto') },
              { value: 'ja', label: t('settings.languageJa') },
              { value: 'en', label: t('settings.languageEn') },
            ] as const).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => settings.setTranslateTargetLang(opt.value)}
                className={`flex-1 px-2 py-1.5 text-xs rounded transition-colors select-none ${
                  (settings.translateTargetLang || '') === opt.value
                    ? 'bg-accent text-accent-text font-medium shadow-sm'
                    : 'text-muted hover:text-text'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function ApiProviderCard({ provider, t }: { provider: string; t: TFunc }) {
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
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs[`${provider}.base_url`] || '')
    setInitialized(true)
  }, [prefs, initialized, provider])

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
      await apiPost(endpoint, { apiKey: '' })
      void mutateKeyStatus()
      setApiKeyInput('')
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

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2 min-h-[3rem]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isConfigured ? 'bg-success' : 'bg-error'}`} />
          <span className="text-sm font-medium text-text select-none">{t(PROVIDER_LABELS[provider])}</span>
          <span className="text-xs text-muted select-none">
            {isConfigured ? t('chat.apiKeyConfigured') : t('chat.apiKeyNotSet')}
          </span>
        </div>
        {isConfigured && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-3 py-1 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
          >
            {t('chat.apiKeyDelete')}
          </button>
        )}
      </div>

      {!isConfigured && (
        <FormField label={t('chat.apiKey')} compact>
          <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder={placeholder}
            className="flex-1 py-1.5"
          />
          </div>
        </FormField>
      )}

      {isConfigured && (
        <FormField label={t('chat.apiKey')} compact>
          <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="••••••••"
            className="flex-1 py-1.5"
          />
          </div>
        </FormField>
      )}

      {isLlmProvider && (
        <div>
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-text transition-colors select-none"
          >
            <ChevronDown size={12} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
            {t('anthropic.advanced')}
          </button>
          {advancedOpen && (
            <div className="mt-1.5">
              <FormField label={t('anthropic.baseUrl')} hint={t('anthropic.baseUrlDesc')} compact>
                <Input
                  type="text"
                  value={baseUrlInput}
                  onChange={e => setBaseUrlInput(e.target.value)}
                  placeholder={t('anthropic.baseUrlPlaceholder')}
                  className="py-1.5"
                />
              </FormField>
            </div>
          )}
        </div>
      )}

      {(hasChanges || isConfigured) && (
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0"
            >
              {saving ? '...' : t('settings.save')}
            </button>
          )}
          {isConfigured && (
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
            >
              {testing ? t('ollama.testing') : t('ollama.testConnection')}
            </button>
          )}
          {testResult && (
            <span className={`text-xs ${testResult.ok ? 'text-accent' : 'text-error'}`}>
              {testResult.ok
                ? t('ollama.connected')
                : `${t('ollama.connectionFailed')}: ${testResult.error}`}
            </span>
          )}
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

function ClaudeCodeCard({ t }: { t: TFunc }) {
  const { data: authStatus } = useSWR<{ loggedIn?: boolean; email?: string; plan?: string; error?: string }>(
    '/api/chat/claude-code-status',
    fetcher,
    { revalidateOnFocus: false },
  )

  let statusDot = 'bg-error'
  let statusText: React.ReactNode = '...'

  if (authStatus !== undefined) {
    if (authStatus.error?.includes('not found')) {
      statusDot = 'bg-error'
      statusText = t('chat.authNotInstalled')
    } else if (authStatus.loggedIn) {
      statusDot = 'bg-success'
      statusText = (
        <>
          {t('chat.authConnected')}
          {authStatus.email && <span className="text-muted ml-1.5">({authStatus.email})</span>}
        </>
      )
    } else {
      statusDot = 'bg-warning'
      statusText = (
        <div>
          <span>{t('chat.authNotConnected')}</span>
          <p className="text-muted mt-0.5">{t('chat.authRunLogin')}</p>
        </div>
      )
    }
  }

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border min-h-[3rem] space-y-2">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusDot}`} />
        <span className="text-sm font-medium text-text select-none">{t(PROVIDER_LABELS['claude-code'])}</span>
        <span className="text-xs text-muted select-none">{statusText}</span>
      </div>
      <div className="rounded-md bg-bg-subtle px-3 py-2 text-xs text-muted select-none">
        <p>{t('chat.authNote')}</p>
        <div className="mt-1.5 space-y-0.5 text-[11px] text-muted/70">
          <div className="flex gap-1">
            <span className="w-[5.5em] shrink-0">{t('chat.authHowToLoginLabel')}</span>
            <code>claude auth login</code>
          </div>
          <div className="flex gap-1">
            <span className="w-[5.5em] shrink-0">{t('chat.authHowToLogoutLabel')}</span>
            <code>claude auth logout</code>
          </div>
        </div>
        <details className="mt-1.5">
          <summary className="text-[11px] text-muted/70 cursor-pointer select-none hover:text-muted">
            {t('chat.authNoteIssue')}
          </summary>
          <div className="mt-1 ml-3 space-y-0.5 text-[11px] text-muted/70">
            {([
              { id: 228, title: 'OAuth 2.0 Device Authorization Grant', status: 'not_planned' },
              { id: 7100, title: 'Headless/Remote Authentication', status: 'not_planned' },
              { id: 22992, title: 'Device Code Flow (RFC 8628)', status: 'open' },
              { id: 33269, title: 'OAuth login fails due to Cloudflare race condition', status: 'open' },
              { id: 34575, title: 'MCP connector sync + setup-token', status: 'open' },
            ] as { id: number; title: string; status: 'open' | 'completed' | 'not_planned' }[]).map(({ id, title, status }) => (
              <a
                key={id}
                href={`https://github.com/anthropics/claude-code/issues/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 pl-2 hover:text-muted underline"
              >
                {status === 'open' && <CircleDot size={10} className="shrink-0 text-success" />}
                {status === 'completed' && <CircleCheck size={10} className="shrink-0 text-purple-500" />}
                {status === 'not_planned' && <CircleSlash size={10} className="shrink-0 text-muted/50" />}
                <span className="tabular-nums w-[6ch] shrink-0">#{id}</span>
                <span>{title}</span>
                <ExternalLink size={10} className="shrink-0" />
              </a>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}

function OllamaCard({ t }: { t: TFunc }) {
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )
  const savedBaseUrl = prefs?.['ollama.base_url'] || ''
  const savedHeadersJson = prefs?.['ollama.custom_headers'] || ''
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

  const removeHeader = useCallback((index: number) => {
    setHeaders(prev => prev.filter((_, i) => i !== index))
  }, [])

  const currentHeadersJson = headersToJson(headers)
  const hasChanges = baseUrlInput !== savedBaseUrl || currentHeadersJson !== (savedHeadersJson || '')

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border min-h-[3rem] space-y-2">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${testResult?.ok ? 'bg-success' : savedBaseUrl ? 'bg-warning' : 'bg-muted'}`} />
        <span className="text-sm font-medium text-text select-none">{t('provider.ollama')}</span>
      </div>

      <FormField label={t('ollama.baseUrl')} hint={t('ollama.baseUrlDesc')} compact>
        <Input
          type="text"
          value={baseUrlInput}
          onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('ollama.baseUrlPlaceholder')}
          className="py-1.5"
        />
      </FormField>

      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <span className="text-xs font-medium text-text select-none">{t('ollama.customHeaders')}</span>
          <span className="text-[11px] text-muted select-none">{t('ollama.customHeadersDesc')}</span>
        </div>

        {headers.map((h, i) => (
          <div key={i} className="flex items-center gap-1.5 mb-1">
            <Input
              type="text"
              value={h.key}
              onChange={e => setHeaders(prev => prev.map((item, j) => j === i ? { ...item, key: e.target.value } : item))}
              placeholder={t('ollama.headerKey')}
              className="w-[200px] py-1 text-xs"
            />
            <Input
              type="text"
              value={h.value}
              onChange={e => setHeaders(prev => prev.map((item, j) => j === i ? { ...item, value: e.target.value } : item))}
              placeholder={t('ollama.headerValue')}
              className="flex-1 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => removeHeader(i)}
              className="px-1.5 py-1 text-xs text-muted hover:text-error transition-colors select-none shrink-0"
            >
              ×
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setHeaders(prev => [...prev, { key: '', value: '' }])}
          className="px-2 py-1 text-xs rounded border border-border text-muted hover:text-text hover:bg-hover transition-colors select-none"
        >
          + {t('ollama.addHeader')}
        </button>
      </div>

      <div className="flex items-center gap-2">
        {hasChanges && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0"
          >
            {saving ? '...' : t('settings.save')}
          </button>
        )}
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
        >
          {testing ? t('ollama.testing') : t('ollama.testConnection')}
        </button>
        {testResult && (
          <span className={`text-xs ${testResult.ok ? 'text-accent' : 'text-error'}`}>
            {testResult.ok
              ? `${t('ollama.connected')} (v${testResult.version}, ${testResult.model_count} models)`
              : `${t('ollama.connectionFailed')}: ${testResult.error}`}
          </span>
        )}
      </div>

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

function VllmCard({ t }: { t: TFunc }) {
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
      await apiPost('/api/settings/api-keys/vllm', { apiKey: '' })
      void mutateKeyStatus()
      showMessage(t('vllm.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, mutateKeyStatus, t])

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

  const hasChanges = baseUrlInput !== savedBaseUrl || !!apiKeyInput

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border min-h-[3rem] space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${testResult?.ok ? 'bg-success' : savedBaseUrl ? 'bg-warning' : 'bg-muted'}`} />
          <span className="text-sm font-medium text-text select-none">{t('provider.vllm')}</span>
        </div>
        {isConfigured && (
          <button
            type="button"
            onClick={handleDeleteKey}
            disabled={saving}
            className="px-3 py-1 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
          >
            {t('chat.apiKeyDelete')}
          </button>
        )}
      </div>

      <FormField label={t('vllm.baseUrl')} hint={t('vllm.baseUrlDesc')} compact>
        <Input
          type="text"
          value={baseUrlInput}
          onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('vllm.baseUrlPlaceholder')}
          className="py-1.5"
        />
      </FormField>

      <FormField label={t('chat.apiKey')} compact>
        <Input
          type="password"
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : '...'}
          className="py-1.5"
        />
      </FormField>

      <div className="flex items-center gap-2">
        {hasChanges && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0"
          >
            {saving ? '...' : t('settings.save')}
          </button>
        )}
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
        >
          {testing ? t('vllm.testing') : t('vllm.testConnection')}
        </button>
        {testResult && (
          <span className={`text-xs ${testResult.ok ? 'text-accent' : 'text-error'}`}>
            {testResult.ok
              ? `${t('vllm.connected')} (${testResult.model_count} models)`
              : `${t('vllm.connectionFailed')}: ${testResult.error}`}
          </span>
        )}
      </div>

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

function DeepSeekCard({ t }: { t: TFunc }) {
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/deepseek',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['deepseek.base_url'] || ''
  const isConfigured = keyStatus?.configured

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['deepseek.base_url'] || '')
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
        promises.push(apiPost('/api/settings/api-keys/deepseek', { apiKey: apiKeyInput }))
      }
      if (baseUrlInput !== savedBaseUrl) {
        promises.push(apiPatch('/api/settings/preferences', { 'deepseek.base_url': baseUrlInput || '' }))
      }
      await Promise.all(promises)
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      showMessage(t('deepseek.apiKeySaved'), 'success')
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
      await apiPost('/api/settings/api-keys/deepseek', { apiKey: '' })
      void mutateKeyStatus()
      setApiKeyInput('')
      showMessage(t('deepseek.apiKeyDeleted'), 'success')
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
      const res = await fetcher('/api/settings/deepseek/status') as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  const hasChanges = !!apiKeyInput || baseUrlInput !== savedBaseUrl

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2 min-h-[3rem]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isConfigured ? 'bg-success' : 'bg-error'}`} />
          <span className="text-sm font-medium text-text select-none">{t(PROVIDER_LABELS['deepseek'])}</span>
          <span className="text-xs text-muted select-none">
            {isConfigured ? t('chat.apiKeyConfigured') : t('chat.apiKeyNotSet')}
          </span>
        </div>
        {isConfigured && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-3 py-1 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
          >
            {t('chat.apiKeyDelete')}
          </button>
        )}
      </div>

      {!isConfigured && (
        <FormField label={t('chat.apiKey')} compact>
          <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="sk-..."
            className="flex-1 py-1.5"
          />
          </div>
        </FormField>
      )}

      {isConfigured && (
        <FormField label={t('chat.apiKey')} compact>
          <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="••••••••"
            className="flex-1 py-1.5"
          />
          </div>
        </FormField>
      )}

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-1 text-[11px] text-muted hover:text-text transition-colors select-none"
        >
          <ChevronDown size={12} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          {t('anthropic.advanced')}
        </button>
        {advancedOpen && (
          <div className="mt-1.5">
            <FormField label={t('anthropic.baseUrl')} hint={t('anthropic.baseUrlDesc')} compact>
              <Input
                type="text"
                value={baseUrlInput}
                onChange={e => setBaseUrlInput(e.target.value)}
                placeholder={t('anthropic.baseUrlPlaceholder')}
                className="py-1.5"
              />
            </FormField>
          </div>
        )}
      </div>

      {(hasChanges || isConfigured) && (
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0"
            >
              {saving ? '...' : t('settings.save')}
            </button>
          )}
          {isConfigured && (
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
            >
              {testing ? t('deepseek.testing') : t('deepseek.testConnection')}
            </button>
          )}
          {testResult && (
            <span className={`text-xs ${testResult.ok ? 'text-accent' : 'text-error'}`}>
              {testResult.ok
                ? `${t('deepseek.connected')} (${testResult.model_count} models)`
                : `${t('deepseek.connectionFailed')}: ${testResult.error}`}
            </span>
          )}
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

function MimoCard({ t }: { t: TFunc }) {
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
  const [advancedOpen, setAdvancedOpen] = useState(false)

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
      await apiPost('/api/settings/api-keys/mimo', { apiKey: '' })
      void mutateKeyStatus()
      setApiKeyInput('')
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

  const hasChanges = !!apiKeyInput || baseUrlInput !== savedBaseUrl

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2 min-h-[3rem]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isConfigured ? 'bg-success' : 'bg-error'}`} />
          <span className="text-sm font-medium text-text select-none">{t(PROVIDER_LABELS['mimo'])}</span>
          <span className="text-xs text-muted select-none">
            {isConfigured ? t('chat.apiKeyConfigured') : t('chat.apiKeyNotSet')}
          </span>
        </div>
        {isConfigured && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-3 py-1 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
          >
            {t('chat.apiKeyDelete')}
          </button>
        )}
      </div>

      {!isConfigured && (
        <FormField label={t('chat.apiKey')} compact>
          <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="..."
            className="flex-1 py-1.5"
          />
          </div>
        </FormField>
      )}

      {isConfigured && (
        <FormField label={t('chat.apiKey')} compact>
          <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="••••••••"
            className="flex-1 py-1.5"
          />
          </div>
        </FormField>
      )}

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-1 text-[11px] text-muted hover:text-text transition-colors select-none"
        >
          <ChevronDown size={12} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          {t('anthropic.advanced')}
        </button>
        {advancedOpen && (
          <div className="mt-1.5">
            <FormField label={t('anthropic.baseUrl')} hint={t('anthropic.baseUrlDesc')} compact>
              <Input
                type="text"
                value={baseUrlInput}
                onChange={e => setBaseUrlInput(e.target.value)}
                placeholder={t('anthropic.baseUrlPlaceholder')}
                className="py-1.5"
              />
            </FormField>
          </div>
        )}
      </div>

      {(hasChanges || isConfigured) && (
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0"
            >
              {saving ? '...' : t('settings.save')}
            </button>
          )}
          {isConfigured && (
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
            >
              {testing ? t('mimo.testing') : t('mimo.testConnection')}
            </button>
          )}
          {testResult && (
            <span className={`text-xs ${testResult.ok ? 'text-accent' : 'text-error'}`}>
              {testResult.ok
                ? `${t('mimo.connected')} (${testResult.model_count} models)`
                : `${t('mimo.connectionFailed')}: ${testResult.error}`}
            </span>
          )}
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

function CustomCard({ t }: { t: TFunc }) {
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/custom',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['custom.base_url'] || ''
  const savedName = prefs?.['custom.name'] || ''
  const isConfigured = keyStatus?.configured

  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; model_count?: number; error?: string } | null>(null)

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['custom.base_url'] || '')
    setNameInput(prefs['custom.name'] || '')
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
        apiPatch('/api/settings/preferences', {
          'custom.base_url': baseUrlInput || '',
          'custom.name': nameInput || '',
        }),
      ]
      if (apiKeyInput) {
        promises.push(apiPost('/api/settings/api-keys/custom', { apiKey: apiKeyInput }))
      }
      await Promise.all(promises)
      void mutatePrefs()
      void mutateKeyStatus()
      setApiKeyInput('')
      showMessage(t('custom.settingsSaved'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, baseUrlInput, apiKeyInput, nameInput, mutatePrefs, mutateKeyStatus, t])

  const handleDeleteKey = useCallback(async () => {
    if (saving) return
    setSaving(true)
    try {
      await apiPost('/api/settings/api-keys/custom', { apiKey: '' })
      void mutateKeyStatus()
      showMessage(t('custom.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }, [saving, mutateKeyStatus, t])

  const handleTest = useCallback(async () => {
    if (testing) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetcher('/api/settings/custom/status') as { ok: boolean; model_count?: number; error?: string }
      setTestResult(res)
    } catch {
      setTestResult({ ok: false, error: 'Request failed' })
    } finally {
      setTesting(false)
    }
  }, [testing])

  const hasChanges = baseUrlInput !== savedBaseUrl || nameInput !== savedName || !!apiKeyInput

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border min-h-[3rem] space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${testResult?.ok ? 'bg-success' : savedBaseUrl ? 'bg-warning' : 'bg-muted'}`} />
          <span className="text-sm font-medium text-text select-none">{t('provider.custom')}</span>
        </div>
        {isConfigured && (
          <button
            type="button"
            onClick={handleDeleteKey}
            disabled={saving}
            className="px-3 py-1 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
          >
            {t('chat.apiKeyDelete')}
          </button>
        )}
      </div>

      <FormField label={t('custom.baseUrl')} hint={t('custom.baseUrlDesc')} compact>
        <Input
          type="text"
          value={baseUrlInput}
          onChange={e => setBaseUrlInput(e.target.value)}
          placeholder={t('custom.baseUrlPlaceholder')}
          className="py-1.5"
        />
      </FormField>

      <FormField label={t('custom.displayName')} hint={t('custom.displayNameDesc')} compact>
        <Input
          type="text"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          placeholder={t('custom.displayNamePlaceholder')}
          className="py-1.5"
        />
      </FormField>

      <FormField label={t('chat.apiKey')} compact>
        <Input
          type="password"
          value={apiKeyInput}
          onChange={e => setApiKeyInput(e.target.value)}
          placeholder={isConfigured ? '••••••••' : '...'}
          className="py-1.5"
        />
      </FormField>

      <div className="flex items-center gap-2">
        {hasChanges && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0"
          >
            {saving ? '...' : t('settings.save')}
          </button>
        )}
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="px-3 py-1.5 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
        >
          {testing ? t('custom.testing') : t('custom.testConnection')}
        </button>
        {testResult && (
          <span className={`text-xs ${testResult.ok ? 'text-accent' : 'text-error'}`}>
            {testResult.ok
              ? `${t('custom.connected')} (${testResult.model_count} models)`
              : `${t('custom.connectionFailed')}: ${testResult.error}`}
          </span>
        )}
      </div>

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}

function AnthropicCard({ t }: { t: TFunc }) {
  const { data: keyStatus, mutate: mutateKeyStatus } = useSWR<{ configured: boolean }>(
    '/api/settings/api-keys/anthropic',
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: prefs, mutate: mutatePrefs } = useSWR<Record<string, string | null>>(
    '/api/settings/preferences',
    fetcher,
    { revalidateOnFocus: false },
  )

  const savedBaseUrl = prefs?.['anthropic.base_url'] || ''
  const isConfigured = keyStatus?.configured

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [baseUrlInput, setBaseUrlInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (!prefs || initialized) return
    setBaseUrlInput(prefs['anthropic.base_url'] || '')
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
        promises.push(apiPost('/api/settings/api-keys/anthropic', { apiKey: apiKeyInput }))
      }
      if (baseUrlInput !== savedBaseUrl) {
        promises.push(apiPatch('/api/settings/preferences', { 'anthropic.base_url': baseUrlInput || '' }))
      }
      await Promise.all(promises)
      void mutateKeyStatus()
      void mutatePrefs()
      setApiKeyInput('')
      showMessage(t('anthropic.settingsSaved'), 'success')
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
      await apiPost('/api/settings/api-keys/anthropic', { apiKey: '' })
      void mutateKeyStatus()
      setApiKeyInput('')
      showMessage(t('anthropic.apiKeyDeleted'), 'success')
    } catch (err: unknown) {
      showMessage(err instanceof Error ? err.message : 'Delete failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const hasChanges = !!apiKeyInput || baseUrlInput !== savedBaseUrl

  return (
    <div className="p-3 rounded-lg bg-bg-card border border-border space-y-2 min-h-[3rem]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${isConfigured ? 'bg-success' : 'bg-error'}`} />
          <span className="text-sm font-medium text-text select-none">{t(PROVIDER_LABELS['anthropic'])}</span>
          <span className="text-xs text-muted select-none">
            {isConfigured ? t('chat.apiKeyConfigured') : t('chat.apiKeyNotSet')}
          </span>
        </div>
        {isConfigured && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving}
            className="px-3 py-1 text-xs rounded-lg border border-border text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-50 select-none"
          >
            {t('chat.apiKeyDelete')}
          </button>
        )}
      </div>

      {!isConfigured && (
        <FormField label={t('chat.apiKey')} compact>
          <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="sk-ant-..."
            className="flex-1 py-1.5"
          />
          </div>
        </FormField>
      )}

      {isConfigured && (
        <FormField label={t('chat.apiKey')} compact>
          <div className="flex items-center gap-2">
          <Input
            type="password"
            value={apiKeyInput}
            onChange={e => setApiKeyInput(e.target.value)}
            placeholder="••••••••"
            className="flex-1 py-1.5"
          />
          </div>
        </FormField>
      )}

      <div>
        <button
          type="button"
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-1 text-[11px] text-muted hover:text-text transition-colors select-none"
        >
          <ChevronDown size={12} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          {t('anthropic.advanced')}
        </button>
        {advancedOpen && (
          <div className="mt-1.5">
            <FormField label={t('anthropic.baseUrl')} hint={t('anthropic.baseUrlDesc')} compact>
              <Input
                type="text"
                value={baseUrlInput}
                onChange={e => setBaseUrlInput(e.target.value)}
                placeholder={t('anthropic.baseUrlPlaceholder')}
                className="py-1.5"
              />
            </FormField>
          </div>
        )}
      </div>

      {hasChanges && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-text hover:opacity-90 transition-opacity disabled:opacity-50 select-none shrink-0"
          >
            {saving ? '...' : t('settings.save')}
          </button>
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.type === 'error' ? 'text-error' : 'text-accent'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
